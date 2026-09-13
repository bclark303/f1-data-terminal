import { NextRequest, NextResponse } from "next/server";
import { openF1 } from "@/lib/openf1";

export const dynamic = "force-dynamic";

function numberParam(value: string | null, name: string) {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`Invalid ${name}`);
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get("mode");
    const sessionKey = numberParam(request.nextUrl.searchParams.get("sessionKey"), "sessionKey");
    const driverNumber = numberParam(request.nextUrl.searchParams.get("driver"), "driver");

    if (mode === "telemetry") {
      const data = await openF1.carDataDriver(sessionKey, driverNumber);
      return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400" } });
    }

    if (mode === "track") {
      const data = await openF1.locationDriver(sessionKey, driverNumber);
      return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400" } });
    }

    return NextResponse.json({ error: "Unknown replay-data mode" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replay data request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
