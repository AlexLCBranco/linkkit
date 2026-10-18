import { describe, expect, it } from "vitest";

import { serializeBackup } from "./backup";
import { heldBackWarning, heldOutcome, readHeld, serializeHeld, takeCopies, withHeld, withHeldBack, withoutHeld, type HeldMap } from "./held";
import { asMapId } from "./ids";
import { build } from "./testMaps";
import type { LinkMap, MapId } from "./types";

const PAGE = { width: 900, height: 560 };
const entry = (id: string, over: Partial<HeldMap> = {}): HeldMap => ({
  id: asMapId(id),
  name: id.toUpperCase(),
  at: 1,
  aside: `linkkit:damaged:${id}:1`,
  repaired: true,
  ...over,
});

describe("the held list", () => {
  it("reads back what it wrote, and drops entries that aren't whole", () => {
    const list = [entry("a"), entry("b", { aside: null, repaired: false })];
    expect(readHeld(JSON.parse(JSON.stringify(serializeHeld(list))))).toEqual(list);
    expect(readHeld({ version: 1, maps: [{ id: "a" }, entry("c"), entry("c")] })).toEqual([entry("c")]);
    expect(readHeld({ version: 2, maps: [entry("a")] })).toEqual([]);
    expect(readHeld(null)).toEqual([]);
  });

  it("keeps the first damage found, but takes a kept-aside original it lacked", () => {
    const first = [entry("a", { at: 1, aside: null })];
    const again = withHeld(first, entry("a", { at: 9, aside: "k" }));
    expect(again).toEqual([entry("a", { at: 1, aside: "k" })]);
    expect(withHeld(again, entry("a", { at: 20, aside: "other" }))).toBe(again);
  });

  it("releases one map and leaves the rest", () => {
    const list = [entry("a"), entry("b")];
    expect(withoutHeld(list, asMapId("a"))).toEqual([entry("b")]);
    expect(withoutHeld(list, asMapId("zz"))).toBe(list);
  });
});

describe("carrying last good copies forward", () => {
  const good = (id: string, name: string): LinkMap => ({ ...build(["x"]), id: asMapId(id), name });

  it("takes each wanted map's newest copy, reading files newest first", () => {
    const found = new Map<MapId, LinkMap>();
    const wanted = new Set([asMapId("a"), asMapId("b")]);
    takeCopies(found, serializeBackup([good("a", "A new"), good("other", "O")], new Date()), wanted, PAGE);
    takeCopies(found, serializeBackup([good("a", "A old"), good("b", "B old")], new Date()), wanted, PAGE);
    takeCopies(found, { not: "a backup" }, wanted, PAGE);
    expect([...found.keys()].sort()).toEqual(["a", "b"]);
    expect(found.get(asMapId("a"))?.name).toBe("A new");
    expect(found.get(asMapId("b"))?.name).toBe("B old");
  });

  it("decides per map: carried, else the repair, else left out", () => {
    const carried = new Set([asMapId("a")]);
    expect(heldOutcome(entry("a"), carried)).toBe("carried");
    expect(heldOutcome(entry("b"), carried)).toBe("repair");
    expect(heldOutcome(entry("c", { repaired: false }), carried)).toBe("left-out");
  });

  it("says what backups do with each held map", () => {
    expect(heldBackWarning([], new Set())).toBeNull();
    const text = heldBackWarning(
      [entry("a"), entry("b"), entry("c", { repaired: false })],
      new Set([asMapId("a")]),
    );
    expect(text).toBe(
      "“A” was damaged, so new backups keep its last backed-up version. " +
        "“B” was damaged and isn't in any earlier backup, so backups keep the repaired version. " +
        "“C” was damaged and isn't in any backup yet, so it's left out. " +
        "Other maps are backed up as usual.",
    );
  });
});

describe("what a backup holds", () => {
  const map = (id: string, name: string): LinkMap => ({ ...build(["x"]), id: asMapId(id), name });

  it("swaps a held map for its copy, keeps a repair with no copy, and adds a copy whose map is gone", () => {
    const maps = [map("a", "A now"), map("b", "B repaired"), map("c", "C")];
    const held = [entry("a"), entry("b"), entry("gone", { repaired: false })];
    const copies = new Map([
      [asMapId("a"), map("a", "A good")],
      [asMapId("gone"), map("gone", "Gone good")],
    ]);
    expect(withHeldBack(maps, held, copies).map((m) => m.name)).toEqual(["A good", "B repaired", "C", "Gone good"]);
  });

  it("changes nothing when nothing is held", () => {
    const maps = [map("a", "A")];
    expect(withHeldBack(maps, [], new Map())).toEqual(maps);
  });
});
