import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import {
  isTerminalUrl,
  parseVideoState,
  isNewerState,
  STALE_MS,
} from "../shared/video-protocol.js";
function harness() {
  let listener: (m: unknown, s: unknown) => void = () => {};
  const storage: Record<string, unknown> = {
    sourceTabId: 42,
    terminalTabs: [99],
  };
  const sent: Array<{
    tab: number;
    message: {
      state?: { currentTime: number; contentId?: string | null } | null;
    };
    frame: number;
  }> = [];
  let now = 10000;
  const chrome = {
    storage: {
      session: {
        get: async (key: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(key) ? key : [key]).map((k) => [k, storage[k]]),
          ),
        set: async (values: object) => Object.assign(storage, values),
        remove: async (keys: string | string[]) =>
          (Array.isArray(keys) ? keys : [keys]).forEach(
            (k) => delete storage[k],
          ),
      },
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
      onClicked: { addListener: () => {} },
    },
    tabs: {
      get: async (id: number) => ({
        id,
        url:
          id === 99
            ? "http://localhost:3000/"
            : id === 42
              ? "https://f1tv.formula1.com/detail/1000001234/0?action=play"
              : "http://localhost:4321/",
      }),
      sendMessage: async (
        tab: number,
        message: { state?: { currentTime: number } },
        options: { frameId: number },
      ) => sent.push({ tab, message, frame: options.frameId }),
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
    runtime: {
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
  };
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const source = readFileSync(
    new URL("../browser-extension/background.js", import.meta.url),
    "utf8",
  ).replace(/^import[\s\S]*?from "\.\/video-protocol\.js";\s*/, "");
  vm.runInNewContext(source, {
    chrome,
    Date: Clock,
    console,
    URL,
    isTerminalUrl,
    parseVideoState: (v: unknown) => parseVideoState(v, now),
    isNewerState,
    STALE_MS,
  });
  return {
    storage,
    sent,
    advance: (ms: number) => {
      now += ms;
    },
    send: async (message: unknown, sender: unknown) => {
      listener(message, sender);
      await new Promise((resolve) => setImmediate(resolve));
    },
    state: (time: number, sourceId = "player", sequence = 1) => ({
      version: 1,
      sourceId,
      sequence,
      currentTime: time,
      duration: 5000,
      playbackRate: 1,
      paused: false,
      buffering: false,
      ended: false,
      title: "Race",
      capturedAt: now,
    }),
  };
}
test("video protocol preserves a valid media wall clock and rejects garbage", () => {
  const now = Date.now();
  const base = {
    version: 1,
    sourceId: "player",
    sequence: 1,
    currentTime: 100,
    duration: 5000,
    playbackRate: 1,
    paused: false,
    buffering: false,
    ended: false,
    title: "Race",
    capturedAt: now,
  };
  assert.equal(
    parseVideoState(
      { ...base, wallClockMs: Date.parse("2026-09-20T13:05:00Z") },
      now,
    )?.wallClockMs,
    Date.parse("2026-09-20T13:05:00Z"),
  );
  assert.equal(
    parseVideoState({ ...base, wallClockMs: 1234 }, now)?.wallClockMs,
    null,
  );
  assert.equal(
    parseVideoState({ ...base, contentId: "1000001234" }, now)?.contentId,
    "1000001234",
  );
  assert.equal(
    parseVideoState({ ...base, contentId: "not-an-id" }, now)?.contentId,
    null,
  );
  assert.equal(
    parseVideoState(
      {
        ...base,
        currentTime: 551.25,
        rawCurrentTime: 178.25,
        clockSource: "bitmovin-ui",
      },
      now,
    )?.clockSource,
    "bitmovin-ui",
  );
  assert.equal(
    parseVideoState(
      {
        ...base,
        currentTime: 551.25,
        rawCurrentTime: 178.25,
        clockSource: "bitmovin-ui",
      },
      now,
    )?.rawCurrentTime,
    178.25,
  );
  const f1tvUi = parseVideoState(
    {
      ...base,
      currentTime: 616.2,
      rawCurrentTime: 380.9,
      clockSource: "f1tv-ui",
      uiClockText: "00:10:16",
      uiDuration: 7902,
    },
    now,
  );
  assert.equal(f1tvUi?.clockSource, "f1tv-ui");
  assert.equal(f1tvUi?.uiClockText, "00:10:16");
  assert.equal(f1tvUi?.uiDuration, 7902);
});

test("elected frame excludes competing video clocks and delivers only to paired main frame", async () => {
  const h = harness();
  await h.send(
    { type: "F1_VIDEO_STATE", score: 10, state: h.state(100) },
    { tab: { id: 42 }, frameId: 1 },
  );
  h.advance(400);
  await h.send(
    { type: "F1_VIDEO_STATE", score: 10, state: h.state(101, "player", 2) },
    { tab: { id: 42 }, frameId: 1 },
  );
  await h.send(
    { type: "F1_VIDEO_STATE", score: 100, state: h.state(5, "ad") },
    { tab: { id: 42 }, frameId: 2 },
  );
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].message.state?.currentTime, 101);
  assert.equal(h.sent[0].frame, 0);
});
test("a substantially stronger cross-frame player replaces the initially elected video", async () => {
  const h = harness();
  await h.send(
    { type: "F1_VIDEO_STATE", score: 1_000_000_000, state: h.state(100) },
    { tab: { id: 42 }, frameId: 1 },
  );
  h.advance(400);
  await h.send(
    {
      type: "F1_VIDEO_STATE",
      score: 1_000_000_000,
      state: h.state(101, "player", 2),
    },
    { tab: { id: 42 }, frameId: 1 },
  );
  assert.equal(h.sent.at(-1)?.message.state?.currentTime, 101);

  await h.send(
    { type: "F1_VIDEO_STATE", score: 5_000_000_000, state: h.state(700, "main") },
    { tab: { id: 42 }, frameId: 2 },
  );
  h.advance(700);
  await h.send(
    {
      type: "F1_VIDEO_STATE",
      score: 5_000_000_000,
      state: h.state(701, "main", 2),
    },
    { tab: { id: 42 }, frameId: 2 },
  );

  assert.equal(h.sent.at(-1)?.message.state?.currentTime, 701);
  assert.equal(h.sent.at(-1)?.message.state?.contentId, "1000001234");
});

test("trusted top-level terminals auto-link while unrelated origins and subframes cannot retrieve state", async () => {
  const h = harness();
  h.storage.latestVideoState = h.state(10);
  await h.send(
    { type: "F1_READY" },
    { tab: { id: 77 }, frameId: 0, url: "http://localhost:4321/" },
  );
  await h.send(
    { type: "F1_READY" },
    { tab: { id: 88 }, frameId: 0, url: "http://localhost:3000/" },
  );
  await h.send(
    { type: "F1_READY" },
    { tab: { id: 99 }, frameId: 1, url: "http://localhost:3000/" },
  );
  assert.equal(
    Array.from(h.storage.terminalTabs as number[]).join(","),
    "99,88",
  );
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].tab, 88);
  assert.equal(h.sent[0].frame, 0);
  assert.equal(h.sent[0].message.state?.currentTime, 10);
});
test("stale stored state is never revived by terminal readiness", async () => {
  const h = harness();
  h.storage.latestVideoState = h.state(10);
  h.advance(5000);
  await h.send(
    { type: "F1_READY" },
    { tab: { id: 99 }, frameId: 0, url: "http://localhost:3000/" },
  );
  assert.equal(h.sent[0].message.state, null);
});
