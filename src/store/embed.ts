import { create } from "zustand";

import { readEmbed, type Embed, type EmbedStatus } from "../domain/embed";

/**
 * Whether this page is a frame on the gauntlet canvas (`domain/embed.ts`),
 * read once from the address as the stores load: the map store's first
 * state depends on it. In embed mode the frame shows one map and never
 * changes which map the full app opens next (`linkkit:active`), or two
 * frames, and the app itself, would fight over it.
 */
// `globalThis.location`, not `window.location`: tests stand in a `window`
// without one, and outside a browser there is no address at all.
let embed: Embed | null = readEmbed(globalThis.location?.search ?? "");

export const embedded = (): Embed | null => embed;

/** Tests only: the store reads the address once, at load. */
export function setEmbeddedForTests(next: Embed | null): void {
  embed = next;
}

export const useEmbedStatus = create<{ readonly status: EmbedStatus }>(() => ({ status: "ok" }));

export const setEmbedStatus = (status: EmbedStatus): void => useEmbedStatus.setState({ status });
