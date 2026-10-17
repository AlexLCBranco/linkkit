import { describe, expect, it } from "vitest";

import { createBracket } from "../../domain/bracket";
import { bracketDecor } from "../../domain/bracketLayout";
import { asMapId } from "../../domain/ids";
import { layoutMap } from "../../domain/layout";
import { placeOnPage } from "../../domain/page";
import { ARROW_LENGTH_PRESETS } from "../../domain/types";
import { BRACKET_DECOR, layoutOptions, PAGE_MARGIN } from "./layoutConfig";

describe("a bracket on its page", () => {
  it("keeps one paper dot of clear space over its round headings", () => {
    const screen = { width: 1200, height: 400 };
    const map = createBracket(asMapId("b"), "Cup", screen, 16).map;
    const options = layoutOptions(ARROW_LENGTH_PRESETS.medium, "LR", new Map(), "bracket");
    const placed = placeOnPage(layoutMap(map, new Map(), options), screen, PAGE_MARGIN, {
      x: "start",
      y: "start",
    });
    const boxes = new Map([...placed.positions].map(([id, center]) => [id, { center, size: options.fallbackSize }]));
    const heading = bracketDecor(map, boxes, BRACKET_DECOR.gap).headings[0];
    expect(heading.bottom - BRACKET_DECOR.headingHeight).toBe(24);
  });

  it("keeps one paper dot of clear space left of round 1", () => {
    const screen = { width: 1200, height: 400 };
    const map = createBracket(asMapId("b"), "Cup", screen, 16).map;
    const options = layoutOptions(ARROW_LENGTH_PRESETS.medium, "LR", new Map(), "bracket");
    const placed = placeOnPage(layoutMap(map, new Map(), options), screen, PAGE_MARGIN, { x: "start", y: "start" });
    const left = Math.min(...[...placed.positions.values()].map((p) => p.x - options.fallbackSize.width / 2));
    expect(left).toBe(24);
  });
});
