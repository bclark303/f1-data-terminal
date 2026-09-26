import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLiveRecord,
  selectLiveChampionship,
  selectLiveDriverEventCounts,
  selectLiveDriverInsights,
  selectLiveDrivers,
  selectLiveFeedCoverage,
  selectLiveSessionStats,
  type LiveTimingStore,
} from "../lib/live-timing";

function fixture() {
  let store: LiveTimingStore = {};
  const feeds: Array<[string, unknown]> = [
    [
      "DriverList",
      {
        "4": { Tla: "NOR", BroadcastName: "L NORRIS", TeamName: "McLaren", TeamColour: "F47600", CountryCode: "GBR", Line: 1 },
        "16": { Tla: "LEC", BroadcastName: "C LECLERC", TeamName: "Ferrari", TeamColour: "E80020", CountryCode: "MCO", Line: 2 },
      },
    ],
    [
      "TimingData",
      {
        Lines: {
          "4": {
            Line: 1, Position: "1", LastLapTime: { Value: "1:20.200" }, BestLapTime: { Value: "1:20.000", Lap: 10 },
            NumberOfLaps: 18, NumberOfPitStops: 1,
            Sectors: { "0": { Value: "25.0" }, "1": { Value: "30.0" }, "2": { Value: "25.2" } },
            Speeds: { ST: { Value: "330" } },
          },
          "16": {
            Line: 2, Position: "2", GapToLeader: "+1.250", IntervalToPositionAhead: { Value: "+1.250", Catching: true },
            LastLapTime: { Value: "1:20.300" }, BestLapTime: { Value: "1:20.100" }, NumberOfLaps: 18,
            Sectors: { "0": { Value: "25.1" }, "1": { Value: "30.1" }, "2": { Value: "25.1" } },
            Speeds: { ST: { Value: "334" } },
          },
        },
      },
    ],
    [
      "TimingDataF1",
      { Lines: { "16": { Sectors: { "0": { Segments: { "0": { Status: 2049 }, "1": { Status: 2051 } } } } } } },
    ],
    [
      "TimingAppData",
      {
        Lines: {
          "4": { Stints: { "0": { Compound: "MEDIUM", New: "true", TotalLaps: 12 } } },
          "16": { Stints: { "0": { Compound: "HARD", New: "true", TotalLaps: 22 } } },
        },
      },
    ],
    ["LapSeries", { LapPosition: { "16": [4, 3, 2] } }],
    ["ChampionshipPrediction", { Drivers: { "16": { RacingNumber: "16", PredictedPosition: 2, PredictedPoints: 286 } } }],
    ["OvertakeSeries", { Events: [{ Lap: 7, OvertakingRacingNumber: "16", OvertakenRacingNumber: "63" }] }],
    ["PitStopSeries", { Stops: [{ RacingNumber: "16", Lap: 12, Duration: "2.3" }] }],
    ["TeamRadio", { Captures: { "0": { RacingNumber: "16", Path: "TeamRadio/LEC.mp3", Utc: "2026-09-26T12:00:00Z" } } }],
  ];
  for (const [feed, data] of feeds) store = applyLiveRecord(store, feed, data);
  return store;
}

test("extended timing, strategy and commentary selectors connect data to a driver", () => {
  const store = fixture();
  const drivers = selectLiveDrivers(store);
  const leclerc = drivers.find((driver) => driver.number === "16")!;
  assert.equal(leclerc.catching, true);
  assert.equal(leclerc.tyre, "HARD");
  assert.equal(leclerc.stintLaps, 22);
  assert.deepEqual(leclerc.sectors[0].segments, [2049, 2051]);

  const insights = selectLiveDriverInsights(store, drivers, leclerc);
  assert.ok(insights.some((item) => item.title === "Battle ahead" && item.tone === "green"));
  assert.ok(insights.some((item) => item.title === "Position trend" && item.value === "+2 places"));
  assert.ok(insights.some((item) => item.title === "Championship projection"));

  const events = selectLiveDriverEventCounts(store, "16");
  assert.equal(events.pitStops.length, 1);
  assert.equal(events.overtakesMade, 1);
  assert.equal(events.radio.length, 1);

  assert.equal(selectLiveChampionship(store)[0].projectedPoints, 286);
});

test("session statistics and feed coverage stay useful with optional feeds", () => {
  const store = fixture();
  const drivers = selectLiveDrivers(store);
  const stats = selectLiveSessionStats(drivers);
  assert.equal(stats.find((item) => item.label === "Fastest lap")?.detail, "NOR");
  assert.equal(stats.find((item) => item.label === "Top speed")?.detail, "LEC");
  assert.equal(stats.find((item) => item.label === "Closest interval")?.number, "16");

  const coverage = selectLiveFeedCoverage(store);
  assert.equal(coverage.find((item) => item.feed === "TimingDataF1")?.active, true);
  assert.equal(coverage.find((item) => item.feed === "WeatherDataSeries")?.active, false);
});