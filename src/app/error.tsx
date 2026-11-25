"use client";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="mx-auto max-w-xl rounded-2xl border border-rose-700/50 bg-rose-50 p-6 text-rose-950 shadow-sm dark:border-rose-400/50 dark:bg-rose-950/60 dark:text-rose-100"
    >
      <h1 className="text-xl font-bold">Something went wrong / कुछ गड़बड़ हो गई</h1>
      <p className="mt-2 text-sm">
        AirCompass hit an unexpected rendering issue. Your saved household profile remains private
        in your browser.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 min-h-11 rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 dark:bg-teal-300 dark:text-slate-950"
      >
        Try again / फिर से कोशिश करें
      </button>
    </section>
  );
}
