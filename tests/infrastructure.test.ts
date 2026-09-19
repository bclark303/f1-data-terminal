import test from "node:test";
import assert from "node:assert/strict";
import { BoundedCache } from "../lib/cache";
import { RequestScheduler } from "../lib/request-scheduler";
import {
  parseVideoState,
  isNewerState,
  isTerminalUrl,
} from "../shared/video-protocol.js";
import { positiveInteger } from "../lib/sessions";
import { readJsonBounded } from "../lib/openf1";
const state = (patch = {}) => ({
  version: 1,
  sourceId: "source",
  sequence: 1,
  currentTime: 10,
  duration: 500,
  playbackRate: 1,
  paused: false,
  buffering: false,
  ended: false,
  title: "Race",
  capturedAt: 10000,
  ...patch,
});
test("cache expires and evicts least recently used entries by count and size", () => {
  let now = 0;
  const cache = new BoundedCache<number>(2, 10, 100, () => now);
  cache.set("a", 1, 4);
  cache.set("b", 2, 4);
  cache.get("a");
  cache.set("c", 3, 4);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  now = 101;
  assert.equal(cache.get("a"), undefined);
  cache.set("huge", 3, 11);
  assert.equal(cache.get("huge"), undefined);
});
test("scheduler enforces second and minute windows", async () => {
  let now = 0;
  const starts: number[] = [];
  const scheduler = new RequestScheduler(
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  for (let i = 0; i < 35; i++)
    await scheduler.run(async () => {
      starts.push(now);
    });
  for (let i = 1; i < starts.length; i++)
    assert.ok(starts[i] - starts[i - 1] >= 400);
  assert.ok(starts[30] >= 60000);
});
test("scheduler recovers after timeout failure and honors provider cooldown", async () => {
  let now = 0;
  const scheduler = new RequestScheduler(
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  await assert.rejects(
    scheduler.run(async () => {
      throw new Error("timeout");
    }),
  );
  scheduler.defer(5000);
  await scheduler.run(async () => {
    assert.ok(now >= 5000);
  });
});
test("sync schema rejects stale, future, malformed and out-of-order messages", () => {
  const valid = parseVideoState(state(), 10000)!;
  assert.ok(valid);
  assert.equal(parseVideoState(state({ capturedAt: 0 }), 10000), null);
  assert.equal(parseVideoState(state({ capturedAt: 12000 }), 10000), null);
  assert.equal(parseVideoState(state({ currentTime: "10" }), 10000), null);
  assert.equal(parseVideoState(state({ currentTime: Infinity }), 10000), null);
  assert.equal(parseVideoState(state({ buffering: undefined }), 10000), null);
  assert.equal(isNewerState(valid, valid), false);
  assert.equal(isNewerState(valid, { ...valid, sequence: 2 }), true);
  assert.equal(
    "url" in
      parseVideoState(state({ url: "https://example.test/?secret=1" }), 10000)!,
    false,
  );
});
test("only exact terminal origins are accepted", () => {
  assert.equal(isTerminalUrl("http://localhost:3000/"), true);
  for (const url of [
    "http://localhost:4321",
    "https://localhost:3000",
    "http://localhost.evil:3000",
    "http://127.0.0.1:5000",
  ])
    assert.equal(isTerminalUrl(url), false);
});
test("proxy identifiers exclude fractions, negative values, whitespace and oversized values", () => {
  assert.equal(positiveInteger("123", "session"), 123);
  for (const input of ["-1", "1.5", " ", "1e2", "999999999999", null])
    assert.throws(() => positiveInteger(input, "session"));
});
test("download limit aborts oversized provider data", async () => {
  await assert.rejects(readJsonBounded(new Response("123456789"), 4), /limit/);
  assert.deepEqual(await readJsonBounded(new Response("[1,2]")), [1, 2]);
});

test("optional provider failure preserves other datasets and supports a successful retry", async () => {
  const { optionalData } = await import("../lib/optional-data");
  const warnings: string[] = [];
  const results = await Promise.all([
    optionalData("Weather", Promise.reject(new Error("offline")), warnings),
    optionalData("Positions", Promise.resolve([1, 2]), warnings),
  ]);
  assert.deepEqual(results, [[], [1, 2]]);
  assert.deepEqual(warnings, ["Weather"]);
  assert.deepEqual(
    await optionalData("Weather", Promise.resolve([3]), []),
    [3],
  );
});
test("new driver requests take priority over old queued requests", async () => {
  let now = 0;
  const scheduler = new RequestScheduler(
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  let release!: () => void;
  const blocker = scheduler.run(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const order: string[] = [];
  const optional = scheduler.run(async () => {
    order.push("optional");
  });
  const old = scheduler.run(async () => {
    order.push("old");
  }, 1);
  const selected = scheduler.run(async () => {
    order.push("selected");
  }, 1);
  release();
  await Promise.all([blocker, optional, old, selected]);
  assert.deepEqual(order, ["selected", "old", "optional"]);
});
