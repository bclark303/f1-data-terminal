import { NextResponse } from "next/server";
// The unauthenticated HTTP bridge has been retired. No playback state is stored server-side.
function retired() {
  return NextResponse.json(
    {
      error:
        "HTTP video sync was retired. Reload the current browser companion.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
export const GET = retired;
export const POST = retired;
export const OPTIONS = retired;
