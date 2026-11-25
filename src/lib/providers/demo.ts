import demoDay from "../../../data/demo-day.json";
import type { AirContext, Profile } from "../types";

export const SAMPLE_FAMILY_PROFILE: Profile = {
  lang: "en",
  place: {
    name: "Greater Noida",
    lat: 28.4744,
    lon: 77.504,
    country: "IN",
  },
  household: {
    adults: 2,
    children: 1,
    seniors: 1,
    conditions: ["respiratory"],
  },
  home: {
    type: "apartment",
    windows: "normal",
    ac: false,
    purifier: "none",
    cooking: "lpg",
    roomAreaM2: 15,
  },
  commute: {
    mode: "car",
    km: 12,
    daysPerWeek: 5,
  },
  habits: {
    morningOutdoorExercise: true,
    schoolRun: true,
  },
  budget: "low",
};

/** Returns the labelled severe winter smog fixture (recorded Open-Meteo window or illustrative fallback). */
export function getDemoContext(place?: Profile["place"]): AirContext {
  const dataNote = demoDay.dataNote === "recorded" ? "recorded" : "illustrative";
  return {
    place: place ?? SAMPLE_FAMILY_PROFILE.place,
    source: "demo",
    dataNote,
    ...(demoDay.recordedDate ? { recordedDate: demoDay.recordedDate } : {}),
    fetchedAt: demoDay.fetchedAt,
    hours: demoDay.hours,
    nowIndex: demoDay.nowIndex,
  };
}
