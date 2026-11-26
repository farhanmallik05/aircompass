"use client";

/** Accessible labelled select field with type-safe literal options. */
export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const match = options.find((opt) => opt.value === e.target.value);
          if (match) onChange(match.value);
        }}
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Accessible labelled numeric input with optional inline error announcement binding. */
export function NumberField({
  id,
  label,
  value,
  min,
  max,
  errorId,
  errorText,
  hasError,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  errorId?: string;
  errorText?: string;
  hasError?: boolean;
  onChange: (raw: string) => void;
}) {
  const describedBy = hasError ? errorId : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
      />
      {errorText ? (
        <p id={errorId} className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

/** Accessible pill checkbox used across setup habit and sensitivity toggles. */
export function ToggleCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-teal-700"
      />
      <span>{label}</span>
    </label>
  );
}
