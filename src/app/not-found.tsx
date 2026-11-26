import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-slate-300 bg-white p-6 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <h1 className="text-2xl font-bold">
        Page not found (404) / <span lang="hi">पृष्ठ नहीं मिला</span>
      </h1>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        That AirCompass route does not exist. Return to Today&apos;s air status or view your
        household plan. / <span lang="hi">यह AirCompass पृष्ठ उपलब्ध नहीं है।</span>
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
        >
          Back to Today / <span lang="hi">आज की स्थिति</span>
        </Link>
        <Link
          href="/plan"
          className="inline-flex min-h-11 items-center rounded-xl border border-slate-400 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          View Plan / <span lang="hi">योजना देखें</span>
        </Link>
      </div>
    </section>
  );
}
