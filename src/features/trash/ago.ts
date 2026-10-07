// English, like every other word in the app (Treekit follows the browser's
// language, which mixed languages on one line).
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 minutes ago", "yesterday": the largest unit that is at least one
    (Treekit's). */
export function ago(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return relative.format(0, "second");
}

export const boxes = (n: number) => `${n} ${n === 1 ? "box" : "boxes"}`;

/** "'Rent'" or "'Rent' and 3 more boxes": what a delete took. */
export function described(name: string, count: number): string {
  const first = `“${name || "Untitled"}”`;
  return count > 1 ? `${first} and ${boxes(count - 1).replace(/box(es)?$/, (w) => `more ${w}`)}` : first;
}
