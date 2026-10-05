import { MoveRight } from "lucide-react";
import { Popover } from "radix-ui";
import { useCallback, useRef } from "react";

import { clampArrowLength } from "../../domain/map";
import { ARROW_LENGTH_PRESETS, ARROW_LENGTH_RANGE, type ArrowLengthPreset } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import alignStyles from "./AlignPanel.module.css";
import styles from "./ArrowLengthPanel.module.css";
import { ARROW_WHEEL_PAUSE_MS, ARROW_WHEEL_STEP } from "./layoutConfig";

const PRESETS: { value: ArrowLengthPreset; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

/** Each drag of the slider, or burst of wheel turns, is one gesture: one
    undo step however many times the map is re-tidied along the way. */
let gestures = 0;
const newGesture = () => String(++gestures);

/** A wheel turn in pixels, whatever unit the browser reports it in. */
const wheelPixels = (e: WheelEvent) => e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);

/**
 * How long Tidy up makes the arrows. Three presets, a slider for anything
 * in between (or beyond), and the mouse wheel: scrolling over the "Arrows"
 * button (no need to open it) or the panel stretches the arrows (wheel up)
 * or shrinks them (wheel down), and the map re-tidies as it goes. Picking
 * a preset tidies with a glide; dragging and scrolling move the boxes at
 * once, so they keep up with the hand. Saved with the map, and each click,
 * drag or burst of scrolling is one undo step.
 */
export function ArrowLengthPanel() {
  const arrowLength = useMapStore((s) => s.map.arrowLength);
  const requestTidy = useMapStore((s) => s.requestTidy);
  const sliderGesture = useRef("");

  // A native listener: React's wheel handlers can't stop the page from
  // scrolling (they are passive). React 19 calls the returned cleanup.
  const wheelRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    let gesture = "";
    let last = -Infinity;
    let carry = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - last > ARROW_WHEEL_PAUSE_MS) {
        gesture = newGesture();
        carry = 0;
      }
      last = now;
      // Wheel up (negative deltaY) lengthens. Fractions carry over, so a
      // trackpad's many small turns add up smoothly.
      carry -= (wheelPixels(e) / 100) * ARROW_WHEEL_STEP;
      const whole = Math.trunc(carry);
      if (whole === 0) return;
      carry -= whole;
      const s = useMapStore.getState();
      const next = clampArrowLength(s.map.arrowLength + whole);
      if (next !== s.map.arrowLength) s.requestTidy({ arrowLength: next }, gesture);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <Popover.Root>
      <Popover.Trigger
        ref={wheelRef}
        className={`${alignStyles.trigger} ${styles.trigger}`}
        title="Arrow length: click for choices, or scroll the mouse wheel here to stretch or shrink the arrows"
      >
        <MoveRight size={16} className={styles.icon} aria-hidden />
        <span className={styles.word}>Arrows</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content ref={wheelRef} className={alignStyles.panel} align="start" sideOffset={6}>
          <div className={alignStyles.title}>Arrow length</div>
          <div className={styles.list} role="radiogroup" aria-label="Arrow length presets">
            {PRESETS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={arrowLength === ARROW_LENGTH_PRESETS[value]}
                title={`Tidy up with ${label.toLowerCase()} arrows`}
                className={styles.option}
                onClick={() => requestTidy({ arrowLength: ARROW_LENGTH_PRESETS[value] })}
              >
                <span className={styles.arrow} data-length={value} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <input
            type="range"
            className={styles.slider}
            aria-label="Arrow length"
            title="Drag (or scroll) to make the arrows any length"
            min={ARROW_LENGTH_RANGE.min}
            max={ARROW_LENGTH_RANGE.max}
            step={1}
            value={arrowLength}
            list="arrow-length-presets"
            onPointerDown={() => (sliderGesture.current = newGesture())}
            onKeyDown={() => (sliderGesture.current = newGesture())}
            onChange={(e) => requestTidy({ arrowLength: Number(e.target.value) }, sliderGesture.current || newGesture())}
          />
          <datalist id="arrow-length-presets">
            {PRESETS.map(({ value }) => (
              <option key={value} value={ARROW_LENGTH_PRESETS[value]} />
            ))}
          </datalist>
          <div className={styles.ends} aria-hidden>
            <span>Shorter</span>
            <span>Longer</span>
          </div>
          <div className={styles.hint}>Tip: scroll the mouse wheel over “Arrows” to stretch or shrink them.</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
