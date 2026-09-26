import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = "https://livetiming.formula1.com";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_PATH_LENGTH = 500;
const CACHE_LIMIT = 256;

type CacheEntry = {
  text: string;
  model: string;
};

const transcriptCache = new Map<string, CacheEntry>();

function safePath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim().replace(/^\/+/, "");
  if (!path || path.length > MAX_PATH_LENGTH) return null;
  if (
    path.includes("..") ||
    path.includes(":") ||
    path.includes("\\") ||
    !/^[A-Za-z0-9_./-]+$/.test(path)
  )
    return null;
  return path;
}

function staticRadioUrl(sessionPath: string, clipPath: string) {
  const session = safePath(sessionPath);
  const clip = safePath(clipPath);
  if (!session || !clip) return null;
  const base = session.endsWith("/") ? session : session + "/";
  return `${BASE}/static/${base}${clip}`;
}

function cacheSet(key: string, value: CacheEntry) {
  if (transcriptCache.has(key)) transcriptCache.delete(key);
  transcriptCache.set(key, value);
  while (transcriptCache.size > CACHE_LIMIT) {
    const first = transcriptCache.keys().next().value;
    if (!first) break;
    transcriptCache.delete(first);
  }
}

export async function GET() {
  return Response.json({
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe",
  });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Radio transcription is not configured. Set OPENAI_API_KEY on the local terminal server.",
      },
      { status: 503 },
    );
  }

  let body: { sessionPath?: unknown; clipPath?: unknown };
  try {
    body = (await request.json()) as { sessionPath?: unknown; clipPath?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionPath = safePath(body.sessionPath);
  const clipPath = safePath(body.clipPath);
  if (!sessionPath || !clipPath) {
    return Response.json({ error: "Invalid radio path." }, { status: 400 });
  }

  const audioUrl = staticRadioUrl(sessionPath, clipPath);
  if (!audioUrl) {
    return Response.json({ error: "Invalid radio URL." }, { status: 400 });
  }

  const cached = transcriptCache.get(audioUrl);
  if (cached) return Response.json({ ...cached, cached: true });

  try {
    const audioResponse = await fetch(audioUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "audio/*,application/octet-stream" },
    });
    if (!audioResponse.ok) {
      return Response.json(
        { error: `Radio audio fetch failed (${audioResponse.status}).` },
        { status: 502 },
      );
    }

    const length = Number(audioResponse.headers.get("content-length") || 0);
    if (length > MAX_AUDIO_BYTES) {
      return Response.json({ error: "Radio clip exceeds size limit." }, { status: 413 });
    }
    const bytes = await audioResponse.arrayBuffer();
    if (bytes.byteLength > MAX_AUDIO_BYTES) {
      return Response.json({ error: "Radio clip exceeds size limit." }, { status: 413 });
    }

    const type = audioResponse.headers.get("content-type") || "audio/mpeg";
    const fileName = clipPath.split("/").at(-1) || "team-radio.mp3";
    const form = new FormData();
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe");
    form.append("file", new Blob([bytes], { type }), fileName);

    const transcription = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });

    if (!transcription.ok) {
      const detail = await transcription.text().catch(() => "");
      return Response.json(
        {
          error:
            "Transcription request failed" +
            (detail ? ": " + detail.slice(0, 300) : "."),
        },
        { status: 502 },
      );
    }

    const payload = (await transcription.json()) as { text?: unknown };
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return Response.json({ error: "Transcription returned no text." }, { status: 502 });
    }

    const entry = {
      text,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe",
    };
    cacheSet(audioUrl, entry);
    return Response.json({ ...entry, cached: false });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Radio transcription failed.",
      },
      { status: 502 },
    );
  }
}
