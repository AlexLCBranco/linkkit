/**
 * The link a box holds (`MapNode.url`), as typed or pasted into the link
 * field. Pure: no React, no store.
 *
 * Only web addresses are kept: `http:` and `https:`. Anything else with a
 * scheme of its own (`javascript:`, `data:`, `file:`, `mailto:` ...) is
 * refused with a short reason, never opened. An address typed without a
 * scheme ("example.com/page") gets `https://` in front. The same rule runs
 * in the gauntlet whiteboard and in Boardkit (copied from its
 * `domain/url.ts`), so a link behaves the same on every object.
 */

export type UrlCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

/** "name:" at the start, where "name" is a scheme (RFC 3986's letters).
    "localhost:3000" is a host and port, not a scheme: digits after the
    colon don't count. */
const SCHEME = /^([a-z][a-z0-9+.-]*):(?!\d)/i;

export function checkUrl(input: string): UrlCheck {
  const text = input.trim();
  if (!text) return { ok: false, reason: "Type or paste a link." };
  if (/\s/.test(text)) return { ok: false, reason: "A link can't contain spaces." };
  const scheme = SCHEME.exec(text)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    return { ok: false, reason: "Only http and https links are allowed." };
  }
  const full = scheme ? text : `https://${text.replace(/^\/\//, "")}`;
  try {
    const url = new URL(full);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !isHost(url.hostname)) {
      return { ok: false, reason: "That isn't a web address." };
    }
    return { ok: true, url: url.href };
  } catch {
    return { ok: false, reason: "That isn't a web address." };
  }
}

/** A host a link can name: a domain with a dot in it ("example.com"),
    localhost, or an IP address. A lone word ("text") is a typo, not a site. */
const isHost = (host: string) => host.includes(".") || host === "localhost" || host.startsWith("[");

/** Whether a stored value is a link this build would open (a saved map
    is checked on load: a hand-edited `javascript:` never reaches a page). */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const check = checkUrl(value);
  return check.ok && check.url === value;
}
