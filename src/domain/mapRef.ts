// What Ctrl+C in Linkkit puts on the clipboard when no box is picked (the
// gauntlet's Edges round, item 3b): an address naming the map. Pasted on the
// gauntlet whiteboard (same site) it becomes that LIVE map there; anywhere
// else it is just a link to Linkkit. Pure, tested in mapRef.test.ts.

/** `https://<site>/linkkit/?map=<id>`. */
export const mapRefUrl = (origin: string, mapId: string): string => `${origin}/linkkit/?${new URLSearchParams({ map: mapId }).toString()}`;
