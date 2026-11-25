export interface MythDef {
  id: "cloth_mask" | "indoor_plants" | "ozone_ionizer" | "air_freshener";
  source: string;
}

export const MYTHS: readonly MythDef[] = [
  {
    id: "cloth_mask",
    source: "NIOSH / US EPA N95 respirator guidance (face-seal leakage & 0.3 um filtration)",
  },
  {
    id: "indoor_plants",
    source:
      "Cummings & Waring (2020), Journal of Exposure Science & Environmental Epidemiology (CADR comparison)",
  },
  {
    id: "ozone_ionizer",
    source: "US EPA & California CARB air cleaner ozone advisory",
  },
  {
    id: "air_freshener",
    source:
      "Indoor particulate emission studies on incense, mosquito coils, and fragranced aerosols",
  },
] as const;
