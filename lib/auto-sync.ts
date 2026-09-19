import { BoundedCache } from "./cache";

export type AutoSyncMetadata = {
  sessionStartSec: number;
  contentId: string | null;
};

const cache = new BoundedCache<AutoSyncMetadata | null>(
  128,
  256 * 1024,
  24 * 60 * 60 * 1000,
);

export function parseAutoSyncMetadata(input: unknown): AutoSyncMetadata | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const rawStart = record.session_start;
  const sessionStartSec =
    typeof rawStart === "number"
      ? rawStart
      : typeof rawStart === "string"
        ? Number.parseFloat(rawStart)
        : Number.NaN;
  if (
    !Number.isFinite(sessionStartSec) ||
    sessionStartSec < 0 ||
    sessionStartSec > 24 * 60 * 60
  )
    return null;

  const rawContentId = record.f1tv_content_id;
  const contentId =
    typeof rawContentId === "string" || typeof rawContentId === "number"
      ? String(rawContentId).slice(0, 240)
      : null;

  return { sessionStartSec, contentId };
}

export async function getAutoSyncMetadata(
  meetingKey: number,
  sessionKey: number,
): Promise<AutoSyncMetadata | null> {
  const key = `${meetingKey}:${sessionKey}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(
      `https://api.multiviewer.app/api/v1/meetings/${meetingKey}/sessions/${sessionKey}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "F1 Data Terminal",
        },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 404) cache.set(key, null, 1);
      return null;
    }

    const text = await response.text();
    if (text.length > 1024 * 1024) return null;
    const parsed = parseAutoSyncMetadata(JSON.parse(text));
    if (parsed) cache.set(key, parsed, text.length * 2);
    return parsed;
  } catch {
    return null;
  }
}
