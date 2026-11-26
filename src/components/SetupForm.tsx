"use client";

import { useRef, useState } from "react";
import type { Dictionary } from "@/lib/client/i18n";
import type { Profile } from "@/lib/types";
import { HomeCommuteFields } from "./setup/HomeCommuteFields";
import { HouseholdFields } from "./setup/HouseholdFields";
import { PlaceSelector } from "./setup/PlaceSelector";

function validateProfileDraft(draft: Profile): string[] {
  const errs: string[] = [];
  if (draft.home.roomAreaM2 < 4 || draft.home.roomAreaM2 > 500) errs.push("roomArea");
  if (draft.commute.km < 0 || draft.commute.km > 200) errs.push("commuteKm");
  if (draft.household.adults + draft.household.children + draft.household.seniors < 1) {
    errs.push("members");
  }
  return errs;
}

/** Accessible household setup form backed purely by localStorage. */
export function SetupForm({
  initial,
  dict,
  onSave,
}: {
  initial: Profile;
  dict: Dictionary;
  onSave: (p: Profile) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const alertRef = useRef<HTMLDivElement>(null);

  function toggleCondition(cond: "respiratory" | "cardiac" | "pregnant") {
    setDraft((prev) => {
      const has = prev.household.conditions.includes(cond);
      const nextConditions = has
        ? prev.household.conditions.filter((c) => c !== cond)
        : [...prev.household.conditions, cond];
      return { ...prev, household: { ...prev.household, conditions: nextConditions } };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateProfileDraft(draft);
    setErrors(errs);
    if (errs.length > 0) {
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }

    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-5 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{dict.setup.title}</h2>

      {errors.length > 0 ? (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-rose-700 bg-rose-50 p-3 text-sm font-medium text-rose-950 focus:outline-2 focus:outline-rose-700 dark:border-rose-400 dark:bg-rose-950/60 dark:text-rose-100"
        >
          {dict.setup.errorSummary}
        </div>
      ) : null}

      <PlaceSelector
        place={draft.place}
        dict={dict}
        onSelectPlace={(nextPlace) => setDraft((p) => ({ ...p, place: nextPlace }))}
      />

      <HouseholdFields
        household={draft.household}
        dict={dict}
        hasMembersError={errors.includes("members")}
        onChangeHousehold={(next) => setDraft((p) => ({ ...p, household: next }))}
        onToggleCondition={toggleCondition}
      />

      <HomeCommuteFields draft={draft} dict={dict} errors={errors} onUpdate={setDraft} />

      <button
        type="submit"
        disabled={saving}
        className="min-h-11 rounded-xl bg-teal-800 px-6 py-3 text-base font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
      >
        {saving ? dict.plan.loadingPlan : dict.setup.submitBtn}
      </button>
    </form>
  );
}
