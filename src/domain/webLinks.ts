/**
 * Finding web addresses inside a box's name, so they show as links (owner,
 * 2026-10-23: a pasted address becomes a link in the text). Copied from
 * Boardkit's `domain/links.ts`. Pure: no React, no store -- the component
 * layer turns these segments into elements. ("Links" in the rest of
 * Linkkit are its arrows; these are web addresses.)
 */

export type TextSegment =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "link"; readonly text: string; readonly href: string };

/** `http(s)://…` or a bare `www.…`, up to the next whitespace or bracket-ish
    quote. The lookbehind stops a match starting mid-word ("xwww.a.com"). */
const CANDIDATE = /(?<![\w@/])(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/** Punctuation that ends a sentence rather than an address. */
const TRAILING = /[.,;:!?]$/;


/**
 * Trims sentence punctuation off the end of a candidate. A closing bracket
 * is dropped only when it has no opener in the match, so "(see x.com)"
 * excludes the ")" but a Wikipedia-style ".../Foo_(bar)" keeps its own.
 */
function trimTrailing(candidate: string): string {
  let end = candidate;
  for (;;) {
    if (TRAILING.test(end)) {
      end = end.slice(0, -1);
    } else if (/[)\]}]$/.test(end) && !isBalanced(end)) {
      end = end.slice(0, -1);
    } else {
      return end;
    }
  }
}

function isBalanced(text: string): boolean {
  const count = (char: string) => text.split(char).length - 1;
  return (
    count(")") <= count("(") && count("]") <= count("[") && count("}") <= count("{")
  );
}

/** The address a match opens, or `null` if it is not a usable web URL.
    Going through `URL` is the safety check: only `http:` and `https:`
    survive, and "https://" or "www." on their own are rejected. */
function toHref(match: string): string | null {
  const href = /^www\./i.test(match) ? `https://${match}` : match;
  try {
    const url = new URL(href);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    return isWeb && url.hostname.includes(".") ? href : null;
  } catch {
    return null;
  }
}

/** Splits `value` into plain-text and link segments; joining every
    segment's `text` gives back `value` exactly. */
export function splitLinks(value: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(CANDIDATE)) {
    const text = trimTrailing(match[0]);
    const href = toHref(text);
    if (href === null) continue;

    const start = match.index;
    if (start > cursor) segments.push({ type: "text", text: value.slice(cursor, start) });
    segments.push({ type: "link", text, href });
    cursor = start + text.length;
  }

  if (cursor < value.length) segments.push({ type: "text", text: value.slice(cursor) });
  return segments;
}
