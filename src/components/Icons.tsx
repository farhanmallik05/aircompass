import type { Level } from "@/lib/types";

/** Distinct geometric SVG icons per health level (never rely on color alone). */
export function LevelIcon({ level, className = "h-6 w-6" }: { level: Level; className?: string }) {
  switch (level) {
    case 0:
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 1:
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      );
    case 2:
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 3L21 20H3L12 3z" strokeLinejoin="round" />
          <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
        </svg>
      );
    case 3:
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2l8 4v6c0 5-3.4 9-8 10-4.6-1-8-5-8-10V6l8-4z" strokeLinejoin="round" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
      );
    case 4:
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" strokeLinejoin="round" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
      );
    case 5:
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon
            points="7.5,2 16.5,2 22,7.5 22,16.5 16.5,22 7.5,22 2,16.5 2,7.5"
            strokeLinejoin="round"
          />
          <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
        </svg>
      );
  }
}

export function levelBadgeClasses(level: Level): string {
  switch (level) {
    case 0:
      return "border-emerald-700 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-100";
    case 1:
      return "border-teal-700 bg-teal-50 text-teal-950 dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-100";
    case 2:
      return "border-amber-700 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950/60 dark:text-amber-100";
    case 3:
      return "border-orange-700 bg-orange-50 text-orange-950 dark:border-orange-400 dark:bg-orange-950/60 dark:text-orange-100";
    case 4:
      return "border-rose-800 bg-rose-50 text-rose-950 dark:border-rose-400 dark:bg-rose-950/60 dark:text-rose-100";
    case 5:
      return "border-red-900 bg-red-100 text-red-950 dark:border-red-400 dark:bg-red-950/70 dark:text-red-100";
  }
}
