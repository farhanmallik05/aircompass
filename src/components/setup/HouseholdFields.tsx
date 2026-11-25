"use client";

import type { Dictionary } from "@/lib/client/i18n";
import type { Profile } from "@/lib/types";

type Condition = "respiratory" | "cardiac" | "pregnant";

/** Member headcounts and health sensitivity checkboxes with accessible validation hooks. */
export function HouseholdFields({
  household,
  dict,
  hasMembersError,
  onChangeHousehold,
  onToggleCondition,
}: {
  household: Profile["household"];
  dict: Dictionary;
  hasMembersError: boolean;
  onChangeHousehold: (next: Profile["household"]) => void;
  onToggleCondition: (cond: Condition) => void;
}) {
  const errDesc = hasMembersError ? "members-err" : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="adults-input" className="block text-sm font-semibold">
            {dict.setup.adultsLabel}
          </label>
          <input
            id="adults-input"
            type="number"
            min={0}
            max={20}
            value={household.adults}
            aria-invalid={hasMembersError || undefined}
            aria-describedby={errDesc}
            onChange={(e) =>
              onChangeHousehold({ ...household, adults: Math.max(0, Number(e.target.value) || 0) })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
          {hasMembersError ? (
            <p
              id="members-err"
              className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300"
            >
              {dict.setup.membersError}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="children-input" className="block text-sm font-semibold">
            {dict.setup.childrenLabel}
          </label>
          <input
            id="children-input"
            type="number"
            min={0}
            max={20}
            value={household.children}
            aria-invalid={hasMembersError || undefined}
            aria-describedby={errDesc}
            onChange={(e) =>
              onChangeHousehold({
                ...household,
                children: Math.max(0, Number(e.target.value) || 0),
              })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
        </div>
        <div>
          <label htmlFor="seniors-input" className="block text-sm font-semibold">
            {dict.setup.seniorsLabel}
          </label>
          <input
            id="seniors-input"
            type="number"
            min={0}
            max={20}
            value={household.seniors}
            aria-invalid={hasMembersError || undefined}
            aria-describedby={errDesc}
            onChange={(e) =>
              onChangeHousehold({ ...household, seniors: Math.max(0, Number(e.target.value) || 0) })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{dict.setup.conditionsLegend}</legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["respiratory", dict.setup.condRespiratory],
              ["cardiac", dict.setup.condCardiac],
              ["pregnant", dict.setup.condPregnant],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            >
              <input
                type="checkbox"
                checked={household.conditions.includes(key)}
                onChange={() => onToggleCondition(key)}
                className="h-4 w-4 accent-teal-700"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
