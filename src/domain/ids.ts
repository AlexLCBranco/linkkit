import { nanoid } from "nanoid";

import type { LinkId, MapId, NodeId } from "./types";

/**
 * Id generation, wrapped in one place: nothing else calls `nanoid` directly,
 * so if ids ever change shape this is the only file that moves. Ten
 * characters is plenty for a map of a few hundred boxes and keeps saved
 * state small.
 */
const ID_LENGTH = 10;

export const createMapId = (): MapId => nanoid(ID_LENGTH) as MapId;
export const createNodeId = (): NodeId => nanoid(ID_LENGTH) as NodeId;
export const createLinkId = (): LinkId => nanoid(ID_LENGTH) as LinkId;

/** Casts for ids coming from outside the generator (saved state, tests). */
export const asMapId = (value: string): MapId => value as MapId;
export const asNodeId = (value: string): NodeId => value as NodeId;
export const asLinkId = (value: string): LinkId => value as LinkId;
