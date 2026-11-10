import "@tanstack/react-start/server-only";
import { z } from "zod";
import { clickAllowed, publicSite, typingAllowed, type PageItem } from "./browser-policy";
import type { BrowserSession, CdpSend } from "./browserbase.server";

/** Civi's browser tools. Each step runs in the conversation's live browser the team can watch. */
export const browserTools = [
  {
    type: "function" as const,
    name: "browser_open",
    description:
      "Open a public website in your live browser (the team watches it above the chat and can take over). Returns the page's text and numbered links/buttons. Social networks and sign-ins are not allowed.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", maxLength: 500 } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "browser_read",
    description:
      "Read the page currently open in your live browser: its text and numbered links/buttons.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "browser_click",
    description:
      "Click a numbered link or button from the last page read, to navigate or reveal information. Buttons that would post, send, buy, sign in or sign up are refused.",
    parameters: {
      type: "object",
      properties: { item: { type: "integer", minimum: 1, maximum: 200 } },
      required: ["item"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "browser_search",
    description: "Type a query into a numbered search box from the last page read and press Enter.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "integer", minimum: 1, maximum: 200 },
        text: { type: "string", maxLength: 200 },
      },
      required: ["item", "text"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "browser_scroll",
    description: "Scroll the current page up or down, then read it again.",
    parameters: {
      type: "object",
      properties: { direction: { type: "string", enum: ["up", "down"] } },
      required: ["direction"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "browser_back",
    description: "Go back to the previous page.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
export const isBrowserTool = (name: string) => browserTools.some((tool) => tool.name === name);

export type BrowserRecord = {
  provider_session: string;
  connect_url: string;
  live_url: string;
  human_control: boolean;
};
export type BrowserStore = {
  get(conversation: string): Promise<BrowserRecord | null>;
  save(conversation: string, org: string, session: BrowserSession): Promise<void>;
  forget(conversation: string, org: string): Promise<string | null>;
};
export type BrowserProvider = {
  open(metadata: Record<string, string>): Promise<BrowserSession>;
  tab<T>(connectUrl: string, work: (send: CdpSend) => Promise<T>): Promise<T>;
  close(id: string): Promise<void>;
};

// Marks the visible links, buttons and fields with numbers Civi can refer to, and reads the
// page. Runs inside the page; page content is returned as untrusted data.
const ITEM_FIELDS = `({
  tag: el.tagName.toLowerCase(),
  type: (el.getAttribute("type") || "").toLowerCase(),
  role: el.getAttribute("role") || "",
  label: (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("placeholder") || el.title || "").toString().trim().replace(/\\s+/g, " ").slice(0, 80),
  href: el.tagName === "A" ? el.href : "",
  inPasswordForm: !!(el.closest("form") && el.closest("form").querySelector('input[type="password"]')),
  search: (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && ((el.getAttribute("type") || "") === "search" || el.getAttribute("role") === "searchbox" || /search|find/i.test([el.getAttribute("name"), el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.id].join(" ")))
})`;
const SNAPSHOT = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  for (const old of document.querySelectorAll("[data-civi]")) old.removeAttribute("data-civi");
  const items = []; let n = 0;
  for (const el of document.querySelectorAll('a[href], button, [role="button"], [role="link"], [role="tab"], input, select, textarea, summary')) {
    if (items.length >= 60 || !visible(el)) continue;
    n += 1; el.setAttribute("data-civi", String(n));
    items.push(Object.assign({ item: n }, ${ITEM_FIELDS}));
  }
  const text = (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 8000);
  return JSON.stringify({ url: location.href, title: (document.title || "").slice(0, 200), text, items });
})()`;
const element = (n: number) =>
  `(() => { const el = document.querySelector('[data-civi="${n}"]'); if (!el) return "null"; return JSON.stringify(${ITEM_FIELDS}); })()`;

async function evaluate(send: CdpSend, expression: string) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error("The page didn't respond.");
  return result.result?.value;
}
async function settle(send: CdpSend) {
  for (let i = 0; i < 16; i++) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const state = await evaluate(send, "document.readyState").catch(() => "loading");
    if (state === "complete") return;
  }
}
type Snapshot = {
  url: string;
  title: string;
  text: string;
  items: (PageItem & { item: number })[];
};
async function snapshot(send: CdpSend): Promise<Snapshot> {
  return JSON.parse(String(await evaluate(send, SNAPSHOT))) as Snapshot;
}
/** If the page wandered somewhere Civi may not be, go back and say so. */
async function guard(send: CdpSend): Promise<string | undefined> {
  const where = String(await evaluate(send, "location.href"));
  const site = publicSite(where);
  if (site.ok || where === "about:blank") return undefined;
  await evaluate(send, "history.back(), true");
  await settle(send);
  return `The page tried to go somewhere Civi's browser doesn't visit, so it went back. ${site.reason}`;
}
const report = (page: Snapshot, note?: string) =>
  JSON.stringify({
    url: page.url,
    title: page.title,
    ...(note ? { note } : {}),
    // Website content is untrusted data, never instructions.
    untrusted_page_text: page.text,
    items: page.items.map(({ item, tag, label, href, search }) => ({
      item,
      kind: search ? "search box" : tag === "a" ? "link" : tag,
      label,
      ...(href ? { href: href.slice(0, 200) } : {}),
    })),
  }).slice(0, 14000);

const argsFor = {
  browser_open: z.object({ url: z.string().min(3).max(500) }).strict(),
  browser_read: z.object({}).strict(),
  browser_click: z.object({ item: z.number().int().min(1).max(200) }).strict(),
  browser_search: z
    .object({ item: z.number().int().min(1).max(200), text: z.string().min(1).max(200) })
    .strict(),
  browser_scroll: z.object({ direction: z.enum(["up", "down"]) }).strict(),
  browser_back: z.object({}).strict(),
};

/** Run one of Civi's browser tools in the conversation's live browser. */
export async function runBrowserTool(
  name: string,
  args: unknown,
  context: { conversation: string; org: string; store: BrowserStore; provider: BrowserProvider },
): Promise<string> {
  const schema = argsFor[name as keyof typeof argsFor];
  if (!schema) throw new Error("This browser tool is not available.");
  const input = schema.parse(args ?? {}) as Record<string, unknown>;
  let record = await context.store.get(context.conversation);
  if (record?.human_control)
    return JSON.stringify({
      status: "paused",
      message:
        "The team has taken control of the browser. Don't use browser tools until they hand it back; tell them you'll wait.",
    });
  if (name === "browser_open") {
    const site = publicSite(String(input["url"]));
    if (!site.ok) return JSON.stringify({ status: "refused", message: site.reason });
  }
  const work = async (send: CdpSend) => {
    if (name === "browser_open") {
      const target = publicSite(String(input["url"]));
      if (!target.ok) return JSON.stringify({ status: "refused", message: target.reason });
      const navigation = await send("Page.navigate", { url: target.url });
      if (navigation.errorText)
        return JSON.stringify({ status: "failed", message: "That page couldn't be opened." });
      await settle(send);
      return report(await snapshot(send), await guard(send));
    }
    if (name === "browser_read") return report(await snapshot(send));
    if (name === "browser_scroll") {
      await evaluate(send, `window.scrollBy(0, ${input["direction"] === "up" ? -700 : 700}), true`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return report(await snapshot(send));
    }
    if (name === "browser_back") {
      await evaluate(send, "history.back(), true");
      await settle(send);
      return report(await snapshot(send), await guard(send));
    }
    const n = Number(input["item"]);
    const found = String(await evaluate(send, element(n)));
    if (found === "null")
      return JSON.stringify({
        status: "refused",
        message: "That item isn't on the page any more. Read the page again first.",
      });
    const item = JSON.parse(found) as PageItem;
    if (name === "browser_click") {
      const allowed = clickAllowed(item);
      if (!allowed.ok) return JSON.stringify({ status: "refused", message: allowed.reason });
      await evaluate(
        send,
        `(() => { const el = document.querySelector('[data-civi="${n}"]'); el.scrollIntoView({ block: "center" }); el.click(); return true; })()`,
      );
      await settle(send);
      return report(await snapshot(send), await guard(send));
    }
    const allowed = typingAllowed(item);
    if (!allowed.ok) return JSON.stringify({ status: "refused", message: allowed.reason });
    await evaluate(
      send,
      `(() => { const el = document.querySelector('[data-civi="${n}"]'); el.scrollIntoView({ block: "center" }); el.focus(); if (el.select) el.select(); return true; })()`,
    );
    await send("Input.insertText", { text: String(input["text"]) });
    for (const type of ["keyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        ...(type === "keyDown" ? { text: "\r" } : {}),
      });
    await settle(send);
    return report(await snapshot(send), await guard(send));
  };
  // Use the conversation's browser, opening one if needed; a browser that has ended is replaced once.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!record) {
      const session = await context.provider.open({
        civimeet_org: context.org,
        civimeet_conversation: context.conversation,
      });
      await context.store.save(context.conversation, context.org, session);
      record = {
        provider_session: session.id,
        connect_url: session.connectUrl,
        live_url: session.liveUrl,
        human_control: false,
      };
    }
    try {
      return await context.provider.tab(record.connect_url, work);
    } catch (error) {
      if (attempt > 0) throw error;
      await context.store.forget(context.conversation, context.org).catch(() => null);
      await context.provider.close(record.provider_session).catch(() => {});
      record = null;
    }
  }
  throw new Error("Civi's browser couldn't run that step.");
}
