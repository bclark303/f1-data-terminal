import { z } from "zod";
const number = z.number().finite();
const id = number.int().positive();
const date = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");
const nullableNumber = number.nullable().default(null);
const nullableChannel = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((value) => value ?? null);
// The provider sometimes emits byte sentinel values (for example 104) after a car stops.
// Preserve the timestamp/speed sample but represent unavailable pedal channels as unknown.
const pedal = number
  .min(0)
  .max(255)
  .nullish()
  .transform((value) => (value !== null && value !== undefined && value <= 100 ? value : null));
const driver = { driver_number: id };
const dated = { date };
export const schemas = {
  sessions: z.object({
    circuit_key: id,
    circuit_short_name: z.string(),
    country_code: z.string(),
    country_name: z.string(),
    date_end: date,
    date_start: date,
    gmt_offset: z.string(),
    location: z.string(),
    meeting_key: id,
    session_key: id,
    session_name: z.string(),
    session_type: z.string(),
    year: id,
  }),
  drivers: z.object({
    ...driver,
    full_name: z.string(),
    name_acronym: z.string(),
    team_colour: z
      .string()
      .regex(/^[0-9a-f]{6}$/i)
      .nullable()
      .transform((v) => v ?? "81909f"),
    team_name: z.string(),
    session_key: id,
  }),
  weather: z.object({
    ...dated,
    air_temperature: nullableNumber,
    humidity: nullableNumber,
    pressure: nullableNumber,
    rainfall: nullableNumber,
    track_temperature: nullableNumber,
    wind_direction: nullableNumber,
    wind_speed: nullableNumber,
  }),
  race_control: z.object({
    ...dated,
    category: z.string(),
    driver_number: id.nullable(),
    flag: z.string().nullable(),
    lap_number: nullableNumber,
    message: z.string(),
    scope: z.string().nullable(),
    sector: nullableNumber,
  }),
  position: z.object({ ...dated, ...driver, position: id }),
  intervals: z.object({
    ...dated,
    ...driver,
    gap_to_leader: z.union([number, z.string(), z.null()]),
    interval: z.union([number, z.string(), z.null()]),
  }),
  laps: z.object({
    ...driver,
    date_start: date.nullable(),
    duration_sector_1: nullableNumber,
    duration_sector_2: nullableNumber,
    duration_sector_3: nullableNumber,
    lap_duration: number.positive().nullable().default(null),
    lap_number: id,
    is_pit_out_lap: z.boolean(),
  }),
  stints: z.object({
    ...driver,
    compound: z
      .string()
      .nullable()
      .transform((v) => v ?? "UNKNOWN"),
    lap_end: nullableNumber,
    lap_start: id,
    stint_number: id,
    tyre_age_at_start: number.nonnegative(),
  }),
  car_data: z.object({
    ...dated,
    ...driver,
    brake: pedal,
    drs: nullableChannel(number.int()),
    n_gear: nullableChannel(number.int().min(0).max(8)),
    rpm: nullableChannel(number.nonnegative()),
    speed: nullableChannel(number.nonnegative().max(500)),
    throttle: pedal,
  }),
  location: z.object({
    ...dated,
    ...driver,
    x: nullableChannel(number),
    y: nullableChannel(number),
    z: nullableChannel(number),
  }),
};
export type Endpoint = keyof typeof schemas;
export function normalizeData<T>(endpoint: Endpoint, input: unknown): T[] {
  if (!Array.isArray(input) || input.length > 200000)
    throw new Error(`Invalid ${endpoint} dataset`);
  const unique = new Map<string, Record<string, unknown>>();
  for (const raw of input) {
    const result = schemas[endpoint].safeParse(raw);
    if (!result.success)
      throw new Error(
        `Invalid ${endpoint} row: ${result.error.issues[0]?.path.join(".")}`,
      );
    const row = result.data as Record<string, unknown>;
    if (endpoint === "location" && (row.x === null || row.y === null)) continue;
    if (
      endpoint === "car_data" &&
      ["rpm", "speed", "n_gear", "throttle", "brake", "drs"].every(
        (key) => row[key] === null,
      )
    )
      continue;
    if (typeof row.date === "string")
      row.date = new Date(row.date).toISOString();
    if (typeof row.date_start === "string")
      row.date_start = new Date(row.date_start).toISOString();
    // Exact duplicate removal preserves distinct race-control events sharing a timestamp.
    unique.set(JSON.stringify(row), row);
  }
  const rows = [...unique.values()];
  rows.sort((a, b) => {
    const time = (r: Record<string, unknown>) =>
      typeof (r.date ?? r.date_start) === "string"
        ? Date.parse(String(r.date ?? r.date_start))
        : Number(r.lap_start ?? r.driver_number ?? 0);
    return time(a) - time(b);
  });
  return rows as T[];
}
