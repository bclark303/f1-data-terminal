import { openF1 } from "./openf1";
// Explicit supported catalogue bounds the upstream proxy. Extend here when adding a race.
export async function supportedSessions() {
  return (await openF1.sessions(2025, "Canada")).filter(
    (session) => session.session_name === "Race",
  );
}
export function positiveInteger(value: string | null, name: string) {
  if (!value || !/^[1-9]\d{0,8}$/.test(value))
    throw new Error(`Invalid ${name}`);
  return Number(value);
}
