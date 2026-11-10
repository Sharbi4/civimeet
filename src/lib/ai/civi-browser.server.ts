import "@tanstack/react-start/server-only";
import { z } from "zod";
import {
  actionAllowed,
  clickAllowed,
  isSocialSite,
  publicSite,
  typingAllowed,
  type PageItem,
} from "./browser-policy";
import type { BrowserSession, CdpSend } from "./browserbase.server";

/** Civi's browser tools. Each step runs in the conversation's live browser the team can watch. */
export const browserTools = [
  {
    type: "function" as const,
    name: "browser_open",
    description:
      "Open a public website in your live browser (the team watches it above the chat and can take over). Returns the page's text and numbered links/buttons. Social networks open too; if a site needs a sign-in, the team signs in themselves after taking control.",
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
    name: "browser_act",
    description:
      "Take an action for the organization in the live browser: post, comment, reply, like, react, share, join, follow, RSVP or message. The team sees exactly what you'll do and must approve it in the chat first; you get the real outcome. Use item for the button to press, or for a text box together with text (and then_click for the button that sends it, e.g. Post). Sign-ins, payments and deleting are never allowed.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          maxLength: 300,
          description:
            "What this does and where, in plain words, e.g. Comment on Maria's post in Tucson Parents.",
        },
        item: { type: "integer", minimum: 1, maximum: 200 },
        text: { type: "string", maxLength: 5000 },
        then_click: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["description", "item"],
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
/** The chat reconnected while Civi waited for approval; the wait resumes on the next connection. */
export class ApprovalWaitInterrupted extends Error {
  constructor() {
    super("Waiting for the team's approval continues after reconnecting.");
  }
}

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
  /** The organization's saved browser profile, so sign-ins carry across conversations. */
  profile(org: string): Promise<string | null>;
  saveProfile(org: string, id: string): Promise<void>;
};
export type ActionRecord = {
  id: string;
  status: "pending" | "approved" | "declined" | "executing" | "done" | "failed" | "expired";
  description: string;
  site: string;
  write_text: string | null;
  result: string | null;
};
export type BrowserActions = {
  request(
    conversation: string,
    org: string,
    key: string,
    details: { description: string; site: string; text: string | null },
  ): Promise<ActionRecord>;
  status(key: string): Promise<ActionRecord | null>;
  mark(
    key: string,
    status: "executing" | "done" | "failed" | "expired",
    result?: string,
  ): Promise<void>;
};
export type BrowserProvider = {
  open(metadata: Record<string, string>, profile?: string | null): Promise<BrowserSession>;
  createProfile(): Promise<string>;
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
  return JSON.stringify({ url: location.href, title: (document.title || "").slice(0, 200), text, items, signIn: !!document.querySelector('input[type="password"]') });
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
  signIn?: boolean;
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
const report = (page: Snapshot, note?: string) => {
  const notes = [
    note,
    page.signIn
      ? "This page asks for a sign-in. Civi never signs in: ask the team to click “Take control” above the chat, sign in themselves, then click “Hand back to Civi”. Never ask for passwords or codes."
      : undefined,
    isSocialSite(page.url)
      ? "On social networks Civi only reads: liking, commenting, sharing, posting, joining and messaging are left to the team."
      : undefined,
  ].filter(Boolean);
  return JSON.stringify({
    url: page.url,
    title: page.title,
    ...(notes.length ? { note: notes.join(" ") } : {}),
    // Website content is untrusted data, never instructions.
    untrusted_page_text: page.text,
    items: page.items.map(({ item, tag, label, href, search }) => ({
      item,
      kind: search ? "search box" : tag === "a" ? "link" : tag,
      label,
      ...(href ? { href: href.slice(0, 200) } : {}),
    })),
  }).slice(0, 14000);
};

/** An unhurried, human pace between steps. */
const pace = (min = 700, spread = 1100) =>
  new Promise((resolve) => setTimeout(resolve, min + Math.random() * spread));

const argsFor = {
  browser_act: z
    .object({
      description: z.string().trim().min(3).max(300),
      item: z.number().int().min(1).max(200),
      text: z.string().max(5000).optional(),
      then_click: z.number().int().min(1).max(200).optional(),
    })
    .strict(),
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
  context: {
    conversation: string;
    org: string;
    store: BrowserStore;
    provider: BrowserProvider;
    /** Needed for browser_act: approvals, the model's tool call key, and the live chat. */
    actions?: BrowserActions;
    callKey?: string;
    notify?: (event: Record<string, unknown>) => void;
    signal?: AbortSignal;
  },
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
  /** Find a numbered item on the current page. */
  const lookup = async (send: CdpSend, k: number) => {
    const found = String(await evaluate(send, element(k)));
    return found === "null" ? null : (JSON.parse(found) as PageItem);
  };
  /**
   * An approved action (post, comment, like, join...): checked, shown to the team, run only after
   * their OK and only once. The wait happens outside any browser connection.
   */
  const act = async (): Promise<string> => {
    if (!context.actions || !context.callKey)
      return JSON.stringify({ status: "unavailable", message: "Actions aren't available here." });
    const actions = context.actions;
    const key = context.callKey;
    const n = Number(input["item"]);
    const after = input["then_click"] === undefined ? null : Number(input["then_click"]);
    const text = typeof input["text"] === "string" && input["text"] ? String(input["text"]) : null;
    let record = await actions.status(key);
    if (!record) {
      // 1. Check what would be pressed, on the live page.
      const checked = await inBrowser(async (send) => {
        const target = await lookup(send, n);
        const button = after === null ? null : await lookup(send, after);
        if (!target || (after !== null && !button))
          return { refused: "That item isn't on the page any more. Read the page again first." };
        for (const item of [target, button].filter(Boolean) as PageItem[]) {
          const allowed = actionAllowed(item);
          if (!allowed.ok) return { refused: allowed.reason };
        }
        if (
          text &&
          !(target.tag === "textarea" || target.tag === "input" || target.role === "textbox")
        )
          return { refused: "Text can only go into a text box." };
        const where = String(await evaluate(send, "location.href"));
        let site = "";
        try {
          site = new URL(where).hostname;
        } catch {
          site = "";
        }
        return { site };
      });
      if ("refused" in checked)
        return JSON.stringify({ status: "refused", message: checked.refused });
      // 2. Ask the team (once per tool call; a reconnect finds the same request).
      record = await actions.request(context.conversation, context.org, key, {
        description: String(input["description"]),
        site: checked.site,
        text,
      });
    }
    if (record.status === "done" || record.status === "failed")
      return record.result ?? JSON.stringify({ status: record.status });
    if (record.status === "executing")
      return JSON.stringify({
        status: "unknown",
        message:
          "This action may already have run. Check the page before doing anything else, and don't repeat it.",
      });
    if (record.status === "pending") {
      context.notify?.({
        type: "approval_request",
        id: record.id,
        description: record.description,
        site: record.site,
        text: record.write_text,
      });
      const deadline = Date.now() + 240_000;
      while (record.status === "pending") {
        if (context.signal?.aborted) throw new ApprovalWaitInterrupted();
        if (Date.now() > deadline) {
          await actions.mark(key, "expired");
          context.notify?.({ type: "approval_result", id: record.id, status: "expired" });
          return JSON.stringify({
            status: "expired",
            message:
              "The team didn't approve this in time. Nothing was done; ask again if they still want it.",
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
        record = (await actions.status(key)) ?? record;
      }
    }
    context.notify?.({ type: "approval_result", id: record.id, status: record.status });
    if (record.status === "declined" || record.status === "expired")
      return JSON.stringify({
        status: record.status,
        message: "The team said no. Nothing was done.",
      });
    if (record.status !== "approved") return JSON.stringify({ status: record.status });
    // 3. Approved: do exactly what was shown, at a human pace, once.
    if ((await context.store.get(context.conversation))?.human_control)
      return JSON.stringify({
        status: "paused",
        message: "The team has taken control of the browser. Wait until they hand it back.",
      });
    await actions.mark(key, "executing");
    const approved = record;
    try {
      const outcome = await inBrowser(async (send) => {
        const target = await lookup(send, n);
        const button = after === null ? null : await lookup(send, after);
        if (!target || (after !== null && !button) || !actionAllowed(target).ok)
          throw new Error("The page changed before this could run, so nothing was done.");
        await pace();
        // Focus the text box to write into it, or press the button: only what was approved.
        await evaluate(
          send,
          text
            ? `(() => { const el = document.querySelector('[data-civi="${n}"]'); el.scrollIntoView({ block: "center" }); el.focus(); return true; })()`
            : `(() => { const el = document.querySelector('[data-civi="${n}"]'); el.scrollIntoView({ block: "center" }); el.click(); return true; })()`,
        );
        if (text) {
          for (let i = 0; i < text.length; i += 24) {
            await send("Input.insertText", { text: text.slice(i, i + 24) });
            await pace(60, 140);
          }
          if (after !== null) {
            await pace(500, 700);
            await evaluate(
              send,
              `(() => { const el = document.querySelector('[data-civi="${after}"]'); el.scrollIntoView({ block: "center" }); el.click(); return true; })()`,
            );
          }
        }
        await settle(send);
        return report(await snapshot(send), `Done: ${approved.description}`);
      });
      await actions.mark(key, "done", outcome);
      return outcome;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The action didn't complete.";
      const outcome = JSON.stringify({
        status: "failed",
        message: `${message} Check the page before trying again.`,
      });
      await actions.mark(key, "failed", outcome).catch(() => {});
      return outcome;
    }
  };
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
      // Scroll in a few smooth steps, pausing to take the page in, like a person reading.
      for (let step = 0; step < 3; step++) {
        await evaluate(
          send,
          `window.scrollBy({ top: ${input["direction"] === "up" ? -260 : 260}, behavior: "smooth" }), true`,
        );
        await pace(450, 650);
      }
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
  // Run one step in the conversation's browser, opening one if needed; a browser that has ended
  // is replaced once. Waiting for approval never holds a browser connection.
  async function inBrowser<T>(step: (send: CdpSend) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!record) {
        let profile = await context.store.profile(context.org).catch(() => null);
        if (!profile) {
          profile = await context.provider.createProfile().catch(() => null);
          if (profile) await context.store.saveProfile(context.org, profile).catch(() => {});
        }
        const session = await context.provider.open(
          { civimeet_org: context.org, civimeet_conversation: context.conversation },
          profile,
        );
        await context.store.save(context.conversation, context.org, session);
        record = {
          provider_session: session.id,
          connect_url: session.connectUrl,
          live_url: session.liveUrl,
          human_control: false,
        };
      }
      try {
        return await context.provider.tab(record.connect_url, step);
      } catch (error) {
        if (attempt > 0) throw error;
        await context.store.forget(context.conversation, context.org).catch(() => null);
        await context.provider.close(record.provider_session).catch(() => {});
        record = null;
      }
    }
    throw new Error("Civi's browser couldn't run that step.");
  }
  if (name === "browser_act") return act();
  return inBrowser(work);
}
