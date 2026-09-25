import { inflateRawSync } from "node:zlib";
import { NextRequest } from "next/server";
import {
  LIVE_TOPICS,
  recordsFromSignalRFrames,
  splitSignalRFrames,
} from "@/lib/live-timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = "https://livetiming.formula1.com";
const RECORD_SEPARATOR = "\x1e";
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;

function signalR(message: unknown) {
  return JSON.stringify(message) + RECORD_SEPARATOR;
}

function decodeFeed(feed: string, data: unknown) {
  if (!feed.endsWith(".z")) return data;
  if (typeof data !== "string" || data.length > MAX_COMPRESSED_BYTES * 2)
    return null;
  try {
    const compressed = Buffer.from(data, "base64");
    if (compressed.byteLength > MAX_COMPRESSED_BYTES) return null;
    const decoded = inflateRawSync(compressed, {
      maxOutputLength: MAX_DECOMPRESSED_BYTES,
    }).toString("utf8");
    return JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
}

async function negotiate() {
  const response = await fetch(
    `${BASE}/signalrcore/negotiate?negotiateVersion=1`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "BestHTTP",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new Error(`F1 live timing negotiate failed (${response.status})`);
  const payload = (await response.json()) as {
    connectionToken?: string;
    connectionId?: string;
    availableTransports?: Array<{ transport?: string }>;
  };
  const token = payload.connectionToken ?? payload.connectionId;
  if (!token) throw new Error("F1 live timing returned no connection token");
  if (
    payload.availableTransports &&
    !payload.availableTransports.some(
      (item) => item.transport === "WebSockets",
    )
  )
    throw new Error("F1 live timing WebSocket transport unavailable");
  return token;
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let socket: WebSocket | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, value: unknown) => {
        if (closed) return;
        const json = JSON.stringify(value);
        if (json.length > MAX_DECOMPRESSED_BYTES) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${json}\n\n`),
        );
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        if (keepalive) clearInterval(keepalive);
        if (socket && socket.readyState < 2) socket.close();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", finish, { once: true });
      send("status", { status: "connecting", at: Date.now() });

      try {
        const token = await negotiate();
        if (closed) return;
        socket = new WebSocket(
          `wss://livetiming.formula1.com/signalrcore?id=${encodeURIComponent(token)}`,
        );
        let handshaken = false;

        socket.addEventListener("open", () => {
          socket?.send(signalR({ protocol: "json", version: 1 }));
        });

        socket.addEventListener("message", (event) => {
          const raw =
            typeof event.data === "string"
              ? event.data
              : event.data instanceof ArrayBuffer
                ? Buffer.from(event.data).toString("utf8")
                : "";
          if (!raw) return;
          const frames = splitSignalRFrames(raw);

          if (!handshaken) {
            if (!frames.length) return;
            const handshake = frames.shift();
            if (typeof handshake?.error === "string") {
              send("status", {
                status: "error",
                message: handshake.error,
                at: Date.now(),
              });
              finish();
              return;
            }
            handshaken = true;
            socket?.send(
              signalR({
                type: 1,
                invocationId: "1",
                target: "Subscribe",
                arguments: [[...LIVE_TOPICS]],
              }),
            );
            send("status", { status: "connected", at: Date.now() });
            keepalive = setInterval(() => {
              if (socket?.readyState === 1)
                socket.send(signalR({ type: 6 }));
            }, 15000);
          }

          for (const record of recordsFromSignalRFrames(frames)) {
            const data = decodeFeed(record.feed, record.data);
            if (data !== null)
              send("record", {
                feed: record.feed,
                data,
                at: Date.now(),
              });
          }
        });

        socket.addEventListener("error", () => {
          send("status", {
            status: "error",
            message: "F1 live timing connection error",
            at: Date.now(),
          });
        });

        socket.addEventListener("close", () => {
          if (!closed)
            send("status", { status: "disconnected", at: Date.now() });
          finish();
        });
      } catch (error) {
        send("status", {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "F1 live timing unavailable",
          at: Date.now(),
        });
        finish();
      }
    },
    cancel() {
      closed = true;
      if (keepalive) clearInterval(keepalive);
      if (socket && socket.readyState < 2) socket.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
