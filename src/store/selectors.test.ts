import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "../domain/ids";
import { build } from "../domain/testMaps";
import { selectLinkHighlight, selectNodeHighlight, selectReach } from "./selectors";

// a needs b, b needs c; d needs a; e stands alone.
const map = build(["a", "b", "c", "d", "e"], [["a", "b"], ["b", "c"], ["d", "a"]]);
const id = asNodeId;

describe("highlight selectors", () => {
  it("highlights nothing while nothing is selected", () => {
    const s = { map, selected: null };
    expect(selectReach(s)).toBeNull();
    expect(selectNodeHighlight(s, id("a"))).toBeNull();
    expect(selectLinkHighlight(s, asLinkId("a>b"))).toBeNull();
  });

  it("gives each box and arrow its own highlight", () => {
    const s = { map, selected: id("b") };
    expect(selectNodeHighlight(s, id("b"))).toBe("selected");
    expect(selectNodeHighlight(s, id("c"))).toBe("teal");
    expect(selectNodeHighlight(s, id("a"))).toBe("orange");
    expect(selectNodeHighlight(s, id("d"))).toBe("orange");
    expect(selectNodeHighlight(s, id("e"))).toBe("faded");
    expect(selectLinkHighlight(s, asLinkId("b>c"))).toBe("teal");
    expect(selectLinkHighlight(s, asLinkId("d>a"))).toBe("orange");
  });

  it("works the reach out once per map and selection", () => {
    const s = { map, selected: id("a") };
    const first = selectReach(s);
    expect(selectReach({ map, selected: id("a") })).toBe(first);
    expect(selectReach({ map, selected: id("b") })).not.toBe(first);
  });

  it("highlights nothing when the selected box no longer exists", () => {
    const s = { map, selected: id("gone") };
    expect(selectReach(s)).toBeNull();
    expect(selectNodeHighlight(s, id("a"))).toBeNull();
  });
});
