import { NextRequest, NextResponse } from "next/server";
import { openF1 } from "@/lib/openf1";
import { positiveInteger, supportedSessions } from "@/lib/sessions";
import { UpstreamError } from "@/lib/request-scheduler";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let sessionKey: number, driver: number;
  const mode = request.nextUrl.searchParams.get("mode");
  try {
    sessionKey = positiveInteger(
      request.nextUrl.searchParams.get("sessionKey"),
      "sessionKey",
    );
    driver = positiveInteger(
      request.nextUrl.searchParams.get("driver"),
      "driver",
    );
    if (driver > 99 || !["telemetry", "track"].includes(mode ?? ""))
      throw new Error("Invalid replay-data request");
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
  try {
    if (
      !(await supportedSessions()).some(
        (session) => session.session_key === sessionKey,
      )
    )
      return NextResponse.json(
        { error: "Unsupported session" },
        { status: 404 },
      );
    if (
      !(await openF1.drivers(sessionKey)).some(
        (item) => item.driver_number === driver,
      )
    )
      return NextResponse.json(
        { error: "Driver not in session" },
        { status: 404 },
      );
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    const data = await (mode === "telemetry"
      ? openF1.carDataDriver(sessionKey, driver)
      : openF1.locationDriver(sessionKey, driver));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof UpstreamError
            ? error.message
            : "Replay data unavailable; retry shortly",
      },
      {
        status: error instanceof UpstreamError ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
