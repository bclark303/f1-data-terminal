import { NextRequest, NextResponse } from "next/server";
import { openF1 } from "@/lib/openf1";

export const dynamic = "force-dynamic";

function numberParam(value: string | null, name: string) {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`Invalid ${name}`);
  return parsed;
}

function dateParam(value: string | null, name: string) {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${name}`);
  return new Date(value).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get("mode");
    const sessionKey = numberParam(request.nextUrl.searchParams.get("sessionKey"), "sessionKey");
    const from = dateParam(request.nextUrl.searchParams.get("from"), "from");
    const to = dateParam(request.nextUrl.searchParams.get("to"), "to");

    if (mode === "telemetry") {
      const data = await openF1.carDataWindow(sessionKey, from, to);
      return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600" } });
    }

    if (mode === "locations") {
      const data = await openF1.locationWindow(sessionKey, from, to);
      return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600" } });
    }

    if (mode === "track") {
      const driverNumber = numberParam(request.nextUrl.searchParams.get("driver"), "driver");
      const data = await openF1.locationWindow(sessionKey, from, to, driverNumber);
      return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400" } });
    }

    return NextResponse.json({ error: "Unknown replay-data mode" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replay data request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
