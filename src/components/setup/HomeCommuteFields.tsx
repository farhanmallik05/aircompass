"use client";

import { NumberField, SelectField, ToggleCheckbox } from "./FormControls";
import type { Dictionary } from "@/lib/client/i18n";
import { COMMUTE_MODES, type Profile } from "@/lib/types";

function parseFiniteOrFallback(raw: string, fallback: number): number {
  const num = raw === "" ? 0 : Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function HomeEnvelopeRow({
  draft,
  dict,
  hasRoomErr,
  onUpdate,
}: {
  draft: Profile;
  dict: Dictionary;
  hasRoomErr: boolean;
  onUpdate: (updater: (prev: Profile) => Profile) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SelectField
        id="home-windows"
        label={dict.setup.windowsLabel}
        value={draft.home.windows}
        options={[
          { value: "sealed", label: dict.setup.winSealed },
          { value: "normal", label: dict.setup.winNormal },
          { value: "leaky", label: dict.setup.winLeaky },
        ]}
        onChange={(windows) => onUpdate((p) => ({ ...p, home: { ...p.home, windows } }))}
      />
      <SelectField
        id="home-purifier"
        label={dict.setup.purifierLabel}
        value={draft.home.purifier}
        options={[
          { value: "none", label: dict.setup.purNone },
          { value: "diy", label: dict.setup.purDiy },
          { value: "hepa", label: dict.setup.purHepa },
        ]}
        onChange={(purifier) => onUpdate((p) => ({ ...p, home: { ...p.home, purifier } }))}
      />
      <SelectField
        id="home-cooking"
        label={dict.setup.cookingLabel}
        value={draft.home.cooking}
        options={[
          { value: "lpg", label: dict.setup.cookLpg },
          { value: "induction", label: dict.setup.cookInduction },
          { value: "biomass", label: dict.setup.cookBiomass },
          { value: "other", label: dict.setup.cookOther },
        ]}
        onChange={(cooking) => onUpdate((p) => ({ ...p, home: { ...p.home, cooking } }))}
      />
      <NumberField
        id="room-area"
        label={dict.setup.roomAreaLabel}
        value={draft.home.roomAreaM2}
        min={4}
        max={500}
        hasError={hasRoomErr}
        errorId="room-area-err"
        errorText={hasRoomErr ? dict.setup.roomAreaError : undefined}
        onChange={(raw) =>
          onUpdate((p) => ({
            ...p,
            home: { ...p.home, roomAreaM2: parseFiniteOrFallback(raw, 15) },
          }))
        }
      />
    </div>
  );
}

function CommuteBudgetRow({
  draft,
  dict,
  hasCommuteErr,
  onUpdate,
}: {
  draft: Profile;
  dict: Dictionary;
  hasCommuteErr: boolean;
  onUpdate: (updater: (prev: Profile) => Profile) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SelectField
        id="commute-mode"
        label={dict.setup.commuteModeLabel}
        value={draft.commute.mode}
        options={COMMUTE_MODES.map((m) => ({ value: m, label: dict.setup.modes[m] }))}
        onChange={(mode) => onUpdate((p) => ({ ...p, commute: { ...p.commute, mode } }))}
      />
      <NumberField
        id="commute-km"
        label={dict.setup.commuteKmLabel}
        value={draft.commute.km}
        min={0}
        max={200}
        hasError={hasCommuteErr}
        errorId="commute-km-err"
        errorText={hasCommuteErr ? dict.setup.commuteKmError : undefined}
        onChange={(raw) =>
          onUpdate((p) => ({
            ...p,
            commute: { ...p.commute, km: parseFiniteOrFallback(raw, 0) },
          }))
        }
      />
      <NumberField
        id="commute-days"
        label={dict.setup.commuteDaysLabel}
        value={draft.commute.daysPerWeek}
        min={0}
        max={7}
        onChange={(raw) =>
          onUpdate((p) => ({
            ...p,
            commute: { ...p.commute, daysPerWeek: Math.min(7, Math.max(0, Number(raw) || 0)) },
          }))
        }
      />
      <SelectField
        id="budget-select"
        label={dict.setup.budgetLabel}
        value={draft.budget}
        options={[
          { value: "zero", label: dict.setup.budgetZero },
          { value: "low", label: dict.setup.budgetLow },
          { value: "medium", label: dict.setup.budgetMedium },
        ]}
        onChange={(budget) => onUpdate((p) => ({ ...p, budget }))}
      />
    </div>
  );
}

/** Home building envelope, purifier, cooking fuel, commute, habit, budget, and note inputs. */
export function HomeCommuteFields({
  draft,
  dict,
  errors,
  onUpdate,
}: {
  draft: Profile;
  dict: Dictionary;
  errors: readonly string[];
  onUpdate: (updater: (prev: Profile) => Profile) => void;
}) {
  return (
    <>
      <HomeEnvelopeRow
        draft={draft}
        dict={dict}
        hasRoomErr={errors.includes("roomArea")}
        onUpdate={onUpdate}
      />
      <CommuteBudgetRow
        draft={draft}
        dict={dict}
        hasCommuteErr={errors.includes("commuteKm")}
        onUpdate={onUpdate}
      />

      <div className="flex flex-wrap gap-3">
        <ToggleCheckbox
          checked={draft.habits.morningOutdoorExercise}
          label={dict.setup.morningExerciseLabel}
          onChange={(val) =>
            onUpdate((p) => ({ ...p, habits: { ...p.habits, morningOutdoorExercise: val } }))
          }
        />
        <ToggleCheckbox
          checked={draft.habits.schoolRun}
          label={dict.setup.schoolRunLabel}
          onChange={(val) => onUpdate((p) => ({ ...p, habits: { ...p.habits, schoolRun: val } }))}
        />
      </div>

      <div>
        <label htmlFor="household-notes" className="block text-sm font-semibold">
          {dict.setup.notesLabel}
        </label>
        <textarea
          id="household-notes"
          maxLength={300}
          rows={2}
          value={draft.notes ?? ""}
          onChange={(e) => onUpdate((p) => ({ ...p, notes: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      </div>
    </>
  );
}
