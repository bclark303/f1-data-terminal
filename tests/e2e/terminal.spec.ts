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
  await page.getByRole("button", { name: "SYNC", exact: true }).click();
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
test("direct sync follows pause, rejects malformed samples, and manual seek disengages", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "SYNC", exact: true }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "SYNC", exact: true }).click();
  await page.getByRole("button", { name: "MATCH NOW" }).click();
  await expect(
    page.getByRole("button", { name: "ON", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close synchronization" }).click();
  await page.getByRole("slider").press("Home");
  await page.getByRole("button", { name: "SYNC", exact: true }).click();
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
      await request.get("/api/replay-data?mode=track&sessionKey=9998&driver=1")
    ).status(),
  ).toBe(404);
});
