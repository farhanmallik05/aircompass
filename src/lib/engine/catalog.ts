/**
 * Unified 26-action recommendation registry assembled from domain-cohesive catalog submodules.
 */
import { ACTION_IDS, type ActionId } from "../types";
import { INDOOR_BY_ID } from "./catalog/indoor";
import { ROUTINE_BY_ID } from "./catalog/routine";
import type { ActionDef } from "./catalog/shared";
import { SWAP_BY_ID } from "./catalog/swap";

export type { ActionDef };

export const ACTION_BY_ID: Record<ActionId, ActionDef> = {
  ...ROUTINE_BY_ID,
  ...INDOOR_BY_ID,
  ...SWAP_BY_ID,
};

export const ACTION_CATALOG: readonly ActionDef[] = ACTION_IDS.map((id) => ACTION_BY_ID[id]);
