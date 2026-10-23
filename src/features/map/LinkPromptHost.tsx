import { LinkPrompt } from "../../components/LinkPrompt";
import { useLinkPrompt } from "../../store/linkPrompt";
import { useMapStore } from "../../store/mapStore";

/** The open link field of a box, if any (owner, 2026-10-23). Drawn once
    per map view: Linkkit's page, and the map edited on the whiteboard. */
export function LinkPromptHost() {
  const box = useLinkPrompt((s) => s.box);
  const at = useLinkPrompt((s) => s.at);
  const close = useLinkPrompt((s) => s.close);
  const name = useMapStore((s) => (box ? (s.map.nodes[box]?.name ?? "") : ""));
  if (!box) return null;
  const line = name.trim().replace(/s+/g, " ");
  return (
    <LinkPrompt
      key={box}
      x={at.x}
      y={at.y}
      heading={`Link for box “${line.length > 32 ? `${line.slice(0, 31).trimEnd()}…` : line}”`}
      initial={useMapStore.getState().map.nodes[box]?.url ?? ""}
      onSave={(url) => {
        close();
        useMapStore.getState().setBoxUrl(box, url);
      }}
      onCancel={close}
    />
  );
}
