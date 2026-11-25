"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/client/i18n";
import { fmt } from "@/lib/client/i18n";
import { COMMUTE_MODES, type CommuteMode, type GeoPlace, type Profile } from "@/lib/types";

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
  const [query, setQuery] = useState(initial.place.name);
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/context?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = (await res.json()) as { places?: GeoPlace[] };
        setResults(data.places ?? []);
      }
    } finally {
      setSearching(false);
    }
  }

  function handleGeolocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setDraft((prev) => ({
        ...prev,
        place: {
          name: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          country: prev.place.country,
        },
      }));
    });
  }

  function toggleCondition(cond: "respiratory" | "cardiac" | "pregnant") {
    setDraft((prev) => {
      const has = prev.household.conditions.includes(cond);
      return {
        ...prev,
        household: {
          ...prev.household,
          conditions: has
            ? prev.household.conditions.filter((c) => c !== cond)
            : [...prev.household.conditions, cond],
        },
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (draft.home.roomAreaM2 < 4 || draft.home.roomAreaM2 > 500) errs.push("roomArea");
    if (draft.commute.km < 0 || draft.commute.km > 200) errs.push("commuteKm");
    if (draft.household.adults + draft.household.children + draft.household.seniors < 1) {
      errs.push("members");
    }
    setErrors(errs);
    if (errs.length > 0) return;

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
          role="alert"
          className="rounded-lg border border-rose-700 bg-rose-50 p-3 text-sm font-medium text-rose-950 dark:border-rose-400 dark:bg-rose-950/60 dark:text-rose-100"
        >
          {dict.setup.errorSummary}
        </div>
      ) : null}

      {/* Place search */}
      <div className="space-y-2">
        <label htmlFor="place-search" className="block text-sm font-semibold">
          {dict.setup.placeSearchLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="place-search"
            type="text"
            value={query}
            autoComplete="address-level2"
            placeholder={dict.setup.placeSearchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 flex-1 rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-950"
          >
            {dict.setup.searchBtn}
          </button>
          <button
            type="button"
            onClick={handleGeolocate}
            className="min-h-11 rounded-lg border border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            {dict.setup.useLocationBtn}
          </button>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {fmt(dict.setup.selectedPlace, { name: draft.place.name, country: draft.place.country })}
        </p>
        {results.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 dark:divide-slate-800 dark:border-slate-700">
            {results.map((r) => (
              <li key={`${r.lat}-${r.lon}-${r.name}`}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((p) => ({
                      ...p,
                      place: { name: r.name, lat: r.lat, lon: r.lon, country: r.country },
                    }));
                    setQuery(r.name);
                    setResults([]);
                  }}
                  className="min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-teal-50 dark:hover:bg-slate-800"
                >
                  {r.name}
                  {r.admin1 ? `, ${r.admin1}` : ""} ({r.country})
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Household composition */}
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
            value={draft.household.adults}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                household: { ...p.household, adults: Math.max(0, Number(e.target.value) || 0) },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
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
            value={draft.household.children}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                household: { ...p.household, children: Math.max(0, Number(e.target.value) || 0) },
              }))
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
            value={draft.household.seniors}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                household: { ...p.household, seniors: Math.max(0, Number(e.target.value) || 0) },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
        </div>
      </div>

      {/* Sensitivities */}
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
                checked={draft.household.conditions.includes(key)}
                onChange={() => toggleCondition(key)}
                className="h-4 w-4 accent-teal-700"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Home parameters */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="home-windows" className="block text-sm font-semibold">
            {dict.setup.windowsLabel}
          </label>
          <select
            id="home-windows"
            value={draft.home.windows}
            onChange={(e) =>
              setDraft((p) => ({
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
              setDraft((p) => ({
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
              setDraft((p) => ({
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
            aria-describedby={errors.includes("roomArea") ? "room-area-err" : undefined}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                home: { ...p.home, roomAreaM2: Number(e.target.value) || 15 },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
          {errors.includes("roomArea") ? (
            <p id="room-area-err" className="mt-1 text-xs text-rose-700 dark:text-rose-300">
              4 - 500 m²
            </p>
          ) : null}
        </div>
      </div>

      {/* Commute & Budget */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="commute-mode" className="block text-sm font-semibold">
            {dict.setup.commuteModeLabel}
          </label>
          <select
            id="commute-mode"
            value={draft.commute.mode}
            onChange={(e) =>
              setDraft((p) => ({
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
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                commute: { ...p.commute, km: Math.max(0, Number(e.target.value) || 0) },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
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
              setDraft((p) => ({
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
              setDraft((p) => ({ ...p, budget: e.target.value as Profile["budget"] }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          >
            <option value="zero">{dict.setup.budgetZero}</option>
            <option value="low">{dict.setup.budgetLow}</option>
            <option value="medium">{dict.setup.budgetMedium}</option>
          </select>
        </div>
      </div>

      {/* Habits & Notes */}
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
          <input
            type="checkbox"
            checked={draft.habits.morningOutdoorExercise}
            onChange={(e) =>
              setDraft((p) => ({
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
              setDraft((p) => ({
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
          onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      </div>

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
