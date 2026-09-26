import { test, expect } from "@playwright/test";
test("race loads, prevents future lap results, seeks and preserves accessible controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Timing / Classification" }),
  ).toBeVisible();
  const first = page.locator(".driverRow").first();
  await expect(first.locator("span").nth(4)).toHaveText("—");
  await page.getByRole("slider", { name: "Replay position" }).press("End");
  await expect(first.locator("span").nth(4)).toHaveText("1:30.000");
  await page.getByRole("slider", { name: "Replay position" }).press("Home");
  await expect(first.locator("span").nth(4)).toHaveText("—");
  await page.getByLabel("Selected driver", { exact: true }).selectOption("4");
  await expect(
    page.getByRole("heading", { name: "Lando Norris" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "DETAILS" }).click();
  await page.getByRole("button", { name: "MATCH NOW" }).click();
  await expect(
    page.getByRole("button", { name: "Pause replay" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close synchronization" }).click();
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.setViewportSize({ width: 950, height: 800 });
  await page.waitForTimeout(100);
  const reachable = await page
    .locator(".floatingPanel")
    .evaluateAll((elements) =>
      elements.every((el) => {
        const r = el.getBoundingClientRect(),
          p = el.parentElement!.getBoundingClientRect();
        return r.left >= p.left - 1 && r.right <= p.right + 1;
      }),
    );
  expect(reachable).toBe(true);
  await page.getByRole("button", { name: "RESET LAYOUT" }).click();
  expect(errors).toEqual([]);
});
test("live mode renders F1 timing, telemetry, weather and race control", async ({
  page,
}) => {
  const records = [
    ["SessionInfo", {
      Name: "Race",
      Type: "Race",
      Path: "2026/2026-09-20_Spanish_Grand_Prix/2026-09-20_Race/",
      Meeting: {
        Name: "Spanish Grand Prix",
        Location: "Madrid",
        Country: { Name: "Spain" },
      },
    }],
    ["SessionStatus", { Status: "Started" }],
    ["ExtrapolatedClock", {
      Utc: "2026-09-20T13:00:00Z",
      Remaining: "01:22:33",
      Extrapolating: true,
    }],
    ["LapCount", { CurrentLap: 12, TotalLaps: 66 }],
    ["TrackStatus", { Status: "1" }],
    ["WeatherData", {
      AirTemp: "27.1",
      TrackTemp: "42.0",
      Humidity: "38",
      Pressure: "1008",
      WindSpeed: "2.5",
      WindDirection: "180",
      Rainfall: "0",
    }],
    ["DriverList", {
      "1": {
        Tla: "VER",
        BroadcastName: "M VERSTAPPEN",
        TeamName: "Red Bull Racing",
        TeamColour: "3671C6",
        Line: 1,
      },
    }],
    ["TimingData", {
      Lines: {
        "1": {
          Line: 1,
          Position: "1",
          GapToLeader: "",
          IntervalToPositionAhead: { Value: "" },
          LastLapTime: { Value: "1:20.000" },
          BestLapTime: { Value: "1:19.500" },
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
    }],
    ["TimingAppData", {
      Lines: {
        "1": {
          Stints: {
            "0": {
              Compound: "MEDIUM",
              New: "true",
              TotalLaps: 5,
            },
          },
        },
      },
    }],
    ["CarData.z", {
      Entries: [
        {
          Cars: {
            "1": {
              Channels: {
                "0": 12000,
                "2": 305,
                "3": 8,
                "4": 100,
                "5": 0,
                "45": 10,
              },
            },
          },
        },
      ],
    }],
    ["Position.z", {
      Position: [
        {
          Timestamp: "2026-09-20T13:01:02Z",
          Entries: {
            "1": { X: 1000, Y: 2000, Z: 15, Status: "OnTrack" },
          },
        },
      ],
    }],
    ["TeamRadio", {
      Captures: {
        "0": {
          Utc: "2026-09-20T13:00:50Z",
          RacingNumber: "1",
          Path: "TeamRadio/VER_1.mp3",
          Transcript: "Box this lap",
        },
      },
    }],
    ["RaceControlMessages", {
      Messages: {
        "0": {
          Utc: "2026-09-20T13:01:02Z",
          Lap: 12,
          Category: "Flag",
          Flag: "GREEN",
          Message: "TRACK CLEAR",
        },
      },
    }],
  ];

  const body = [
    'event: status\ndata: {"status":"connected","at":1}\n',
    ...records.map(
      ([feed, data]) =>
        `event: record\ndata: ${JSON.stringify({ feed, data, at: 2 })}\n`,
    ),
  ].join("\n");

  await page.route("**/api/live-timing", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    }),
  );

  await page.goto("/live");
  await expect(page.getByText("Spanish Grand Prix")).toBeVisible();
  await expect(page.getByText("M VERSTAPPEN")).toBeVisible();
  await expect(page.getByText("305 km/h", { exact: true })).toBeVisible();
  await expect(page.getByText("Aero ch45", { exact: true })).toBeVisible();
  await expect(page.getByText("Race Story", { exact: true })).toBeVisible();
  await expect(page.getByText("Strategy / Activity", { exact: true })).toBeVisible();
  await expect(page.getByText("Feed Coverage", { exact: true })).toBeVisible();
  await expect(page.getByText("31.100", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".liveDriverCard").getByText("332 km/h", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("TRACK CLEAR").first()).toBeVisible();
  await expect(page.getByText("27.1°C")).toBeVisible();
  await expect(page.getByText("LAP 12 / 66")).toBeVisible();
  await expect(page.getByText("CLOCK 01:22:33 · RUNNING")).toBeVisible();
  await expect(
    page.getByText("Live Track / XY Position", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 cars · ~220 ms position feed/)).toBeVisible();
  await expect(page.getByText("Box this lap")).toBeVisible();
  await expect(page.locator(".liveRadioItem audio")).toHaveAttribute(
    "src",
    /TeamRadio\/VER_1\.mp3$/,
  );
});

test("race selector switches between available historical races", async ({
  page,
}) => {
  await page.goto("/");
  const selector = page.getByLabel("Race session");
  await expect(selector).toHaveValue("9999");
  await expect(selector.locator("option")).toHaveCount(2);

  await selector.selectOption("9998");
  await expect(page).toHaveURL(/session=9998/);
  await expect(page.getByText("2024 GREAT BRITAIN GRAND PRIX")).toBeVisible();
  await expect(page.getByLabel("Race session")).toHaveValue("9998");
});

test("driver error can be retried without changing selection", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/replay-data?mode=telemetry*", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { error: "Provider temporarily busy" },
        })
      : route.continue(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Retry driver data" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry driver data" }).click();
  await expect(page.getByText("REPLAY DATA", { exact: true })).toBeVisible();
});
test("paired F1 TV media UTC directly locates the replay and follows scrubbing", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({ status: 404, json: { error: "Offset unavailable" } }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    let sequence = 0;
    const state = {
      currentTime: 100,
      wallClockMs: Date.parse("2025-06-15T18:02:00.000Z"),
    };
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "utc-player",
              sequence: sequence++,
              currentTime: state.currentTime,
              duration: 5000,
              paused: true,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "F1 TV replay with DASH UTC",
              capturedAt: Date.now(),
              wallClockMs: state.wallClockMs,
            },
          },
          location.origin,
        ),
      200,
    );
    (
      window as unknown as {
        utcTimer: number;
        utcVideoState: { currentTime: number; wallClockMs: number };
      }
    ).utcTimer = timer;
    (
      window as unknown as {
        utcTimer: number;
        utcVideoState: { currentTime: number; wallClockMs: number };
      }
    ).utcVideoState = state;
  });

  await expect(page.getByText(/VIDEO ●/)).toBeVisible();
  await expect(page.getByRole("slider", { name: "Replay position" })).toHaveValue(
    "120000",
  );
  await expect(
    page.getByRole("slider", { name: "Replay position" }),
  ).toBeDisabled();

  await page.evaluate(() => {
    const state = (
      window as unknown as {
        utcVideoState: { currentTime: number; wallClockMs: number };
      }
    ).utcVideoState;
    state.currentTime = 160;
    state.wallClockMs = Date.parse("2025-06-15T18:03:00.000Z");
  });
  await expect(page.getByRole("slider", { name: "Replay position" })).toHaveValue(
    "180000",
  );

  await page.getByRole("button", { name: "DETAILS" }).click();
  await expect(page.getByText("MATCHED · DASH UTC", { exact: true })).toBeVisible();
});

test("visible F1 TV current-time label overrides total duration and raw media clock", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({
      status: 200,
      json: { sessionStartSec: 551.3, contentId: "1000010374" },
    }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    let sequence = 0;
    const state = { currentTime: 616, rawCurrentTime: 380.9 };
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "visible-f1tv-clock",
              sequence: sequence++,
              currentTime: state.currentTime,
              rawCurrentTime: state.rawCurrentTime,
              clockSource: "f1tv-ui",
              uiClockText: "00:10:16",
              uiDuration: 7902,
              duration: 7902,
              paused: false,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "F1 TV | 2026 Spanish Grand Prix",
              capturedAt: Date.now(),
              wallClockMs: null,
              contentId: "1000010374",
            },
          },
          location.origin,
        ),
      200,
    );
    (
      window as unknown as {
        f1tvUiTimer: number;
        f1tvUiState: { currentTime: number; rawCurrentTime: number };
      }
    ).f1tvUiTimer = timer;
    (
      window as unknown as {
        f1tvUiTimer: number;
        f1tvUiState: { currentTime: number; rawCurrentTime: number };
      }
    ).f1tvUiState = state;
  });

  await expect(page.getByText(/VIDEO ●/)).toBeVisible();
  await page.getByRole("button", { name: "VIDEO DIAG" }).click();
  const diag = page.locator(".videoDiagPanel");
  await expect(
    diag.getByText("VISIBLE F1 TV TIMELINE", { exact: true }),
  ).toBeVisible();
  await expect(diag.getByText("10:16", { exact: true }).first()).toBeVisible();
  await expect(
    diag.getByText("00:10:16", { exact: true }).first(),
  ).toBeVisible();
  await expect(diag.getByText("2:11:42", { exact: true }).first()).toBeVisible();
  await expect(diag.getByText("6:20.9", { exact: true })).toBeVisible();
  await expect(
    diag.getByText("ARMED — SCRUB TO RACE START").first(),
  ).toBeVisible();

  await page.evaluate(() => {
    const state = (
      window as unknown as {
        f1tvUiState: { currentTime: number; rawCurrentTime: number };
      }
    ).f1tvUiState;
    state.currentTime = 552;
    state.rawCurrentTime = 381;
  });

  await expect(
    page.getByRole("button", { name: "SYNCED", exact: true }),
  ).toBeVisible();
  await expect(
    diag.getByText("VIDEO LOCK IS ACTIVE").first(),
  ).toBeVisible();
});

test("Bitmovin player clock wins over a shifted raw media timestamp", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({
      status: 200,
      json: { sessionStartSec: 551, contentId: "1000010374" },
    }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    let sequence = 0;
    const state = { currentTime: 552, rawCurrentTime: 179 };
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "bitmovin-player",
              sequence: sequence++,
              currentTime: state.currentTime,
              rawCurrentTime: state.rawCurrentTime,
              clockSource: "bitmovin-ui",
              duration: 7200,
              paused: false,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "F1 TV | Fixture Grand Prix",
              capturedAt: Date.now(),
              wallClockMs: null,
              contentId: "1000010374",
            },
          },
          location.origin,
        ),
      200,
    );
    (
      window as unknown as {
        bitmovinTimer: number;
        bitmovinState: { currentTime: number; rawCurrentTime: number };
      }
    ).bitmovinTimer = timer;
    (
      window as unknown as {
        bitmovinTimer: number;
        bitmovinState: { currentTime: number; rawCurrentTime: number };
      }
    ).bitmovinState = state;
  });

  await expect(page.getByText(/VIDEO ●/)).toBeVisible();
  await expect(page.getByRole("slider", { name: "Replay position" })).toHaveValue(
    "1000",
  );
  await page.getByRole("button", { name: "DETAILS" }).click();
  await expect(page.getByText(/BITMOVIN PLAYER/)).toBeVisible();
  await expect(page.getByText(/MEDIA 2:59/)).toBeVisible();
  await expect(
    page.getByText("SYNCED · RACE START", { exact: true }),
  ).toBeVisible();
});

test("video diagnostic window exposes sync clocks and anchor state", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({
      status: 200,
      json: { sessionStartSec: 30, contentId: "fixture-content" },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "VIDEO DIAG" }).click();
  const diag = page.locator(".videoDiagPanel");
  await expect(diag).toBeVisible();

  await page.evaluate(() => {
    let sequence = 0;
    const state = { currentTime: 100, rawCurrentTime: 20 };
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "diag-player",
              sequence: sequence++,
              currentTime: state.currentTime,
              rawCurrentTime: state.rawCurrentTime,
              clockSource: "bitmovin-ui",
              duration: 500,
              paused: true,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "Diagnostic F1 TV replay",
              capturedAt: Date.now(),
              wallClockMs: null,
              contentId: "fixture-content",
            },
          },
          location.origin,
        ),
      200,
    );
    (
      window as unknown as {
        diagTimer: number;
        diagState: { currentTime: number; rawCurrentTime: number };
      }
    ).diagTimer = timer;
    (
      window as unknown as {
        diagTimer: number;
        diagState: { currentTime: number; rawCurrentTime: number };
      }
    ).diagState = state;
  });

  await expect(
    diag.getByText("ARMED — SCRUB TO RACE START").first(),
  ).toBeVisible();
  await expect(
    diag.getByText("bitmovin-ui", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    diag.getByText("fixture-content", { exact: true }).first(),
  ).toBeVisible();
  await expect(diag.getByText("1:40", { exact: true }).first()).toBeVisible();
  await expect(diag.getByText("0:20", { exact: true }).first()).toBeVisible();

  await page.evaluate(() => {
    const state = (
      window as unknown as {
        diagState: { currentTime: number; rawCurrentTime: number };
      }
    ).diagState;
    state.currentTime = 31;
    state.rawCurrentTime = 21;
  });

  await expect(diag.getByText("VIDEO LOCK IS ACTIVE").first()).toBeVisible();
  await expect(diag.getByText("START", { exact: true }).first()).toBeVisible();
  await expect(diag.getByText("ON", { exact: true }).first()).toBeVisible();
});

test("SYNC reads current F1 TV time, jumps data, and follows later seeks", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({
      status: 200,
      json: { sessionStartSec: 551.3, contentId: "fixture-content" },
    }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    let sequence = 0;
    const state = { currentTime: 616, rawCurrentTime: 380 };
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "sync-current-player",
              sequence: sequence++,
              currentTime: state.currentTime,
              rawCurrentTime: state.rawCurrentTime,
              clockSource: "f1tv-ui",
              uiClockText: "00:10:16",
              uiDuration: 7902,
              duration: 7902,
              paused: true,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "F1 TV | Fixture Grand Prix",
              capturedAt: Date.now(),
              wallClockMs: null,
              contentId: "fixture-content",
            },
          },
          location.origin,
        ),
      200,
    );
    (
      window as unknown as {
        syncCurrentTimer: number;
        syncCurrentState: { currentTime: number; rawCurrentTime: number };
      }
    ).syncCurrentTimer = timer;
    (
      window as unknown as {
        syncCurrentTimer: number;
        syncCurrentState: { currentTime: number; rawCurrentTime: number };
      }
    ).syncCurrentState = state;
  });

  await expect(page.getByText(/VIDEO ●/)).toBeVisible();
  await page.getByRole("button", { name: "SYNC", exact: true }).click();

  // 10:16 video - 9:11.3 race-start offset = 1:04.7 into the race.
  await expect(
    page.getByRole("slider", { name: "Replay position" }),
  ).toHaveValue("64700");
  await expect(
    page.getByRole("slider", { name: "Replay position" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "SYNCED", exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    const state = (
      window as unknown as {
        syncCurrentState: { currentTime: number; rawCurrentTime: number };
      }
    ).syncCurrentState;
    // UI/player clock can jump somewhere unrelated; raw media advances 60s.
    state.currentTime = 2500;
    state.rawCurrentTime = 440;
  });

  await expect(
    page.getByRole("slider", { name: "Replay position" }),
  ).toHaveValue("124700");

  await page.getByRole("button", { name: "DETAILS" }).click();
  await expect(
    page.getByText(/SYNCED · CURRENT VIDEO TIME · RAW FOLLOW/),
  ).toBeVisible();
  await expect(page.getByText(/CURRENT VIDEO →/)).toBeVisible();
});

test("scrubbing F1 TV to race start automatically locks replay sync", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({
      status: 200,
      json: { sessionStartSec: 30, contentId: "fixture-content" },
    }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    let sequence = 0;
    const state = { currentTime: 100 };
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "auto-player",
              sequence: sequence++,
              currentTime: state.currentTime,
              duration: 500,
              paused: true,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "Fixture F1 TV replay",
              capturedAt: Date.now(),
            },
          },
          location.origin,
        ),
      250,
    );
    (
      window as unknown as {
        autoSyncTimer: number;
        autoVideoState: { currentTime: number };
      }
    ).autoSyncTimer = timer;
    (
      window as unknown as {
        autoSyncTimer: number;
        autoVideoState: { currentTime: number };
      }
    ).autoVideoState = state;
  });

  await expect(page.getByText("VIDEO ●")).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Replay position" }),
  ).not.toBeDisabled();
  await page.getByRole("button", { name: "DETAILS" }).click();
  await expect(
    page.getByText(
      "SCRUB F1 TV TO RACE START · TARGET 0:30 · +1:10",
      { exact: true },
    ),
  ).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as {
        autoVideoState: { currentTime: number };
      }
    ).autoVideoState.currentTime = 31;
  });

  await expect(
    page.getByRole("button", { name: "SYNCED", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("slider", { name: "Replay position" })).toHaveValue(
    "1000",
  );
  await expect(
    page.getByRole("slider", { name: "Replay position" }),
  ).toBeDisabled();
  await expect(
    page.getByText("SYNCED · RACE START", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("RACE START @ 0:30", { exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as {
        autoVideoState: { currentTime: number };
      }
    ).autoVideoState.currentTime = 160;
  });
  await expect(page.getByRole("slider", { name: "Replay position" })).toHaveValue(
    "130000",
  );
});

test("offset auto-sync refuses a mismatched F1 TV content asset", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({
      status: 200,
      json: { sessionStartSec: 30, contentId: "1000001234" },
    }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    let sequence = 0;
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "wrong-content",
              sequence: sequence++,
              currentTime: 190,
              duration: 1800,
              paused: false,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "F1 TV edited replay",
              capturedAt: Date.now(),
              wallClockMs: null,
              contentId: "1000005678",
            },
          },
          location.origin,
        ),
      200,
    );
    (window as unknown as { wrongContentTimer: number }).wrongContentTimer =
      timer;
  });

  await expect(page.getByText(/VIDEO ●/)).toBeVisible();
  await expect(page.getByRole("button", { name: "SYNC", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "DETAILS" }).click();
  await expect(
    page.getByText("F1 TV CONTENT DOES NOT MATCH FULL RACE REPLAY", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("1000001234 · BROWSER HAS 1000005678", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Replay position" }),
  ).not.toBeDisabled();
});

test("direct sync follows pause, rejects malformed samples, and manual seek disengages", async ({
  page,
}) => {
  await page.route("**/api/auto-sync?sessionKey=9999", (route) =>
    route.fulfill({ status: 404, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "SYNC", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "DETAILS" })).toBeVisible();
  await page.evaluate(() => {
    let sequence = 0;
    const timer = window.setInterval(
      () =>
        window.postMessage(
          {
            source: "F1_DATA_TERMINAL_EXTENSION",
            state: {
              version: 1,
              sourceId: "test-player",
              sequence: sequence++,
              currentTime: 100,
              duration: 500,
              paused: true,
              buffering: false,
              ended: false,
              playbackRate: 1,
              title: "Fixture replay",
              capturedAt: Date.now(),
            },
          },
          location.origin,
        ),
      250,
    );
    (window as unknown as { testTimer: number }).testTimer = timer;
  });
  await expect(page.getByText("VIDEO ●")).toBeVisible();
  await page.getByRole("button", { name: "DETAILS" }).click();
  await page.getByRole("button", { name: "MATCH NOW" }).click();
  await expect(
    page.getByRole("button", { name: "ON", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ON", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "OFF", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close synchronization" }).click();
  await page.getByRole("slider").press("Home");
  await page.getByRole("button", { name: "DETAILS" }).click();
  await expect(
    page.getByRole("button", { name: "OFF", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.postMessage(
      {
        source: "F1_DATA_TERMINAL_EXTENSION",
        state: { currentTime: "broken" },
      },
      location.origin,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Timing / Classification" }),
  ).toBeVisible();
});
test("retired bridge discloses no state and invalid proxy inputs are rejected", async ({
  request,
}) => {
  const response = await request.post("/api/video-sync", {
    data: { currentTime: 12, url: "private" },
  });
  expect(response.status()).toBe(410);
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  expect((await request.get("/api/video-sync")).status()).toBe(410);
  expect(
    (
      await request.get("/api/replay-data?mode=track&sessionKey=-1&driver=1")
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.get("/api/replay-data?mode=track&sessionKey=9997&driver=1")
    ).status(),
  ).toBe(404);
  expect((await request.get("/api/auto-sync?sessionKey=-1")).status()).toBe(400);
  expect((await request.get("/api/auto-sync?sessionKey=9997")).status()).toBe(
    404,
  );
});
