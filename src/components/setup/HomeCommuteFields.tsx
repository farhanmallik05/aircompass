"use client";

import type { Dictionary } from "@/lib/client/i18n";
import { COMMUTE_MODES, type CommuteMode, type Profile } from "@/lib/types";

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
  const hasRoomErr = errors.includes("roomArea");
  const hasCommuteErr = errors.includes("commuteKm");

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="home-windows" className="block text-sm font-semibold">
            {dict.setup.windowsLabel}
          </label>
          <select
            id="home-windows"
            value={draft.home.windows}
            onChange={(e) =>
              onUpdate((p) => ({
                ...p,
                home: { ...p.home, windows: e.target.value as Profile["home"]["windows"] },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          >
            <option value="sealed">{dict.setup.winSealed}</option>
            <option value="normal">{dict.setup.winNormal}</option>
            <option value="leaky">{dict.setup.winLeaky}</option>
          </select>
        </div>

        <div>
          <label htmlFor="home-purifier" className="block text-sm font-semibold">
            {dict.setup.purifierLabel}
          </label>
          <select
            id="home-purifier"
            value={draft.home.purifier}
            onChange={(e) =>
              onUpdate((p) => ({
                ...p,
                home: { ...p.home, purifier: e.target.value as Profile["home"]["purifier"] },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          >
            <option value="none">{dict.setup.purNone}</option>
            <option value="diy">{dict.setup.purDiy}</option>
            <option value="hepa">{dict.setup.purHepa}</option>
          </select>
        </div>

        <div>
          <label htmlFor="home-cooking" className="block text-sm font-semibold">
            {dict.setup.cookingLabel}
          </label>
          <select
            id="home-cooking"
            value={draft.home.cooking}
            onChange={(e) =>
              onUpdate((p) => ({
                ...p,
                home: { ...p.home, cooking: e.target.value as Profile["home"]["cooking"] },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          >
            <option value="lpg">{dict.setup.cookLpg}</option>
            <option value="induction">{dict.setup.cookInduction}</option>
            <option value="biomass">{dict.setup.cookBiomass}</option>
            <option value="other">{dict.setup.cookOther}</option>
          </select>
        </div>

        <div>
          <label htmlFor="room-area" className="block text-sm font-semibold">
            {dict.setup.roomAreaLabel}
          </label>
          <input
            id="room-area"
            type="number"
            min={4}
            max={500}
            value={draft.home.roomAreaM2}
            aria-invalid={hasRoomErr || undefined}
            aria-describedby={hasRoomErr ? "room-area-err" : undefined}
            onChange={(e) => {
              const raw = e.target.value;
              const num = raw === "" ? 0 : Number(raw);
              onUpdate((p) => ({
                ...p,
                home: { ...p.home, roomAreaM2: Number.isFinite(num) ? num : 15 },
              }));
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
          {hasRoomErr ? (
            <p
              id="room-area-err"
              className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300"
            >
              {dict.setup.roomAreaError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="commute-mode" className="block text-sm font-semibold">
            {dict.setup.commuteModeLabel}
          </label>
          <select
            id="commute-mode"
            value={draft.commute.mode}
            onChange={(e) =>
              onUpdate((p) => ({
                ...p,
                commute: { ...p.commute, mode: e.target.value as CommuteMode },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          >
            {COMMUTE_MODES.map((m) => (
              <option key={m} value={m}>
                {dict.setup.modes[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="commute-km" className="block text-sm font-semibold">
            {dict.setup.commuteKmLabel}
          </label>
          <input
            id="commute-km"
            type="number"
            min={0}
            max={200}
            value={draft.commute.km}
            aria-invalid={hasCommuteErr || undefined}
            aria-describedby={hasCommuteErr ? "commute-km-err" : undefined}
            onChange={(e) => {
              const raw = e.target.value;
              const num = raw === "" ? 0 : Number(raw);
              onUpdate((p) => ({
                ...p,
                commute: { ...p.commute, km: Number.isFinite(num) ? num : 0 },
              }));
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
          {hasCommuteErr ? (
            <p
              id="commute-km-err"
              className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300"
            >
              {dict.setup.commuteKmError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="commute-days" className="block text-sm font-semibold">
            {dict.setup.commuteDaysLabel}
          </label>
          <input
            id="commute-days"
            type="number"
            min={0}
            max={7}
            value={draft.commute.daysPerWeek}
            onChange={(e) =>
              onUpdate((p) => ({
                ...p,
                commute: {
                  ...p.commute,
                  daysPerWeek: Math.min(7, Math.max(0, Number(e.target.value) || 0)),
                },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
        </div>

        <div>
          <label htmlFor="budget-select" className="block text-sm font-semibold">
            {dict.setup.budgetLabel}
          </label>
          <select
            id="budget-select"
            value={draft.budget}
            onChange={(e) =>
              onUpdate((p) => ({ ...p, budget: e.target.value as Profile["budget"] }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          >
            <option value="zero">{dict.setup.budgetZero}</option>
            <option value="low">{dict.setup.budgetLow}</option>
            <option value="medium">{dict.setup.budgetMedium}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
          <input
            type="checkbox"
            checked={draft.habits.morningOutdoorExercise}
            onChange={(e) =>
              onUpdate((p) => ({
                ...p,
                habits: { ...p.habits, morningOutdoorExercise: e.target.checked },
              }))
            }
            className="h-4 w-4 accent-teal-700"
          />
          <span>{dict.setup.morningExerciseLabel}</span>
        </label>

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
          <input
            type="checkbox"
            checked={draft.habits.schoolRun}
            onChange={(e) =>
              onUpdate((p) => ({
                ...p,
                habits: { ...p.habits, schoolRun: e.target.checked },
              }))
            }
            className="h-4 w-4 accent-teal-700"
          />
          <span>{dict.setup.schoolRunLabel}</span>
        </label>
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
