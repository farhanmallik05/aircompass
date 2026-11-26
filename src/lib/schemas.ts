import { z } from "zod";
import { sanitizeUserText } from "./security/sanitize";
import { ACTION_IDS, COMMUTE_MODES, GROUPS } from "./types";

export const PlaceSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
});

export const ProfileSchema = z.strictObject({
  lang: z.enum(["en", "hi"]),
  place: PlaceSchema,
  household: z.strictObject({
    adults: z.number().int().min(0).max(20),
    children: z.number().int().min(0).max(20),
    seniors: z.number().int().min(0).max(20),
    conditions: z.array(z.enum(["respiratory", "cardiac", "pregnant"])).max(3),
  }),
  home: z.strictObject({
    windows: z.enum(["sealed", "normal", "leaky"]),
    purifier: z.enum(["none", "hepa", "diy"]),
    cooking: z.enum(["lpg", "induction", "biomass", "other"]),
    roomAreaM2: z.number().finite().min(4).max(500),
  }),
  commute: z.strictObject({
    mode: z.enum(COMMUTE_MODES),
    km: z.number().finite().min(0).max(200),
    daysPerWeek: z.number().int().min(0).max(7),
  }),
  habits: z.strictObject({
    morningOutdoorExercise: z.boolean(),
    schoolRun: z.boolean(),
  }),
  budget: z.enum(["zero", "low", "medium"]),
  notes: z
    .string()
    .max(300)
    .transform((s) => sanitizeUserText(s, 300))
    .optional(),
});

export const HourPointSchema = z.strictObject({
  t: z.string().min(4).max(40),
  pm25: z.number().finite().min(0).max(2000),
  pm10: z.number().finite().min(0).max(3000),
  usAqi: z.number().finite().min(0).max(500),
  tempC: z.number().finite().min(-60).max(65).optional(),
  rh: z.number().finite().min(0).max(100).optional(),
  windKmh: z.number().finite().min(0).max(250).optional(),
});

export const AirContextSchema = z.strictObject({
  place: PlaceSchema,
  source: z.enum(["live", "demo"]),
  dataNote: z.enum(["cams_europe_11km", "cams_global_25_45km", "recorded", "illustrative"]),
  recordedDate: z.string().max(40).optional(),
  calibrationFactor: z.number().finite().min(0.5).max(3).optional(),
  fetchedAt: z.string().min(4).max(40),
  hours: z.array(HourPointSchema).min(1).max(120),
  nowIndex: z.number().int().min(0).max(119),
});

export const ContextQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(80).optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lon: z.number().finite().min(-180).max(180).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  mode: z.enum(["live", "demo"]).optional(),
  observedPm25: z.number().finite().min(0).max(2000).optional(),
});

export const PlanRequestSchema = z.strictObject({
  profile: ProfileSchema,
  context: AirContextSchema,
});

export const ChatTurnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(1500),
});

export const ChatRequestSchema = z.strictObject({
  profile: ProfileSchema,
  context: AirContextSchema,
  history: z.array(ChatTurnSchema).max(6),
  message: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .transform((s) => sanitizeUserText(s, 500)),
});

export const SimulateScenarioArgsSchema = z.strictObject({
  windowsOpenHours: z.array(z.number().int().min(0).max(23)).max(24).optional(),
  envelope: z.enum(["sealed", "normal", "leaky"]).optional(),
  purifier: z.enum(["none", "hepa", "diy"]).optional(),
  purifierHours: z.array(z.number().int().min(0).max(23)).max(24).optional(),
  exerciseHour: z.number().int().min(0).max(23).nullable().optional(),
  exerciseIndoors: z.boolean().optional(),
  commuteMode: z.enum(COMMUTE_MODES).optional(),
  commuteDaysPerWeek: z.number().int().min(0).max(7).optional(),
  n95Outdoors: z.boolean().optional(),
  cooking: z.enum(["lpg", "induction", "biomass", "other"]).optional(),
  cookVent: z.boolean().optional(),
});

export const PlanOutSchema = z.strictObject({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(360),
  cards: z
    .array(
      z.strictObject({
        actionId: z.enum(ACTION_IDS),
        title: z.string().min(1).max(80),
        why: z.string().min(1).max(240),
        when: z.string().min(1).max(120),
        steps: z.array(z.string().min(1).max(120)).min(1).max(3),
      }),
    )
    .min(5)
    .max(8),
  memberNotes: z
    .array(
      z.strictObject({
        group: z.enum(GROUPS),
        note: z.string().min(1).max(200),
      }),
    )
    .max(5),
  tradeoffs: z.array(z.string().min(1).max(200)).max(2),
});

export const OpenMeteoAirResponseSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    pm2_5: z.array(z.number().finite().nullable()),
    pm10: z.array(z.number().finite().nullable()),
    us_aqi: z.array(z.number().finite().nullable()),
  }),
  current: z
    .object({
      time: z.string().optional(),
      pm2_5: z.number().finite().nullable().optional(),
      pm10: z.number().finite().nullable().optional(),
      us_aqi: z.number().finite().nullable().optional(),
    })
    .optional(),
});

export const OpenMeteoWeatherResponseSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().finite().nullable()),
    relative_humidity_2m: z.array(z.number().finite().nullable()),
    wind_speed_10m: z.array(z.number().finite().nullable()),
  }),
});

export const OpenMeteoGeocodeResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number().finite(),
        longitude: z.number().finite(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});
