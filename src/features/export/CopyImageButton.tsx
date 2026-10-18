import styles from "../map/HeaderButton.module.css";
import { useCopyImage } from "./useCopyImage";

/**
 * Copies the whole map to the clipboard as a picture (Boardkit's "Copy
 * board as image"): the same clean image as "Export PNG image", at 4x the
 * pixels, so it can be pasted into Excalidraw and resized there without
 * going soft. The icon turns to a tick (or a warning) for a moment.
 */
export function CopyImageButton() {
  const { copy, copied, Icon } = useCopyImage();
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void copy()}
      title="Copy the whole map as an image (sharp enough to resize after pasting)"
    >
      <Icon size={16} />
      <span className={styles.word}>{copied ? "Copied" : "Copy image"}</span>
    </button>
  );
}
