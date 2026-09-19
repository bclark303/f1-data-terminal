import type { Session } from "./types";
import { openF1 } from "./openf1";

export const OPENF1_HISTORY_START_YEAR = 2023;
export const LIVE_SESSION_GRACE_MS = 30 * 60 * 1000;

export function availableRaceSessions(
  sessions: Session[],
  now = Date.now(),
) {
  return sessions
    .filter(
      (session) =>
        session.year >= OPENF1_HISTORY_START_YEAR &&
        session.session_name === "Race" &&
        Date.parse(session.date_end) + LIVE_SESSION_GRACE_MS <= now,
    )
    .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start));
}

// OpenF1 historical data is public from 2023 onward. Keeping this catalogue
// bounded to completed race sessions also bounds the replay-data proxy.
export async function supportedSessions(now = Date.now()) {
  return availableRaceSessions(await openF1.raceSessions(), now);
}

export function selectSession(
  sessions: Session[],
  requestedSessionKey?: string,
) {
  const requested =
    requestedSessionKey && /^[1-9]\d{0,8}$/.test(requestedSessionKey)
      ? Number(requestedSessionKey)
      : null;
  if (requested !== null) {
    const match = sessions.find((session) => session.session_key === requested);
    if (match) return match;
  }

  // Preserve the project's original Canada 2025 baseline when no race is
  // explicitly selected. Fall back to the newest available race if needed.
  return (
    sessions.find(
      (session) => session.year === 2025 && session.country_name === "Canada",
    ) ??
    sessions[0] ??
    null
  );
}

export function positiveInteger(value: string | null, name: string) {
  if (!value || !/^[1-9]\d{0,8}$/.test(value))
    throw new Error(`Invalid ${name}`);
  return Number(value);
}
