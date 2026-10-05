import { WandSparkles } from "lucide-react";

import { useMapStore } from "../../store/mapStore";
import styles from "./HeaderButton.module.css";

/**
 * "Tidy up": rearranges every box in rows, a box above what it needs, and
 * the boxes glide there. It only asks: the canvas does the tidying, since
 * it alone knows how big each box is drawn.
 */
export function TidyButton() {
  const requestTidy = useMapStore((s) => s.requestTidy);
  return (
    <button type="button" className={styles.button} onClick={requestTidy} title="Arrange the boxes neatly">
      <WandSparkles size={16} />
      Tidy up
    </button>
  );
}
