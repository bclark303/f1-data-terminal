import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLiveRecord,
  recordsFromSignalRFrames,
  selectLiveClock,
  selectLiveDrivers,
  selectLiveLapCount,
  selectLivePositions,
  selectLiveRaceControl,
  selectLiveSessionInfo,
  selectLiveTeamRadio,
  selectLiveTrackStatus,
  selectLiveWeather,
  splitSignalRFrames,
  teamRadioUrl,
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
        NumberOfLaps: 12,
        NumberOfPitStops: 1,
        Sectors: {
          "0": {
            Value: "31.100",
            PersonalFastest: true,
            Segments: {
              "0": { Status: 2048 },
              "1": { Status: 2051 },
            },
          },
          "1": { Value: "28.500" },
          "2": { Value: "20.200", OverallFastest: true },
        },
        Speeds: {
          I1: { Value: "285" },
          I2: { Value: "301" },
          FL: { Value: "267" },
          ST: { Value: "332" },
        },
      },
    },
  });
  const appStore = applyLiveRecord(timingStore, "TimingAppData", {
    Lines: {
      "1": {
        Stints: {
          "0": {
            Compound: "MEDIUM",
            New: "true",
            TotalLaps: 7,
          },
        },
      },
    },
  });
  const rows = selectLiveDrivers(appStore);
  assert.equal(rows[0].speed, 300);
  assert.equal(rows[0].position, "1");
  assert.equal(rows[0].currentLap, 12);
  assert.equal(rows[0].pitStops, 1);
  assert.equal(rows[0].sectors[0].value, "31.100");
  assert.equal(rows[0].sectors[0].personalFastest, true);
  assert.deepEqual(rows[0].sectors[0].segments, [2048, 2051]);
  assert.equal(rows[0].speeds.straight, "332");
  assert.equal(rows[0].tyre, "MEDIUM");
  assert.equal(rows[0].tyreNew, true);
});

test("live selectors produce terminal view models", () => {
  let store: LiveTimingStore = {};
  for (const [feed, data] of [
    [
      "SessionInfo",
      {
        Name: "Race",
        Type: "Race",
        Path: "2026/2026-09-20_Spanish_Grand_Prix/2026-09-20_Race/",
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
    path: "2026/2026-09-20_Spanish_Grand_Prix/2026-09-20_Race/",
  });
});


test("position, clock and team radio selectors expose additional live feeds", () => {
  let store: LiveTimingStore = {};
  store = applyLiveRecord(store, "Position.z", {
    Position: [
      {
        Timestamp: "2026-09-20T13:02:03.100Z",
        Entries: {
          "1": { X: 1000, Y: 2000, Z: 15, Status: "OnTrack" },
          "4": { X: 1100, Y: 2100, Z: 16, Status: "1" },
        },
      },
    ],
  });
  store = applyLiveRecord(store, "ExtrapolatedClock", {
    Utc: "2026-09-20T13:02:03Z",
    Remaining: "01:22:33",
    Extrapolating: true,
  });
  store = applyLiveRecord(store, "TeamRadio", {
    Captures: {
      "0": {
        Utc: "2026-09-20T13:01:00Z",
        RacingNumber: "1",
        Path: "TeamRadio/VER_1.mp3",
      },
      "1": {
        Utc: "2026-09-20T13:02:00Z",
        RacingNumber: "4",
        Path: "TeamRadio/NOR_4.mp3",
        Transcript: "Box this lap",
      },
    },
  });

  const positions = selectLivePositions(store);
  assert.equal(positions.length, 2);
  assert.deepEqual(positions[0], {
    number: "1",
    timestamp: "2026-09-20T13:02:03.100Z",
    x: 1000,
    y: 2000,
    z: 15,
    status: "OnTrack",
  });
  assert.equal(positions[1].status, "OffTrack");
  assert.deepEqual(selectLiveClock(store), {
    remaining: "01:22:33",
    extrapolating: true,
    utc: "2026-09-20T13:02:03Z",
  });
  const radio = selectLiveTeamRadio(store);
  assert.equal(radio[0].number, "4");
  assert.equal(radio[0].text, "Box this lap");

  const session = {
    meeting: "Spanish Grand Prix",
    session: "Race",
    type: "Race",
    location: "Madrid",
    country: "Spain",
    path: "2026/2026-09-20_Spanish_Grand_Prix/2026-09-20_Race/",
  };
  assert.equal(
    teamRadioUrl(session, radio[0]),
    "https://livetiming.formula1.com/static/2026/2026-09-20_Spanish_Grand_Prix/2026-09-20_Race/TeamRadio/NOR_4.mp3",
  );
});
