// Civi's browser rules, shared by every browser Civi uses. Web pages and the model's intent are
// untrusted: these checks decide what actually happens.

/** Social networks: open in Civi's browser (the person signs in), but Civi only reads there. */
export const socialDomains = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "threads.net",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "nextdoor.com",
  "reddit.com",
];
export const isSocialSite = (raw: string) => {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return socialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

/** Public http(s) websites, social networks included: no private addresses or other schemes. */
export function publicSite(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return { ok: false, reason: "That isn't a web address." };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["https:", "http:"].includes(url.protocol))
    return { ok: false, reason: "Civi's browser only opens web pages (http or https)." };
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    !host.includes(".")
  )
    return { ok: false, reason: "Civi's browser only opens public websites." };
  if (url.username || url.password)
    return { ok: false, reason: "Addresses with sign-in details aren't allowed." };
  return { ok: true, url: url.href };
}

/** Labels of buttons and links that would act for the organization instead of just looking. */
const consequential =
  /\b(post|publish|send|submit|buy|purchase|pay|checkout|check out|donate|order|place order|add to (cart|bag)|sign ?up|register|rsvp|subscribe|join|apply|book|reserve|confirm|delete|remove|log ?in|sign ?in|log ?out|sign ?out|create account|accept|agree|follow|like|share|comment|reply|upload|message|invite|react|poke|tag|mention|add friend|friend request|connect|vote|upvote|downvote|retweet|repost|pin|save post|going|interested)\b/i;

export type PageItem = {
  tag: string;
  type: string;
  role: string;
  label: string;
  href: string;
  inPasswordForm: boolean;
  search: boolean;
};
/** Whether Civi may click this element (reading and navigating only). */
export function clickAllowed(item: PageItem): { ok: true } | { ok: false; reason: string } {
  if (item.inPasswordForm)
    return { ok: false, reason: "That's part of a sign-in form. Civi never signs in to accounts." };
  if (item.tag === "a" && item.href) {
    const site = publicSite(item.href);
    if (!site.ok) return site;
    if (consequential.test(item.label))
      return {
        ok: false,
        reason: `“${item.label}” would act for you, so Civi left it for a person.`,
      };
    return { ok: true };
  }
  if (item.tag === "input" && ["submit", "image", "reset", "file", "password"].includes(item.type))
    return { ok: false, reason: "Civi doesn't submit forms." };
  if (consequential.test(item.label))
    return {
      ok: false,
      reason: `“${item.label}” would act for you, so Civi left it for a person.`,
    };
  return { ok: true };
}
/** Civi types only into search boxes. */
export function typingAllowed(item: PageItem): { ok: true } | { ok: false; reason: string } {
  if (item.inPasswordForm || item.type === "password")
    return { ok: false, reason: "Civi never types into sign-in forms." };
  if (!item.search) return { ok: false, reason: "Civi only types into search boxes." };
  return { ok: true };
}
