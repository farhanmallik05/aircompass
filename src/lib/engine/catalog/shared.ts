import actionMeta from "../../../../data/action-meta.json";
import type {
  ActionId,
  ActionSection,
  Group,
  Level,
  Profile,
  Scenario,
  WindowSummary,
} from "../../types";

export interface ActionDef {
  id: ActionId;
  section: ActionSection;
  appliesIf: (p: Profile, level: Level, windows: WindowSummary) => boolean;
  edit?: (s: Scenario, p: Profile, windows: WindowSummary) => Scenario;
  co2e?: (p: Profile) => { kg: number; range: [number, number] };
  cost: 0 | 1 | 2;
  effort: 1 | 2 | 3;
  audience: Group[];
  confidence: "low" | "medium";
  method: string;
  assumptions: string[];
}

export type RawActionBody = Omit<ActionDef, "id" | "method" | "assumptions">;

export function avoidHoursOf(w: WindowSummary): Set<number> {
  return new Set([w.avoid.start, (w.avoid.start + 1) % 24, (w.avoid.start + 2) % 24]);
}

export function bestHoursOf(w: WindowSummary): number[] {
  if (w.noGoodWindow) return [];
  return [w.best.start, (w.best.start + 1) % 24];
}

export function makeAction(id: ActionId, raw: RawActionBody): ActionDef {
  const meta = actionMeta[id];
  return {
    id,
    ...raw,
    method: meta.method,
    assumptions: meta.assumptions,
  };
}
