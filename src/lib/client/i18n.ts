import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import type { Lang } from "@/lib/types";

export type Dictionary = typeof en;

export function getDict(lang: Lang): Dictionary {
  return lang === "hi" ? hi : en;
}

export function fmt(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}
