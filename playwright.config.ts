import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1500, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node tests/seed-cache.mjs "${join(tmpdir(), "f1-terminal-e2e")}" && npm run start`,
    env: { F1_CACHE_DIR: join(tmpdir(), "f1-terminal-e2e") },
    url: "http://127.0.0.1:3000",
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
