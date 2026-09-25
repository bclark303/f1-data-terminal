import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLiveRecord,
  recordsFromSignalRFrames,
  selectLiveDrivers,
  selectLiveLapCount,
  selectLiveRaceControl,
  selectLiveSessionInfo,
  selectLiveTrackStatus,
  selectLiveWeather,
  splitSignalRFrames,
  type LiveTimingStore,
} from "../lib/live-timing";

test("SignalR core frames expose subscription snapshots and feed deltas", () => {
  const raw =
    JSON.stringify({}) +
    "\x1e" +
    JSON.stringify({
      type: 3,
      result: {
        DriverList: { "1": { Tla: "VER" } },
        LapCount: { CurrentLap: 4, TotalLaps: 57 },
      },
    }) +
    "\x1e" +
    JSON.stringify({
      type: 1,
      target: "feed",
      arguments: ["TrackStatus", { Status: "2" }, "timestamp"],
    }) +
    "\x1e";
  const records = recordsFromSignalRFrames(splitSignalRFrames(raw));
  assert.deepEqual(
    records.map((row) => row.feed),
    ["DriverList", "LapCount", "TrackStatus"],
  );
});

test("live timing deltas merge while car data snapshots replace", () => {
  let store: LiveTimingStore = {};
  store = applyLiveRecord(store, "TimingData", {
    Lines: { "1": { Position: "1", LastLapTime: { Value: "1:20.000" } } },
  });
  store = applyLiveRecord(store, "TimingData", {
    Lines: { "1": { Position: "2" } },
  });
  assert.equal(
    (
      (store.TimingData as { Lines: Record<string, { Position: string; LastLapTime: { Value: string } }> })
        .Lines["1"]
    ).LastLapTime.Value,
    "1:20.000",
  );

  store = applyLiveRecord(store, "CarData.z", {
    Entries: [{ Cars: { "1": { Channels: { "2": 100 } } } }],
  });
  store = applyLiveRecord(store, "CarData.z", {
    Entries: [{ Cars: { "1": { Channels: { "2": 300 } } } }],
  });
  const driversStore = applyLiveRecord(store, "DriverList", {
    "1": {
      Tla: "VER",
      BroadcastName: "M VERSTAPPEN",
      TeamName: "Red Bull Racing",
      TeamColour: "3671C6",
      Line: 1,
    },
  });
  const timingStore = applyLiveRecord(driversStore, "TimingData", {
    Lines: {
      "1": {
        Line: 1,
        Position: "1",
        GapToLeader: "",
        IntervalToPositionAhead: { Value: "" },
      },
    },
  });
  const rows = selectLiveDrivers(timingStore);
  assert.equal(rows[0].speed, 300);
  assert.equal(rows[0].position, "1");
});

test("live selectors produce terminal view models", () => {
  let store: LiveTimingStore = {};
  for (const [feed, data] of [
    [
      "SessionInfo",
      {
        Name: "Race",
        Type: "Race",
        Meeting: {
          Name: "Spanish Grand Prix",
          Location: "Madrid",
          Country: { Name: "Spain" },
        },
      },
    ],
    ["LapCount", { CurrentLap: 12, TotalLaps: 66 }],
    ["TrackStatus", { Status: "4" }],
    [
      "WeatherData",
      {
        AirTemp: "27.1",
        TrackTemp: "42.0",
        Humidity: "38",
        Pressure: "1008",
        WindSpeed: "2.5",
        WindDirection: "180",
        Rainfall: "0",
      },
    ],
    [
      "RaceControlMessages",
      {
        Messages: {
          "0": {
            Utc: "2026-09-20T13:01:02Z",
            Lap: 12,
            Category: "Flag",
            Flag: "YELLOW",
            Message: "YELLOW FLAG IN SECTOR 2",
          },
        },
      },
    ],
  ] as Array<[string, unknown]>)
    store = applyLiveRecord(store, feed, data);

  assert.deepEqual(selectLiveLapCount(store), { current: 12, total: 66 });
  assert.equal(selectLiveTrackStatus(store)?.label, "SAFETY CAR");
  assert.equal(selectLiveWeather(store)?.airTemp, "27.1");
  assert.equal(selectLiveRaceControl(store)[0].flag, "YELLOW");
  assert.deepEqual(selectLiveSessionInfo(store), {
    meeting: "Spanish Grand Prix",
    session: "Race",
    type: "Race",
    location: "Madrid",
    country: "Spain",
  });
});
