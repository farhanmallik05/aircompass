"use client";

import { NumberField, ToggleCheckbox } from "./FormControls";
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
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField
          id="adults-input"
          label={dict.setup.adultsLabel}
          value={household.adults}
          min={0}
          max={20}
          hasError={hasMembersError}
          errorId="members-err"
          errorText={hasMembersError ? dict.setup.membersError : undefined}
          onChange={(raw) =>
            onChangeHousehold({ ...household, adults: Math.max(0, Number(raw) || 0) })
          }
        />
        <NumberField
          id="children-input"
          label={dict.setup.childrenLabel}
          value={household.children}
          min={0}
          max={20}
          hasError={hasMembersError}
          errorId="members-err"
          onChange={(raw) =>
            onChangeHousehold({ ...household, children: Math.max(0, Number(raw) || 0) })
          }
        />
        <NumberField
          id="seniors-input"
          label={dict.setup.seniorsLabel}
          value={household.seniors}
          min={0}
          max={20}
          hasError={hasMembersError}
          errorId="members-err"
          onChange={(raw) =>
            onChangeHousehold({ ...household, seniors: Math.max(0, Number(raw) || 0) })
          }
        />
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
            <ToggleCheckbox
              key={key}
              checked={household.conditions.includes(key)}
              label={label}
              onChange={() => onToggleCondition(key)}
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}
