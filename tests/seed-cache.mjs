import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
export async function seedCache(root) {
  await mkdir(root, { recursive: true });
  const start = Date.parse("2025-06-15T18:00:00Z"),
    date = (ms) => new Date(start + ms).toISOString();
  const session = {
    circuit_key: 1,
    circuit_short_name: "Montreal",
    country_code: "CAN",
    country_name: "Canada",
    date_start: date(0),
    date_end: date(300000),
    gmt_offset: "-04:00:00",
    location: "Montreal",
    meeting_key: 1,
    session_key: 9999,
    session_name: "Race",
    session_type: "Race",
    year: 2025,
  };
  const drivers = [1, 4].map((driver_number) => ({
    driver_number,
    full_name: driver_number === 1 ? "Max Verstappen" : "Lando Norris",
    name_acronym: driver_number === 1 ? "VER" : "NOR",
    team_colour: driver_number === 1 ? "3671C6" : "FF8000",
    team_name: driver_number === 1 ? "Red Bull Racing" : "McLaren",
    session_key: 9999,
  }));
  async function save(endpoint, params, rows) {
    const url = new URL(`https://api.openf1.org/v1/${endpoint}`);
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, String(v));
    await writeFile(
      join(
        root,
        createHash("sha256").update(url.toString()).digest("hex") + ".json",
      ),
      JSON.stringify(rows),
    );
  }
  await save("sessions", { year: 2025, country_name: "Canada" }, [session]);
  await save("drivers", { session_key: 9999 }, drivers);
  await save(
    "laps",
    { session_key: 9999 },
    drivers.flatMap((d) =>
      [1, 2, 3].map((lap_number, i) => ({
        driver_number: d.driver_number,
        lap_number,
        date_start: date(i * 90000),
        lap_duration: 90,
        is_pit_out_lap: false,
        duration_sector_1: 30,
        duration_sector_2: 30,
        duration_sector_3: 30,
      })),
    ),
  );
  await save("weather", { session_key: 9999 }, [
    {
      date: date(0),
      air_temperature: 25,
      humidity: 50,
      pressure: 1000,
      rainfall: 0,
      track_temperature: 40,
      wind_direction: 10,
      wind_speed: 2,
    },
  ]);
  await save("race_control", { session_key: 9999 }, [
    {
      date: date(1000),
      category: "Flag",
      driver_number: null,
      flag: "GREEN",
      lap_number: 1,
      message: "GREEN LIGHT - PIT EXIT OPEN",
      scope: "Track",
      sector: null,
    },
  ]);
  await save(
    "position",
    { session_key: 9999 },
    drivers.map((d, i) => ({
      date: date(0),
      driver_number: d.driver_number,
      position: i + 1,
    })),
  );
  await save(
    "intervals",
    { session_key: 9999 },
    drivers.map((d, i) => ({
      date: date(0),
      driver_number: d.driver_number,
      gap_to_leader: i,
      interval: i,
    })),
  );
  await save(
    "stints",
    { session_key: 9999 },
    drivers.map((d) => ({
      driver_number: d.driver_number,
      compound: "MEDIUM",
      lap_start: 1,
      lap_end: 3,
      stint_number: 1,
      tyre_age_at_start: 0,
    })),
  );
  for (const d of drivers) {
    const timestamps = Array.from({ length: 1201 }, (_, i) => i * 250);
    await save(
      "car_data",
      { session_key: 9999, driver_number: d.driver_number },
      timestamps.map((t) => ({
        date: date(t),
        driver_number: d.driver_number,
        speed: 100,
        rpm: 8000,
        n_gear: 4,
        throttle: 70,
        brake: 0,
        drs: 0,
      })),
    );
    await save(
      "location",
      { session_key: 9999, driver_number: d.driver_number },
      timestamps.map((t) => ({
        date: date(t),
        driver_number: d.driver_number,
        x: 500 + 400 * Math.cos((t / 90000) * 2 * Math.PI),
        y: 300 + 200 * Math.sin((t / 90000) * 2 * Math.PI),
        z: 0,
      })),
    );
  }
}
if (process.argv[1]?.endsWith("seed-cache.mjs"))
  await seedCache(process.argv[2]);
