import { NextRequest, NextResponse } from "next/server";
import { getAutoSyncMetadata } from "@/lib/auto-sync";
import { positiveInteger, supportedSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let sessionKey: number;
  try {
    sessionKey = positiveInteger(
      request.nextUrl.searchParams.get("sessionKey"),
      "sessionKey",
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }

  const session = (await supportedSessions()).find(
    (item) => item.session_key === sessionKey,
  );
  if (!session)
    return NextResponse.json(
      { error: "Unsupported session" },
      { status: 404 },
    );

  const metadata = await getAutoSyncMetadata(
    session.meeting_key,
    session.session_key,
  );
  if (!metadata)
    return NextResponse.json(
      { error: "Automatic sync unavailable for this session" },
      {
        status: 404,
        headers: { "Cache-Control": "private, max-age=300" },
      },
    );

  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
