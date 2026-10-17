import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { memo, useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import { playerName, rowAfterKey, type RowKey, type Slot } from "../../domain/bracket";
import { pressed } from "../../domain/shortcuts";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { selectNodeHighlight } from "../../store/selectors";
import boxStyles from "./BoxView.module.css";
import styles from "./MatchBox.module.css";
import { BOX_ID_ATTRIBUTE, focusPlayerRow, PLAYER_ROW_ATTRIBUTE } from "./pageMarkers";

/** React Flow's node record for a bracket's match (see BoxFlowNode). */
export type MatchFlowNode = Node<Record<string, never>, "match">;

const keepToRow = (e: PointerEvent | MouseEvent) => e.stopPropagation();

/**
 * One match of a bracket: a box with its two players, one row each (the
 * owner's spec: no scores). The winner's row is bold; an empty slot shows a
 * faint "—". Drawn in a box's own style (BoxView.module.css), so the
 * selection ring, the fed-by / leads-to highlight and a colour look the
 * same as on any box.
 *
 * Mouse: clicking a player makes them the winner (their name moves on to
 * the next match); clicking the bold winner again clears it, the other
 * player switches it. A first-round row is also where names are typed: an
 * empty one opens for typing on a click, a named one on a double-click or
 * its pencil. Nothing else: a bracket's boxes don't move, connect or get
 * deleted.
 *
 * Keys: each row is a button, so Tab reaches it and Space presses it; the
 * arrow keys and Enter move between rows (`rowAfterKey`). While typing, Enter
 * and Tab go on to the next slot down, Shift+Tab back up, and pasting
 * several lines fills the slots below.
 */
export const MatchBox = memo(function MatchBox({ id }: NodeProps<MatchFlowNode>) {
  const nodeId = id as NodeId;
  const round = useMapStore((s) => s.map.nodes[nodeId]?.match?.round);
  const color = useMapStore((s) => s.map.nodes[nodeId]?.color ?? null);
  const highlight = useMapStore((s) => selectNodeHighlight(s, nodeId));
  const hover = useMapStore((s) => s.hover);
  if (round === undefined) return null;

  const style = color ? ({ "--box-accent": `var(--palette-${color})` } as CSSProperties) : undefined;
  return (
    <div
      {...{ [BOX_ID_ATTRIBUTE]: nodeId }}
      className={`${boxStyles.box} ${styles.match}`}
      data-colored={color ? true : undefined}
      data-highlight={highlight ?? undefined}
      style={style}
      // While the mouse is on a match, its path lights up (selectFocus).
      onPointerEnter={() => hover(nodeId)}
      onPointerLeave={() => useMapStore.getState().hovered === nodeId && hover(null)}
    >
      {/* React Flow only draws an edge between nodes that have handles
          (see BoxView); arrows are drawn box to box by LinkEdgeView. */}
      <Handle type="target" position={Position.Left} className={boxStyles.handle} isConnectable={false} />
      <PlayerRow match={nodeId} slot={0} typed={round === 1} />
      <PlayerRow match={nodeId} slot={1} typed={round === 1} />
      <Handle type="source" position={Position.Right} className={boxStyles.handle} isConnectable={false} />
    </div>
  );
});

interface PlayerRowProps {
  readonly match: NodeId;
  readonly slot: Slot;
  /** A first-round row: its name is typed here. */
  readonly typed: boolean;
}

/** One player's row: reads only its own slot, name and result. */
function PlayerRow({ match, slot, typed }: PlayerRowProps) {
  const player = useMapStore((s) => s.map.nodes[match]?.match?.slots[slot] ?? null);
  const name = useMapStore((s) => playerName(s.map, player));
  const isWinner = useMapStore((s) => player !== null && s.map.nodes[match]?.match?.winner === player);
  const isLoser = useMapStore((s) => {
    const winner = s.map.nodes[match]?.match?.winner;
    return !!winner && winner !== player;
  });
  const isEditing = useMapStore((s) => player !== null && s.editing?.kind === "player" && s.editing.id === player);
  const pickWinner = useMapStore((s) => s.pickWinner);
  const takeBackPick = useMapStore((s) => s.takeBackPick);
  const startEditing = useMapStore((s) => s.startEditing);
  const stopEditing = useMapStore((s) => s.stopEditing);
  const renamePlayer = useMapStore((s) => s.renamePlayer);
  const pastePlayers = useMapStore((s) => s.pastePlayers);
  const editNextPlayer = useMapStore((s) => s.editNextPlayer);
  const select = useMapStore((s) => s.select);
  // The result the first click of a double-click picked, taken back when
  // the double-click turns out to be a rename.
  const lastPick = useRef<string | null>(null);
  // Typing ended (Enter on the last slot, Esc): the field is gone and focus
  // would fall to the page, where the row keys do nothing. Back onto this
  // row, unless a click already put focus somewhere else.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !isEditing && (!document.activeElement || document.activeElement === document.body)) {
      focusPlayerRow({ match, slot });
    }
    wasEditing.current = isEditing;
  }, [isEditing, match, slot]);

  if (isEditing && player) {
    return (
      <div className={styles.row} data-editing>
        <InlineEditable
          value={name}
          editing
          onCommit={(text) => renamePlayer(player, text)}
          onDone={(committed) => stopEditing(!committed)}
          onStep={(step) => editNextPlayer(player, step)}
          onPasteLines={(text, before, after) => pastePlayers(player, before + text + after)}
          placeholder="Type a name"
          ariaLabel="Player name"
          className={styles.field}
        />
      </div>
    );
  }

  const rename = () => player && startEditing({ kind: "player", id: player });

  const onClick = (e: MouseEvent) => {
    // The second click of a double-click: the double-click decides.
    if (e.detail > 1) return;
    lastPick.current = null;
    if (typed && !name) return rename();
    lastPick.current = pickWinner(match, slot);
  };

  const onDoubleClick = () => {
    if (!typed) return;
    if (lastPick.current) takeBackPick(lastPick.current);
    lastPick.current = null;
    rename();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || !pressed(e, "moveRow")) return;
    // Also stops Enter pressing the row (Space does that).
    e.preventDefault();
    // Not the map's own keys.
    e.stopPropagation();
    const to = rowAfterKey(useMapStore.getState().map, { match, slot }, e.key as RowKey);
    if (to) focusPlayerRow(to);
  };

  return (
    <div className={styles.row} data-winner={isWinner || undefined} data-loser={isLoser || undefined}>
      <button
        type="button"
        className={`${styles.pick} nodrag`}
        {...{ [PLAYER_ROW_ATTRIBUTE]: `${match}:${slot}` }}
        onPointerDown={keepToRow}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        // Keyboard focus on a row selects its match, so the screen keeps it
        // in view and the fed-by / leads-to highlight follows.
        onFocus={() => select(match)}
        aria-pressed={isWinner}
        aria-label={name ? `${name}${isWinner ? ", winner" : ""}` : "Empty slot"}
        title={typed && !name ? "Type a name" : isWinner ? "Winner: click to clear" : "Click to make the winner"}
      >
        <span className={styles.name} data-empty={!name || undefined}>
          {name || "—"}
        </span>
      </button>
      {typed && name && (
        <button
          type="button"
          className={styles.rename}
          onPointerDown={keepToRow}
          onDoubleClick={keepToRow}
          onClick={rename}
          aria-label={`Rename ${name}`}
          title="Rename"
          tabIndex={-1}
        >
          <Pencil size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}
