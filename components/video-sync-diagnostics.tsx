"use client";

import { useEffect, useMemo, useState } from "react";
import { projectVideo } from "@/lib/replay-state";
import { STALE_MS } from "@/shared/video-protocol.js";
import { useReplayClock } from "./replay-clock";
import { useReplaySync } from "./replay-sync-context";

type LookupState = {
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  sessionStartSec: number | null;
  contentId: string | null;
  error: string | null;
};

type Verdict = {
  level: "ok" | "warn" | "error" | "info";
  title: string;
  detail: string;
};

function seconds(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const total = Math.abs(value);
  const whole = Math.floor(total);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const fraction = Math.round((total - whole) * 10);
  const base =
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${minutes}:${String(secs).padStart(2, "0")}`;
  return `${sign}${base}${fraction ? `.${fraction}` : ""}`;
}

function utc(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Date(value).toISOString();
}

function yesNo(value: boolean | null | undefined) {
  return value == null ? "—" : value ? "YES" : "NO";
}

export function VideoSyncDiagnostics() {
  const clock = useReplayClock();
  const sync = useReplaySync();
  const video = clock.video;
  const anchor = clock.videoAnchor;
  const [retry, setRetry] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [lookup, setLookup] = useState<LookupState>({
    status: "idle",
    sessionStartSec: null,
    contentId: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    const url = `/api/auto-sync?sessionKey=${encodeURIComponent(String(sync.sessionKey))}`;

    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setLookup({
            status: "unavailable",
            sessionStartSec: null,
            contentId: null,
            error: "No automatic sync metadata for this session.",
          });
          return;
        }
        if (!response.ok) {
          setLookup({
            status: "error",
            sessionStartSec: null,
            contentId: null,
            error: `Lookup returned HTTP ${response.status}.`,
          });
          return;
        }
        const payload = (await response.json()) as {
          sessionStartSec?: unknown;
          contentId?: unknown;
        };
        const start = Number(payload.sessionStartSec);
        if (!Number.isFinite(start) || start < 0) {
          setLookup({
            status: "error",
            sessionStartSec: null,
            contentId: null,
            error: "Lookup returned an invalid race-start offset.",
          });
          return;
        }
        setLookup({
          status: "ready",
          sessionStartSec: start,
          contentId:
            typeof payload.contentId === "string" ? payload.contentId : null,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLookup({
          status: "error",
          sessionStartSec: null,
          contentId: null,
          error:
            error instanceof Error ? error.message : "Sync metadata lookup failed.",
        });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [retry, sync.sessionKey]);

  const diagnostic = useMemo(() => {
    const now = Date.now();
    const projectedVideoTime = video ? projectVideo(video, now) : null;
    const sampleAgeMs = video ? Math.max(0, now - video.capturedAt) : null;
    const projectedWallClockMs =
      video?.wallClockMs != null && projectedVideoTime != null
        ? video.wallClockMs + (projectedVideoTime - video.currentTime) * 1000
        : null;
    const wallClockInSessionWindow =
      projectedWallClockMs != null &&
      projectedWallClockMs >= clock.sessionStart - 6 * 60 * 60 * 1000 &&
      projectedWallClockMs <= clock.sessionEnd + 6 * 60 * 60 * 1000;
    const contentMatch =
      video?.contentId && lookup.contentId
        ? video.contentId === lookup.contentId
        : null;
    const startDeltaSec =
      projectedVideoTime != null && lookup.sessionStartSec != null
        ? projectedVideoTime - lookup.sessionStartSec
        : null;
    const sourceMatches = Boolean(
      anchor && video && anchor.sourceId === video.sourceId,
    );
    const sessionMatches = Boolean(
      anchor && anchor.sessionKey === sync.sessionKey,
    );
    const anchorRaceMs =
      anchor && projectedVideoTime != null
        ? anchor.raceTimeMs +
          (projectedVideoTime - anchor.videoTime) * 1000 +
          clock.syncOffsetMs
        : null;
    const terminalDriftMs =
      anchorRaceMs != null ? clock.raceTime - anchorRaceMs : null;
    const durationRatio =
      video?.duration != null && clock.duration > 0
        ? (video.duration * 1000) / clock.duration
        : null;
    const likelyShortTimeline =
      durationRatio != null && durationRatio < 0.6;

    let verdict: Verdict;
    if (!video) {
      verdict = {
        level: "error",
        title: "NO VIDEO STATE",
        detail:
          "The terminal is not receiving playback samples from the extension. Check extension version, source selection, and whether the F1 TV tab says OK.",
      };
    } else if (sampleAgeMs != null && sampleAgeMs > STALE_MS) {
      verdict = {
        level: "error",
        title: "VIDEO SAMPLE IS STALE",
        detail: `Last sample is ${sampleAgeMs} ms old; samples older than ${STALE_MS} ms are treated as disconnected.`,
      };
    } else if (contentMatch === false && !wallClockInSessionWindow) {
      verdict = {
        level: "error",
        title: "CONTENT ID MISMATCH",
        detail:
          "The selected F1 TV asset is not the full-race content expected by the sync metadata.",
      };
    } else if (likelyShortTimeline && !wallClockInSessionWindow) {
      verdict = {
        level: "error",
        title: "VIDEO TIMELINE LOOKS TOO SHORT",
        detail:
          "The player duration is much shorter than the replay data window, suggesting an edited asset or the wrong player element.",
      };
    } else if (video.wallClockMs != null && !wallClockInSessionWindow) {
      verdict = {
        level: "error",
        title: "MEDIA UTC DOES NOT MATCH SESSION",
        detail:
          "F1 TV exposed an absolute media time, but it is outside the selected race window.",
      };
    } else if (anchor) {
      if (!sourceMatches || !sessionMatches) {
        verdict = {
          level: "error",
          title: "ANCHOR DOES NOT MATCH CURRENT SOURCE",
          detail:
            "The saved anchor belongs to a different video source or race session.",
        };
      } else if (!clock.following) {
        verdict = {
          level: "warn",
          title: "ANCHOR EXISTS, VIDEO LOCK IS OFF",
          detail:
            "The clocks are calibrated, but the terminal is currently running independently.",
        };
      } else if (terminalDriftMs != null && Math.abs(terminalDriftMs) > 1000) {
        verdict = {
          level: "error",
          title: "FOLLOW MATH IS DRIFTING",
          detail: `The terminal differs from the anchor calculation by ${Math.round(terminalDriftMs)} ms.`,
        };
      } else {
        verdict = {
          level: "ok",
          title: "VIDEO LOCK IS ACTIVE",
          detail:
            "The terminal clock is being calculated from the current F1 TV player position and the saved anchor.",
        };
      }
    } else if (wallClockInSessionWindow) {
      verdict = {
        level: "warn",
        title: "UTC FRAME AVAILABLE BUT NO ANCHOR",
        detail:
          "The F1 TV frame UTC is usable and should create an automatic anchor. If this persists, the auto-anchor effect is not firing.",
      };
    } else if (lookup.status === "loading" || lookup.status === "idle") {
      verdict = {
        level: "info",
        title: "WAITING FOR SYNC METADATA",
        detail:
          "The terminal is still looking up the expected F1 TV race-start offset.",
      };
    } else if (lookup.status !== "ready") {
      verdict = {
        level: "error",
        title: "NO USABLE AUTO-SYNC METADATA",
        detail: lookup.error ?? "The race-start lookup is unavailable.",
      };
    } else if (startDeltaSec == null) {
      verdict = {
        level: "error",
        title: "NO USABLE PLAYER CLOCK",
        detail:
          "The extension is connected, but the terminal cannot compare the player position with the race-start target.",
      };
    } else if (Math.abs(startDeltaSec) <= 8) {
      verdict = {
        level: "error",
        title: "INSIDE START WINDOW BUT NOT SYNCED",
        detail:
          "The player is within the automatic race-start window, so an anchor should already exist. This is a terminal-side auto-anchor failure.",
      };
    } else {
      verdict = {
        level: "info",
        title: "ARMED — SCRUB TO RACE START",
        detail: `Move F1 TV to ${seconds(lookup.sessionStartSec)}. Current player position is ${seconds(projectedVideoTime)} (${startDeltaSec >= 0 ? "+" : "−"}${seconds(Math.abs(startDeltaSec))} from target).`,
      };
    }

    return {
      now,
      projectedVideoTime,
      sampleAgeMs,
      projectedWallClockMs,
      wallClockInSessionWindow,
      contentMatch,
      startDeltaSec,
      sourceMatches,
      sessionMatches,
      anchorRaceMs,
      terminalDriftMs,
      durationRatio,
      likelyShortTimeline,
      verdict,
    };
  }, [
    anchor,
    clock.duration,
    clock.following,
    clock.raceTime,
    clock.sessionEnd,
    clock.sessionStart,
    clock.syncOffsetMs,
    lookup,
    sync.sessionKey,
    video,
  ]);

  const snapshot = useMemo(
    () => ({
      generatedAt: new Date(diagnostic.now).toISOString(),
      verdict: diagnostic.verdict,
      session: {
        sessionKey: sync.sessionKey,
        dataStartUtc: utc(clock.sessionStart),
        dataEndUtc: utc(clock.sessionEnd),
        durationMs: clock.duration,
        terminalRaceUtc: utc(clock.raceTime),
        terminalElapsedMs: clock.elapsed,
        replayStatus: clock.status,
        following: clock.following,
        syncOffsetMs: clock.syncOffsetMs,
      },
      metadata: {
        status: lookup.status,
        sessionStartSec: lookup.sessionStartSec,
        sessionStartFormatted: seconds(lookup.sessionStartSec),
        expectedContentId: lookup.contentId,
        error: lookup.error,
      },
      video: video
        ? {
            title: video.title,
            sourceId: video.sourceId,
            sequence: video.sequence,
            sampleAgeMs: diagnostic.sampleAgeMs,
            capturedAt: new Date(video.capturedAt).toISOString(),
            clockSource: video.clockSource,
            currentTime: video.currentTime,
            projectedTime: diagnostic.projectedVideoTime,
            rawCurrentTime: video.rawCurrentTime,
            duration: video.duration,
            playbackRate: video.playbackRate,
            paused: video.paused,
            buffering: video.buffering,
            ended: video.ended,
            contentId: video.contentId,
            wallClockMs: video.wallClockMs,
            projectedWallClockUtc: utc(diagnostic.projectedWallClockMs),
          }
        : null,
      comparison: {
        contentMatch: diagnostic.contentMatch,
        startDeltaSec: diagnostic.startDeltaSec,
        startWindowSec: 8,
        wallClockInSessionWindow: diagnostic.wallClockInSessionWindow,
        durationRatio: diagnostic.durationRatio,
        likelyShortTimeline: diagnostic.likelyShortTimeline,
      },
      anchor: anchor
        ? {
            kind: anchor.kind ?? "unknown",
            lap: anchor.lap,
            sourceId: anchor.sourceId,
            sourceMatches: diagnostic.sourceMatches,
            sessionKey: anchor.sessionKey,
            sessionMatches: diagnostic.sessionMatches,
            videoTime: anchor.videoTime,
            raceTimeUtc: utc(anchor.raceTimeMs),
            calculatedRaceUtc: utc(diagnostic.anchorRaceMs),
            terminalDriftMs: diagnostic.terminalDriftMs,
          }
        : null,
    }),
    [
      anchor,
      clock,
      diagnostic,
      lookup,
      sync.sessionKey,
      video,
    ],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="videoDiag">
      <div className={`videoDiagVerdict ${diagnostic.verdict.level}`}>
        <span>DIAGNOSTIC VERDICT</span>
        <strong>{diagnostic.verdict.title}</strong>
        <p>{diagnostic.verdict.detail}</p>
      </div>

      <div className="videoDiagActions">
        <button onClick={copy}>
          {copyState === "copied"
            ? "COPIED"
            : copyState === "failed"
              ? "COPY FAILED"
              : "COPY DIAGNOSTICS"}
        </button>
        <button onClick={() => setRetry((value) => value + 1)}>
          RETRY METADATA
        </button>
      </div>

      <section className="videoDiagSection">
        <h3>F1 TV SOURCE</h3>
        <dl>
          <dt>Connected</dt>
          <dd>{yesNo(Boolean(video))}</dd>
          <dt>Title</dt>
          <dd>{video?.title || "—"}</dd>
          <dt>Source ID</dt>
          <dd>{video?.sourceId ?? "—"}</dd>
          <dt>Sequence</dt>
          <dd>{video?.sequence ?? "—"}</dd>
          <dt>Sample age</dt>
          <dd>
            {diagnostic.sampleAgeMs == null
              ? "—"
              : `${diagnostic.sampleAgeMs} ms`}
          </dd>
          <dt>Clock source</dt>
          <dd>{video?.clockSource ?? "—"}</dd>
          <dt>Player time</dt>
          <dd>{seconds(diagnostic.projectedVideoTime)}</dd>
          <dt>Raw media time</dt>
          <dd>{seconds(video?.rawCurrentTime ?? null)}</dd>
          <dt>Duration</dt>
          <dd>{seconds(video?.duration ?? null)}</dd>
          <dt>Playback</dt>
          <dd>
            {video
              ? `${video.playbackRate.toFixed(2)}× · ${video.paused ? "PAUSED" : "PLAYING"} · ${video.buffering ? "BUFFERING" : "NOT BUFFERING"}`
              : "—"}
          </dd>
          <dt>Content ID</dt>
          <dd>{video?.contentId ?? "—"}</dd>
          <dt>Media wall clock</dt>
          <dd>{utc(diagnostic.projectedWallClockMs)}</dd>
        </dl>
      </section>

      <section className="videoDiagSection">
        <h3>SYNC TARGET</h3>
        <dl>
          <dt>Lookup status</dt>
          <dd>{lookup.status.toUpperCase()}</dd>
          <dt>Expected content</dt>
          <dd>{lookup.contentId ?? "—"}</dd>
          <dt>Content match</dt>
          <dd>{yesNo(diagnostic.contentMatch)}</dd>
          <dt>Race-start target</dt>
          <dd>{seconds(lookup.sessionStartSec)}</dd>
          <dt>Player − target</dt>
          <dd>{seconds(diagnostic.startDeltaSec)}</dd>
          <dt>Inside ±8s start window</dt>
          <dd>
            {yesNo(
              diagnostic.startDeltaSec == null
                ? null
                : Math.abs(diagnostic.startDeltaSec) <= 8,
            )}
          </dd>
          <dt>Data race start UTC</dt>
          <dd>{utc(clock.sessionStart)}</dd>
          <dt>Wall clock in race window</dt>
          <dd>{yesNo(diagnostic.wallClockInSessionWindow)}</dd>
        </dl>
      </section>

      <section className="videoDiagSection">
        <h3>ANCHOR / TERMINAL</h3>
        <dl>
          <dt>Anchor</dt>
          <dd>{anchor?.kind?.toUpperCase() ?? "NONE"}</dd>
          <dt>Anchor lap</dt>
          <dd>{anchor?.lap ?? "—"}</dd>
          <dt>Anchor video time</dt>
          <dd>{seconds(anchor?.videoTime ?? null)}</dd>
          <dt>Anchor race UTC</dt>
          <dd>{utc(anchor?.raceTimeMs ?? null)}</dd>
          <dt>Source matches anchor</dt>
          <dd>{anchor ? yesNo(diagnostic.sourceMatches) : "—"}</dd>
          <dt>Session matches anchor</dt>
          <dd>{anchor ? yesNo(diagnostic.sessionMatches) : "—"}</dd>
          <dt>Video lock</dt>
          <dd>{clock.following ? "ON" : "OFF"}</dd>
          <dt>Replay status</dt>
          <dd>{clock.status.toUpperCase()}</dd>
          <dt>Calculated race UTC</dt>
          <dd>{utc(diagnostic.anchorRaceMs)}</dd>
          <dt>Terminal race UTC</dt>
          <dd>{utc(clock.raceTime)}</dd>
          <dt>Terminal drift</dt>
          <dd>
            {diagnostic.terminalDriftMs == null
              ? "—"
              : `${Math.round(diagnostic.terminalDriftMs)} ms`}
          </dd>
        </dl>
      </section>

      <details className="videoDiagRaw">
        <summary>RAW SNAPSHOT</summary>
        <pre>{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </div>
  );
}
