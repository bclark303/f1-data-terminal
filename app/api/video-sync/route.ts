import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type StoredVideoState = {
  currentTime: number;
  duration: number | null;
  paused: boolean;
  playbackRate: number;
  title: string;
  url: string;
  capturedAt: number;
  receivedAt: number;
};

type GlobalVideoStore = typeof globalThis & {
  __f1VideoSyncState?: StoredVideoState;
};

const store = globalThis as GlobalVideoStore;
const STALE_MS = 1750;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<StoredVideoState>;
    const currentTime = finite(body.currentTime, NaN);
    const playbackRate = finite(body.playbackRate, 1);
    const capturedAt = finite(body.capturedAt, Date.now());

    if (!Number.isFinite(currentTime) || currentTime < 0) {
      return NextResponse.json({ error: "Invalid video currentTime" }, { status: 400, headers: corsHeaders });
    }

    store.__f1VideoSyncState = {
      currentTime,
      duration: typeof body.duration === "number" && Number.isFinite(body.duration) ? body.duration : null,
      paused: Boolean(body.paused),
      playbackRate: Math.max(0.05, Math.min(16, playbackRate)),
      title: typeof body.title === "string" ? body.title.slice(0, 240) : "",
      url: typeof body.url === "string" ? body.url.slice(0, 1000) : "",
      capturedAt,
      receivedAt: Date.now(),
    };

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: "Invalid video sync payload" }, { status: 400, headers: corsHeaders });
  }
}

export async function GET() {
  const state = store.__f1VideoSyncState;
  const connected = Boolean(state && Date.now() - state.receivedAt <= STALE_MS);

  if (!state) {
    return NextResponse.json({
      connected: false,
      currentTime: 0,
      duration: null,
      paused: true,
      playbackRate: 1,
      title: "",
      url: "",
      capturedAt: 0,
      receivedAt: 0,
    }, { headers: corsHeaders });
  }

  return NextResponse.json({ ...state, connected }, { headers: corsHeaders });
}
