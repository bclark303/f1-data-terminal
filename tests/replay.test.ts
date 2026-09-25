import test from "node:test";
import assert from "node:assert/strict";
import {
  indexRows,
  sampleAt,
  windowAt,
  makeLapIndex,
  lapsAt,
  estimatedProgress,
  measuredPosition,
} from "../lib/replay-index";
import { estimate } from "../lib/g-force";
import { initialReplay, replayReducer } from "../lib/replay-state";
import { normalizeData } from "../lib/data-schema";
import { clampLayout } from "../lib/panel-layout";
import type { Lap, LocationPoint } from "../lib/types";
import type { VideoState } from "../shared/video-protocol";
const start = Date.parse("2025-06-15T18:00:00Z");
const date = (delta: number) => new Date(start + delta).toISOString();
const lap = (n: number, offset: number, duration: number | null): Lap => ({
  driver_number: 1,
  lap_number: n,
  date_start: date(offset),
  lap_duration: duration,
  duration_sector_1: null,
  duration_sector_2: null,
  duration_sector_3: null,
  is_pit_out_lap: false,
});
const video = (patch: Partial<VideoState> = {}): VideoState => ({
  version: 1,
  sourceId: "race-a",
  sequence: 1,
  currentTime: 10,
  duration: 500,
  playbackRate: 1,
  paused: false,
  buffering: false,
  ended: false,
  title: "Race",
  capturedAt: Date.now(),
  wallClockMs: null,
  contentId: null,
  ...patch,
});
function followed() {
  let state = initialReplay(start, start + 300000, 100);
  state = replayReducer(state, {
    type: "video",
    video: video(),
    now: Date.now(),
  });
  return replayReducer(state, {
    type: "anchor",
    anchor: {
      lap: 1,
      raceTimeMs: start,
      videoTime: 10,
      sourceId: "race-a",
      sessionKey: 100,
    },
  });
}
test("lap results become available only on completion and rewind removes future bests", () => {
  const index = makeLapIndex([lap(2, 90000, 80), lap(1, 0, 90)]);
  assert.equal(lapsAt(index, start + 10000).lastLap, undefined);
  assert.equal(lapsAt(index, start + 89999).bestLap, undefined);
  assert.equal(lapsAt(index, start + 90000).lastLap.lap_number, 1);
  assert.equal(lapsAt(index, start + 170000).bestLap?.lap_number, 2);
  assert.equal(lapsAt(index, start + 100000).bestLap?.lap_number, 1);
});
test("estimated position uses only a previously completed lap, no lap-one prophecy", () => {
  const index = makeLapIndex([lap(1, 0, 90), lap(2, 90000, 30)]);
  assert.equal(estimatedProgress(index, start + 10000), null);
  assert.equal(estimatedProgress(index, start + 100000), 10 / 90);
});
test("indexed lookup sorts timestamps, handles before-start and bounded windows", () => {
  const index = indexRows(
    [{ date: date(2000) }, { date: date(0) }, { date: date(1000) }],
    (r) => r.date,
  );
  assert.equal(sampleAt(index, start - 1), undefined);
  assert.equal(sampleAt(index, start + 2600, 500), undefined);
  assert.equal(windowAt(index, start + 1000, start + 2000).length, 2);
});
test("position and G estimators reject stale input", () => {
  const rows: LocationPoint[] = [0, 500, 1000].map((t, i) => ({
    date: date(t),
    driver_number: 1,
    x: i === 0 ? 0 : 10,
    y: i === 2 ? 10 : 0,
    z: 0,
  }));
  assert.equal(
    measuredPosition(
      indexRows(rows, (p) => p.date),
      start + 60000,
    ),
    null,
  );
  const result = estimate(
    [0, 500, 1000].map((t) => ({ t, point: { speed: 100 } as never })),
    rows.map((point, i) => ({ t: i * 500, point })),
    60000,
  );
  assert.deepEqual(result, { lateral: null, longitudinal: null });
});
test("constant-speed straight line estimates zero and known acceleration has the expected sign", () => {
  const locations = Array.from({ length: 12 }, (_, i) => ({
    t: i * 250,
    point: { x: i * 10, y: 0, z: 0 } as never,
  }));
  const constant = locations.map(({ t }) => ({
    t,
    point: { speed: 100 } as never,
  }));
  assert.ok(
    Math.abs(estimate(constant, locations, 2500).longitudinal!) < 1e-10,
  );
  assert.equal(estimate(constant, locations, 2500).lateral, 0);
  const accelerating = locations.map(({ t }) => ({
    t,
    point: { speed: 100 + (t / 1000) * 3.6 * 9.80665 } as never,
  }));
  assert.ok(
    Math.abs(estimate(accelerating, locations, 2500).longitudinal! - 1) < 0.001,
  );
});
test("manual controls relinquish clock ownership", () => {
  for (const action of [
    { type: "seek", value: 5000 },
    { type: "rate", value: 2 },
    { type: "pause" },
    { type: "nudge", value: 5000 },
  ] as const)
    assert.equal(replayReducer(followed(), action).following, false);
});
test("buffering freezes, disconnect pauses, matching source reconnects", () => {
  let state = followed();
  state = replayReducer(state, {
    type: "video",
    video: video({ buffering: true, currentTime: 12 }),
    now: Date.now(),
  });
  assert.equal(state.status, "stalled");
  assert.equal(state.playing, false);
  state = replayReducer(state, { type: "video", video: null, now: Date.now() });
  assert.equal(state.status, "disconnected");
  assert.equal(state.playing, false);
  state = replayReducer(state, {
    type: "video",
    video: video({ currentTime: 20 }),
    now: Date.now(),
  });
  assert.equal(state.status, "following");
  assert.ok(state.elapsed >= 10000);
});
test("different media invalidates anchor and does not jump", () => {
  const state = replayReducer(followed(), {
    type: "video",
    video: video({ sourceId: "race-b", currentTime: 400 }),
    now: Date.now(),
  });
  assert.equal(state.anchor, null);
  assert.equal(state.following, false);
  assert.equal(state.playing, false);
});
test("replay stops at end, rejects invalid numbers and resets per session", () => {
  let state = replayReducer(initialReplay(start, start + 1000, 100), {
    type: "play",
  });
  state = replayReducer(state, { type: "tick", delta: 2000, now: Date.now() });
  assert.equal(state.playing, false);
  assert.equal(state.elapsed, 1000);
  assert.equal(replayReducer(state, { type: "seek", value: NaN }), state);
  assert.equal(initialReplay(start, start + 1000, 101).anchor, null);
});
test("normalization rejects malformed rows, sorts and deduplicates exact duplicates", () => {
  const row = { date: date(0), driver_number: 1, position: 1 };
  assert.equal(normalizeData("position", [row, row]).length, 1);
  assert.throws(() => normalizeData("position", [{ ...row, date: "broken" }]));
  assert.throws(() =>
    normalizeData("position", [{ ...row, position: Infinity }]),
  );
  const result = normalizeData<{ date: string }>("position", [
    { ...row, date: date(1000) },
    row,
  ]);
  assert.equal(result[0].date, date(0));
});
test("panel stays reachable when workspace shrinks", () => {
  assert.deepEqual(
    clampLayout(
      { x: 1100, y: 700, width: 420, height: 365 },
      { width: 950, height: 778 },
    ),
    { x: 530, y: 413, width: 420, height: 365 },
  );
});

test("2026 telemetry tolerates unavailable channels and incomplete location samples", () => {
  const [telemetry] = normalizeData<{
    drs: number | null;
    n_gear: number | null;
    rpm: number | null;
    speed: number | null;
  }>("car_data", [
    {
      date: date(0),
      driver_number: 1,
      brake: 0,
      throttle: 72,
      rpm: 11800,
      speed: 294,
      drs: null,
      n_gear: 8,
    },
  ]);
  assert.equal(telemetry.speed, 294);
  assert.equal(telemetry.drs, null);

  const locations = normalizeData<LocationPoint>("location", [
    {
      date: date(0),
      driver_number: 1,
      x: null,
      y: null,
      z: null,
    },
    {
      date: date(250),
      driver_number: 1,
      x: 100,
      y: 200,
      z: null,
    },
  ]);
  assert.equal(locations.length, 1);
  assert.equal(locations[0].x, 100);
  assert.equal(locations[0].z, null);
});

test("provider pedal sentinel values become unknown without losing valid speed samples", () => {
  const [row] = normalizeData<{
    brake: number | null;
    throttle: number | null;
    speed: number;
  }>("car_data", [
    {
      date: date(0),
      driver_number: 1,
      brake: 104,
      throttle: 104,
      rpm: 0,
      speed: 0,
      drs: 1,
      n_gear: 0,
    },
  ]);
  assert.equal(row.brake, null);
  assert.equal(row.throttle, null);
  assert.equal(row.speed, 0);
  assert.equal(
    normalizeData("car_data", [
      {
        date: date(0),
        driver_number: 1,
        brake: null,
        throttle: null,
        rpm: 0,
        speed: 0,
        drs: 1,
        n_gear: 0,
      },
    ]).length,
    1,
  );
});
