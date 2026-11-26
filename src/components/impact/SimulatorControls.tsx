"use client";

import { ToggleCheckbox } from "../setup/FormControls";
import type { Dictionary } from "@/lib/client/i18n";
import { COMMUTE_MODES, type CommuteMode, type Scenario } from "@/lib/types";

type PurifierMode = Scenario["purifier"];

function parsePurifier(value: string): PurifierMode {
  if (value === "diy" || value === "hepa") return value;
  return "none";
}

function parseCommuteMode(value: string): CommuteMode {
  return COMMUTE_MODES.find((m) => m === value) ?? "car";
}

interface SimulatorControlsProps {
  dict: Dictionary;
  purifier: PurifierMode;
  bestWindowsOnly: boolean;
  n95: boolean;
  exerciseIndoors: boolean;
  cookVent: boolean;
  commuteMode: CommuteMode;
  commuteDays: number;
  onPurifierChange: (v: PurifierMode) => void;
  onBestWindowsChange: (v: boolean) => void;
  onN95Change: (v: boolean) => void;
  onExerciseIndoorsChange: (v: boolean) => void;
  onCookVentChange: (v: boolean) => void;
  onCommuteModeChange: (v: CommuteMode) => void;
  onCommuteDaysChange: (v: number) => void;
  onReset: () => void;
}

function SimulatorSelectGrid({ props }: { props: SimulatorControlsProps }) {
  const { dict } = props;
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label htmlFor="sim-purifier" className="block text-sm font-semibold">
          {dict.impact.purifierControl}
        </label>
        <select
          id="sim-purifier"
          value={props.purifier}
          onChange={(e) => props.onPurifierChange(parsePurifier(e.target.value))}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
        >
          <option value="none">{dict.setup.purNone}</option>
          <option value="diy">{dict.setup.purDiy}</option>
          <option value="hepa">{dict.setup.purHepa}</option>
        </select>
      </div>

      <div>
        <label htmlFor="sim-commute" className="block text-sm font-semibold">
          {dict.impact.commuteModeControl}
        </label>
        <select
          id="sim-commute"
          value={props.commuteMode}
          onChange={(e) => props.onCommuteModeChange(parseCommuteMode(e.target.value))}
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
        <label htmlFor="sim-days" className="block text-sm font-semibold">
          {dict.impact.commuteDaysControl}: {props.commuteDays}
        </label>
        <input
          id="sim-days"
          type="range"
          min={0}
          max={7}
          value={props.commuteDays}
          aria-valuetext={`${props.commuteDays}`}
          onChange={(e) => props.onCommuteDaysChange(Number(e.target.value))}
          className="mt-2 min-h-11 w-full accent-teal-700"
        />
      </div>
    </div>
  );
}

/** Interactive what-if simulator controls triggering client-side physics recalculation. */
export function SimulatorControls(props: SimulatorControlsProps) {
  const { dict } = props;
  const toggles: Array<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = [
    {
      label: dict.impact.windowsControl,
      checked: props.bestWindowsOnly,
      onChange: props.onBestWindowsChange,
    },
    { label: dict.impact.n95Control, checked: props.n95, onChange: props.onN95Change },
    {
      label: dict.impact.exerciseIndoorsControl,
      checked: props.exerciseIndoors,
      onChange: props.onExerciseIndoorsChange,
    },
    {
      label: dict.impact.cookVentControl,
      checked: props.cookVent,
      onChange: props.onCookVentChange,
    },
  ];

  return (
    <section
      aria-labelledby="whatif-heading"
      className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="whatif-heading" className="text-lg font-bold">
          {dict.impact.controlsHeading}
        </h2>
        <button
          type="button"
          onClick={props.onReset}
          className="min-h-11 rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {dict.impact.resetBtn}
        </button>
      </div>

      <SimulatorSelectGrid props={props} />

      <div className="mt-4 flex flex-wrap gap-3">
        {toggles.map((t) => (
          <ToggleCheckbox key={t.label} checked={t.checked} label={t.label} onChange={t.onChange} />
        ))}
      </div>
    </section>
  );
}
