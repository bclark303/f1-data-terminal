import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
const root =
  process.env.F1_CACHE_DIR ?? join(process.cwd(), ".cache", "openf1-v1");
const ttl = 86400000;
const filename = (key: string) =>
  join(root, createHash("sha256").update(key).digest("hex") + ".json");
let maintenance = Promise.resolve();
export async function readDisk(key: string): Promise<unknown | undefined> {
  try {
    const path = filename(key);
    const info = await stat(path);
    if (Date.now() - info.mtimeMs > ttl || info.size > 20 * 1024 * 1024) return;
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return;
  }
}
export async function writeDisk(key: string, value: unknown) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 20 * 1024 * 1024) return;
  // Serial, atomic writes and bounded cleanup for the supported single-process local server.
  maintenance = maintenance
    .then(async () => {
      await mkdir(root, { recursive: true });
      const target = filename(key),
        temporary = target + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, text, { mode: 0o600 });
        await rename(temporary, target);
      } finally {
        await unlink(temporary).catch(() => {});
      }
      const entries = await Promise.all(
        (await readdir(root)).map(async (name) => ({
          name,
          ...(await stat(join(root, name))),
        })),
      );
      entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
      let bytes = 0;
      for (const entry of entries) {
        bytes += entry.size;
        if (bytes > 256 * 1024 * 1024 || Date.now() - entry.mtimeMs > ttl)
          await unlink(join(root, entry.name)).catch(() => {});
      }
    })
    .catch((error) =>
      console.warn(
        "OpenF1 disk cache unavailable:",
        error.code ?? "write failed",
      ),
    );
  await maintenance;
}
