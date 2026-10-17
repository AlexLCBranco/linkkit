import { Columns3 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { bracketSize, roundNames } from "../../domain/bracket";
import { clampRounds } from "../../domain/shown";
import { selectionOf, useMapStore } from "../../store/mapStore";
import { roundsHiddenOf, useViewStore } from "../../store/viewStore";
import styles from "./HideCutToggle.module.css";

/**
 * "Rounds" (brackets only): hides the first rounds, so a big bracket reads
 * cleaner once they're played, as on bracket sites. The menu picks the
 * first round shown ("Show from Quarterfinals"); the rest close up to the
 * left. A view choice, like zoom: remembered per bracket in this browser,
 * no undo step, and the results in hidden rounds stay as they are.
 * Pressed while any round is hidden. Its look is "Hide cut"'s.
 */
export function RoundsMenu() {
  const map = useMapStore((s) => (s.map.kind === "bracket" ? s.map : null));
  const stored = useViewStore((s) => (map ? roundsHiddenOf(s.hiddenRounds, map.id) : 0));
  if (!map) return null;

  const names = roundNames(bracketSize(map));
  const hidden = clampRounds(map, stored);
  const pick = (value: string) => {
    const rounds = Number(value);
    // A picked match that goes off the page is let go.
    const store = useMapStore.getState();
    if (selectionOf(store).some((id) => (store.map.nodes[id]?.match?.round ?? Infinity) <= rounds)) store.select(null);
    useViewStore.getState().setHiddenRounds(map.id, rounds);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={hidden > 0}
          aria-label="Rounds shown"
          title="Hide the first rounds"
        >
          <Columns3 size={14} aria-hidden />
          {/* Short, so the header still fits the map's name. */}
          <span className={styles.word}>{hidden > 0 ? `From ${names[hidden]}` : "Rounds"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuLabel>Show rounds from</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(hidden)} onValueChange={pick}>
          {names.map((name, i) => (
            <DropdownMenuRadioItem key={name} value={String(i)}>
              {i === 0 ? `${name} (all)` : name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
