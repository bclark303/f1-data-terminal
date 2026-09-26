"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  LIVE_TOPICS,
  applyLiveRecord,
  liveFeedKey,
  selectLiveChampionship,
  selectLiveClock,
  selectLiveCommentary,
  selectLiveDriverEventCounts,
  selectLiveDriverFeedFacts,
  selectLiveDriverInsights,
  selectLiveDrivers,
  selectLiveFeedCoverage,
  selectLiveFeedNames,
  selectLiveLapCount,
  selectLivePositions,
  selectLiveRaceControl,
  selectLiveSessionInfo,
  selectLiveSessionStats,
  selectLiveSessionStatus,
  selectLiveTeamRadio,
  selectLiveTrackStatus,
  selectLiveWeather,
  teamRadioUrl,
  type LiveCommentaryItem,
  type LiveDriverFeedFact,
  type LiveDriverRow,
  type LiveInsight,
  type LivePosition,
  type LiveSector,
  type LiveSessionStat,
  type LiveTimingStore,
} from "@/lib/live-timing";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type StatusPayload = {
  status?: ConnectionState;
  message?: string;
  at?: number;
};

type RadioTranscriptState = {
  status: "loading" | "done" | "error";
  text?: string;
  error?: string;
  model?: string;
};

type Point = { x: number; y: number };

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="liveMetric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function valueOrDash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

function driverLabel(driver: LiveDriverRow | undefined, number: string) {
  return driver?.tla || number;
}

function tyreClass(compound: string) {
  const normalized = compound.toLowerCase();
  return ["soft", "medium", "hard", "intermediate", "wet"].includes(normalized)
    ? normalized
    : "unknown";
}

function Sector({ index, sector }: { index: number; sector: LiveSector }) {
  const className = sector.overallFastest
    ? "overall"
    : sector.personalFastest
      ? "personal"
      : sector.value
        ? "complete"
        : "";
  return (
    <div className={"liveSector " + className}>
      <div className="liveSectorValue">
        <span>S{index + 1}</span>
        <strong>{sector.value || "—"}</strong>
      </div>
      <div className="liveMiniSectors" aria-label={"Sector " + (index + 1) + " minisectors"}>
        {sector.segments.length ? (
          sector.segments.map((status, segmentIndex) => (
            <i
              key={segmentIndex}
              className="crossed"
              data-status={status}
              title={"F1 segment status " + status}
            />
          ))
        ) : (
          <i className="empty" />
        )}
      </div>
    </div>
  );
}

function DriverIdentity({ driver, compact = false }: { driver: LiveDriverRow; compact?: boolean }) {
  return (
    <span className={"liveDriverIdentity " + (compact ? "compact" : "")}>
      <i style={{ background: "#" + driver.teamColour }} />
      <b>{driver.tla || driver.number}</b>
      {!compact && <small>{driver.team}</small>}
    </span>
  );
}

function LiveTrackMap({
  positions,
  histories,
  drivers,
  selectedNumber,
  onSelect,
}: {
  positions: LivePosition[];
  histories: Record<string, Point[]>;
  drivers: LiveDriverRow[];
  selectedNumber: string | null;
  onSelect: (number: string) => void;
}) {
  const projection = useMemo(() => {
    const selectedHistory = selectedNumber ? histories[selectedNumber] ?? [] : [];
    const reference = selectedHistory.length >= 20 ? selectedHistory : Object.values(histories).flat();
    const source = reference.length ? reference : positions;
    if (!source.length) return null;

    const xs = source.map((point) => point.x);
    const ys = source.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = Math.max(1, maxX - minX);
    const rangeY = Math.max(1, maxY - minY);
    const scale = Math.min(900 / rangeX, 400 / rangeY);
    const width = rangeX * scale;
    const height = rangeY * scale;
    const left = (1000 - width) / 2;
    const top = (460 - height) / 2;

    return {
      point: (x: number, y: number) => ({
        x: left + (x - minX) * scale,
        y: top + (maxY - y) * scale,
      }),
      selectedHistory,
    };
  }, [histories, positions, selectedNumber]);

  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.number, driver])),
    [drivers],
  );
  const selectedDriver = selectedNumber ? driverByNumber.get(selectedNumber) : undefined;

  const selectedPath =
    projection?.selectedHistory
      .map((point) => {
        const projected = projection.point(point.x, point.y);
        return projected.x.toFixed(1) + "," + projected.y.toFixed(1);
      })
      .join(" ") ?? "";

  return (
    <div className="liveTrackWrap">
      <svg className="liveTrackSvg" viewBox="0 0 1000 460" role="img" aria-label="Live car positions">
        {selectedPath && (
          <>
            <polyline className="liveTrackTraceOuter" points={selectedPath} />
            <polyline
              className="liveTrackTrace"
              points={selectedPath}
              style={selectedDriver ? { stroke: "#" + selectedDriver.teamColour } : undefined}
            />
          </>
        )}
        {projection &&
          positions.map((position) => {
            const point = projection.point(position.x, position.y);
            const driver = driverByNumber.get(position.number);
            const selected = position.number === selectedNumber;
            return (
              <g
                key={position.number}
                className={"liveTrackCar " + (selected ? "selected" : "")}
                transform={"translate(" + point.x + " " + point.y + ")"}
                onClick={() => onSelect(position.number)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(position.number);
                }}
              >
                <circle r={selected ? 10 : 6} style={{ fill: "#" + (driver?.teamColour || "8b98a5") }} />
                <text x="12" y="4">
                  {driver?.position && driver.position !== "—" ? "P" + driver.position + " " : ""}
                  {driverLabel(driver, position.number)}
                </text>
              </g>
            );
          })}
      </svg>
      {!positions.length && <div className="liveTrackWaiting">Waiting for Position.z…</div>}
      <div className="liveTrackLegend">
        <span>{positions.length ? positions.length + " cars · ~220 ms position feed" : "position feed unavailable"}</span>
        <span>{selectedDriver ? "trace · " + (selectedDriver.tla || selectedDriver.number) : "select a driver to follow"}</span>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: LiveInsight }) {
  return (
    <div className={"liveInsight " + insight.tone}>
      <span>{insight.title}</span>
      <strong>{insight.value}</strong>
      <p>{insight.detail}</p>
    </div>
  );
}

function SessionStats({
  stats,
  drivers,
  onSelect,
}: {
  stats: LiveSessionStat[];
  drivers: LiveDriverRow[];
  onSelect: (number: string) => void;
}) {
  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.number, driver])),
    [drivers],
  );
  if (!stats.length) return null;
  return (
    <section className="liveStatsRibbon" aria-label="Live session statistics">
      {stats.map((stat) => {
        const driver = stat.number ? driverByNumber.get(stat.number) : undefined;
        return (
          <button
            type="button"
            key={stat.label}
            className="liveStatTile"
            onClick={() => stat.number && onSelect(stat.number)}
            disabled={!stat.number}
          >
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>
              {driver && <i style={{ background: "#" + driver.teamColour }} />}
              {stat.detail}
            </small>
          </button>
        );
      })}
    </section>
  );
}

function DriverRail({
  drivers,
  selectedNumber,
  onSelect,
}: {
  drivers: LiveDriverRow[];
  selectedNumber: string | null;
  onSelect: (number: string) => void;
}) {
  if (!drivers.length) return null;
  return (
    <nav className="liveDriverRail" aria-label="Driver focus">
      {drivers.map((driver) => (
        <button
          type="button"
          key={driver.number}
          className={selectedNumber === driver.number ? "selected" : ""}
          style={{ "--row-color": "#" + driver.teamColour } as CSSProperties}
          onClick={() => onSelect(driver.number)}
          title={(driver.name || driver.tla) + " · " + (driver.team || "Formula 1")}
        >
          <i />
          <span>P{valueOrDash(driver.position)}</span>
          <strong>{driver.tla || driver.number}</strong>
          <small>
            {driver.tyre ? driver.tyre.slice(0, 1) : "—"}
            {driver.stintLaps == null ? "" : " · " + driver.stintLaps + "L"}
          </small>
        </button>
      ))}
    </nav>
  );
}

function CommentaryList({
  items,
  selectedNumber,
  onSelect,
}: {
  items: LiveCommentaryItem[];
  selectedNumber: string | null;
  onSelect: (number: string) => void;
}) {
  if (!items.length)
    return <div className="liveEmpty">Waiting for enough live timing data to build the race narrative…</div>;
  return (
    <div className="liveCommentaryList">
      {items.map((item, index) => {
        const body = (
          <>
            <span>{item.kicker}</span>
            <strong>{item.headline}</strong>
            <p>{item.detail}</p>
          </>
        );
        return item.number ? (
          <button
            type="button"
            key={item.kicker + item.headline + index}
            className={"liveCommentaryItem " + item.tone + (selectedNumber === item.number ? " selected" : "")}
            onClick={() => onSelect(item.number!)}
          >
            {body}
          </button>
        ) : (
          <div key={item.kicker + item.headline + index} className={"liveCommentaryItem " + item.tone}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function feedPreview(value: unknown) {
  if (value === undefined) return "No payload received for this feed in the current session.";
  try {
    const json = JSON.stringify(value, null, 2);
    if (!json) return "Empty payload.";
    const limit = 20000;
    return json.length > limit
      ? json.slice(0, limit) + "\n\n… preview truncated (" + json.length.toLocaleString() + " characters total)"
      : json;
  } catch {
    return "Payload could not be serialized.";
  }
}

function FeedExplorer({
  store,
  coverage,
  driver,
  facts,
}: {
  store: LiveTimingStore;
  coverage: Array<{ feed: string; key: string; active: boolean }>;
  driver: LiveDriverRow | null;
  facts: LiveDriverFeedFact[];
}) {
  const activeFeeds = coverage.filter((feed) => feed.active);
  const [selectedFeed, setSelectedFeed] = useState("TimingData");
  useEffect(() => {
    if (activeFeeds.some((feed) => feed.feed === selectedFeed)) return;
    const next = activeFeeds[0]?.feed;
    if (next) setSelectedFeed(next);
  }, [activeFeeds, selectedFeed]);
  const selectedKey = liveFeedKey(selectedFeed);
  const payload = store[selectedKey];
  const preview = useMemo(() => feedPreview(payload), [payload]);
  const payloadSize = useMemo(() => {
    try {
      return JSON.stringify(payload)?.length ?? 0;
    } catch {
      return 0;
    }
  }, [payload]);

  return (
    <div className="liveExplorerBody">
      <div className="liveExplorerToolbar">
        <label>
          FEED
          <select value={selectedFeed} onChange={(event) => setSelectedFeed(event.target.value)}>
            {coverage.map((feed) => (
              <option key={feed.feed} value={feed.feed}>
                {feed.active ? "● " : "○ "}
                {feed.feed}
              </option>
            ))}
          </select>
        </label>
        <span>{payloadSize ? payloadSize.toLocaleString() + " chars" : "no payload"}</span>
      </div>
      <div className="liveExplorerGrid">
        <div className="liveDriverFacts">
          <div className="liveExplorerSubhead">
            <span>SELECTED DRIVER DATA</span>
            <strong>{driver ? driver.tla || driver.number : "—"}</strong>
          </div>
          {facts.slice(0, 24).map((fact, index) => (
            <div className="liveDriverFact" key={fact.feed + fact.label + index}>
              <small>{fact.feed}</small>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
          {!facts.length && (
            <div className="liveEmpty">
              No additional driver-linked optional-feed values have arrived yet.
            </div>
          )}
        </div>
        <pre className="liveRawFeed" aria-label={selectedFeed + " raw data preview"}>{preview}</pre>
      </div>
    </div>
  );
}

export function LiveTerminal() {
  const [store, setStore] = useState<LiveTimingStore>({});
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [positionHistory, setPositionHistory] = useState<Record<string, Point[]>>({});
  const [radioTranscriptionConfigured, setRadioTranscriptionConfigured] = useState(false);
  const [radioTranscriptionModel, setRadioTranscriptionModel] = useState("");
  const [autoTranscribeRadio, setAutoTranscribeRadio] = useState(false);
  const [radioTranscripts, setRadioTranscripts] = useState<Record<string, RadioTranscriptState>>({});

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/radio-transcript", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          configured?: boolean;
          model?: string;
        };
        if (cancelled) return;
        setRadioTranscriptionConfigured(Boolean(payload.configured));
        setRadioTranscriptionModel(payload.model ?? "");
      })
      .catch(() => {
        /* Transcription is optional; live timing should not depend on it. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/live-timing");

    const onStatus = (event: MessageEvent<string>) => {
      try {
        const status = JSON.parse(event.data) as StatusPayload;
        if (status.status) setConnection(status.status);
        setConnectionMessage(status.message ?? "");
        if (status.at) setLastUpdate(status.at);
      } catch {
        setConnection("error");
        setConnectionMessage("Invalid live timing status");
      }
    };

    const onRecord = (event: MessageEvent<string>) => {
      try {
        const record = JSON.parse(event.data) as { feed?: string; data?: unknown; at?: number };
        if (!record.feed) return;
        if (liveFeedKey(record.feed) === "Position") {
          const samples = selectLivePositions({ Position: record.data });
          if (samples.length) {
            setPositionHistory((current) => {
              const next = { ...current };
              for (const sample of samples) {
                const history = [...(current[sample.number] ?? [])];
                const previous = history.at(-1);
                if (previous && Math.hypot(sample.x - previous.x, sample.y - previous.y) < 8) continue;
                history.push({ x: sample.x, y: sample.y });
                if (history.length > 2500) history.splice(0, history.length - 2500);
                next[sample.number] = history;
              }
              return next;
            });
          }
        }
        setStore((current) => applyLiveRecord(current, record.feed as string, record.data));
        setConnection("connected");
        setConnectionMessage("");
        setLastUpdate(record.at ?? Date.now());
      } catch {
        /* One malformed record should not stop the live feed. */
      }
    };

    source.addEventListener("status", onStatus as EventListener);
    source.addEventListener("record", onRecord as EventListener);
    source.onerror = () => {
      setConnection((current) => (current === "error" ? "error" : "disconnected"));
    };

    return () => source.close();
  }, []);

  const drivers = useMemo(() => selectLiveDrivers(store), [store]);
  const positions = useMemo(() => selectLivePositions(store), [store]);
  const weather = useMemo(() => selectLiveWeather(store), [store]);
  const trackStatus = useMemo(() => selectLiveTrackStatus(store), [store]);
  const raceControl = useMemo(() => selectLiveRaceControl(store), [store]);
  const radio = useMemo(() => selectLiveTeamRadio(store), [store]);
  const lapCount = useMemo(() => selectLiveLapCount(store), [store]);
  const session = useMemo(() => selectLiveSessionInfo(store), [store]);
  const sessionStatus = useMemo(() => selectLiveSessionStatus(store), [store]);
  const sessionClock = useMemo(() => selectLiveClock(store), [store]);
  const feedNames = useMemo(() => selectLiveFeedNames(store), [store]);
  const feedCoverage = useMemo(() => selectLiveFeedCoverage(store), [store]);
  const sessionStats = useMemo(() => selectLiveSessionStats(drivers), [drivers]);
  const commentary = useMemo(() => selectLiveCommentary(store, drivers), [store, drivers]);
  const championship = useMemo(() => selectLiveChampionship(store), [store]);

  const selected =
    drivers.find((driver) => driver.number === selectedNumber) ?? drivers[0] ?? null;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.number, driver])),
    [drivers],
  );
  const insights = useMemo(
    () => selectLiveDriverInsights(store, drivers, selected),
    [store, drivers, selected],
  );
  const selectedEvents = useMemo(
    () => (selected ? selectLiveDriverEventCounts(store, selected.number) : null),
    [store, selected],
  );
  const selectedFacts = useMemo(
    () => (selected ? selectLiveDriverFeedFacts(store, selected.number) : []),
    [store, selected],
  );
  const selectedChampionship = selected
    ? championship.find((row) => row.number === selected.number)
    : null;
  const selectedRadio = useMemo(() => {
    if (!selected) return radio;
    return [...radio].sort((a, b) => Number(b.number === selected.number) - Number(a.number === selected.number));
  }, [radio, selected]);

  const transcribeRadioClip = useCallback(
    async (clip: { path: string; text: string }) => {
      if (!radioTranscriptionConfigured || !session?.path || !clip.path || clip.text) return;
      const key = clip.path;
      const current = radioTranscripts[key];
      if (current?.status === "loading" || current?.status === "done") return;
      setRadioTranscripts((state) => ({
        ...state,
        [key]: { status: "loading" },
      }));
      try {
        const response = await fetch("/api/radio-transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionPath: session.path,
            clipPath: clip.path,
          }),
        });
        const payload = (await response.json()) as {
          text?: string;
          error?: string;
          model?: string;
        };
        if (!response.ok || !payload.text) {
          throw new Error(payload.error || "Transcription failed.");
        }
        setRadioTranscripts((state) => ({
          ...state,
          [key]: {
            status: "done",
            text: payload.text,
            model: payload.model,
          },
        }));
      } catch (error) {
        setRadioTranscripts((state) => ({
          ...state,
          [key]: {
            status: "error",
            error: error instanceof Error ? error.message : "Transcription failed.",
          },
        }));
      }
    },
    [radioTranscriptionConfigured, radioTranscripts, session?.path],
  );

  useEffect(() => {
    if (!autoTranscribeRadio || !radioTranscriptionConfigured || !session?.path) return;
    const next = selectedRadio
      .slice(0, 14)
      .find(
        (clip) =>
          clip.path &&
          !clip.text &&
          radioTranscripts[clip.path]?.status !== "loading" &&
          radioTranscripts[clip.path]?.status !== "done" &&
          radioTranscripts[clip.path]?.status !== "error",
      );
    if (next) void transcribeRadioClip(next);
  }, [
    autoTranscribeRadio,
    radioTranscriptionConfigured,
    radioTranscripts,
    selectedRadio,
    session?.path,
    transcribeRadioClip,
  ]);

  const selectedMentions = selected
    ? raceControl.filter((item) => {
        const text = item.message.toUpperCase();
        return (
          text.includes("CAR " + selected.number) ||
          (selected.tla && text.includes(selected.tla.toUpperCase())) ||
          (selected.name && text.includes(selected.name.toUpperCase()))
        );
      }).length
    : 0;

  const driverStyle = selected
    ? ({ "--driver-color": "#" + selected.teamColour } as CSSProperties)
    : undefined;

  return (
    <main className="liveShell" style={driverStyle}>
      <header className="liveTopBar">
        <div>
          <div className="brand">
            F1 DATA TERMINAL <span>LIVE</span>
          </div>
          <div className="liveEventName">{session?.meeting || "Formula 1 Live Timing"}</div>
          <div className="liveSessionName">{session?.session || "Waiting for active session"}</div>
        </div>

        <div className="liveHeaderActions">
          <div className={"liveConnection " + connection}>
            <i />
            <span>{connection.toUpperCase()}</span>
          </div>
          <Link className="liveNavButton" href="/">
            REPLAY
          </Link>
        </div>
      </header>

      <div className="liveStatusStrip">
        <strong data-status={trackStatus?.status ?? ""}>{trackStatus?.label ?? "WAITING FOR TRACK STATUS"}</strong>
        <span>{sessionStatus || "SESSION STATUS —"}</span>
        <span>
          LAP {lapCount?.current ?? "—"} / {lapCount?.total ?? "—"}
        </span>
        <span>
          CLOCK {sessionClock?.remaining || "—"}
          {sessionClock?.extrapolating ? " · RUNNING" : ""}
        </span>
        <span>
          FEEDS {feedNames.length}/{LIVE_TOPICS.length}
        </span>
        <span>{lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "NO DATA YET"}</span>
      </div>

      {connection === "error" && (
        <div className="dataError" role="alert">
          Live timing unavailable{connectionMessage ? ": " + connectionMessage : "."} The browser will retry automatically.
        </div>
      )}

      <SessionStats stats={sessionStats} drivers={drivers} onSelect={setSelectedNumber} />
      <DriverRail
        drivers={drivers}
        selectedNumber={selected?.number ?? null}
        onSelect={setSelectedNumber}
      />

      <section className="liveGrid">
        <article className="liveCard liveTimingCard">
          <div className="liveCardHeader liveCardHeaderSplit">
            <div>
              <span>FIELD</span>
              <strong>Timing / Classification</strong>
            </div>
            <small>{drivers.length ? drivers.length + " cars" : "waiting"}</small>
          </div>
          <div className="liveTimingTable">
            <div className="liveTimingRow liveTimingHead">
              <span>P</span>
              <span>DRIVER</span>
              <span>GAP</span>
              <span>INT</span>
              <span>LAST</span>
              <span>BEST</span>
              <span>S1</span>
              <span>S2</span>
              <span>S3</span>
              <span>TYRE</span>
              <span>AGE</span>
            </div>
            {drivers.map((driver) => (
              <button
                key={driver.number}
                className={"liveTimingRow " + (selected?.number === driver.number ? "selected" : "")}
                onClick={() => setSelectedNumber(driver.number)}
                style={{ "--row-color": "#" + driver.teamColour } as CSSProperties}
              >
                <span className="livePositionCell">{valueOrDash(driver.position)}</span>
                <span className="liveDriverCell">
                  <i />
                  <b>{driver.tla || driver.number}</b>
                  {driver.inPit && <em>PIT</em>}
                  {driver.pitOut && <em>OUT</em>}
                </span>
                <span>{driver.position === "1" ? "LEADER" : valueOrDash(driver.gap)}</span>
                <span className={driver.catching ? "liveCatching" : ""}>
                  {driver.catching ? "▲ " : ""}
                  {valueOrDash(driver.interval)}
                </span>
                <span className={driver.lastLapOverallFastest ? "timingPurple" : driver.lastLapPersonalFastest ? "timingGreen" : ""}>
                  {valueOrDash(driver.lastLap)}
                </span>
                <span>{valueOrDash(driver.bestLap)}</span>
                {driver.sectors.map((sector, index) => (
                  <span
                    key={index}
                    className={sector.overallFastest ? "timingPurple" : sector.personalFastest ? "timingGreen" : ""}
                  >
                    {valueOrDash(sector.value)}
                  </span>
                ))}
                <span>
                  {driver.tyre ? <b className={"liveTyreBadge " + tyreClass(driver.tyre)}>{driver.tyre.slice(0, 1)}</b> : "—"}
                </span>
                <span>{driver.stintLaps == null ? "—" : driver.stintLaps + "L"}</span>
              </button>
            ))}
            {!drivers.length && <div className="liveEmpty">Waiting for Formula 1 timing data…</div>}
          </div>
        </article>

        <article className="liveCard liveDriverCard">
          <div className="liveCardHeader">
            <span>FOCUS</span>
            <strong>Driver / Car / Strategy</strong>
          </div>
          {selected ? (
            <>
              <div className="liveDriverHero">
                <div className="liveDriverNumber">{selected.number}</div>
                <div>
                  <h2>{selected.name || selected.tla}</h2>
                  <p>
                    {selected.team || "Formula 1"}
                    {selected.countryCode ? " · " + selected.countryCode : ""}
                    {selected.inPit
                      ? " · IN PIT"
                      : selected.retired
                        ? " · RETIRED"
                        : selected.stopped
                          ? " · STOPPED"
                          : selected.knockedOut
                            ? " · OUT"
                            : ""}
                  </p>
                </div>
                <b>P{valueOrDash(selected.position)}</b>
              </div>

              <div className="liveTelemetryHero">
                <div>
                  <span>SPEED</span>
                  <strong>{selected.speed == null ? "—" : selected.speed + " km/h"}</strong>
                  <small>live</small>
                </div>
                <div>
                  <span>GEAR</span>
                  <strong>{selected.gear ?? "—"}</strong>
                </div>
                <div>
                  <span>THROTTLE</span>
                  <strong>{selected.throttle == null ? "—" : Math.round(selected.throttle) + "%"}</strong>
                </div>
              </div>

              <div className="liveMetrics">
                <Metric label="RPM" value={selected.rpm?.toLocaleString() ?? "—"} />
                <Metric label="Brake" value={selected.brake == null ? "—" : selected.brake ? "ON" : "OFF"} />
                <Metric label="Aero ch45" value={selected.aero ?? "—"} />
                <Metric label="Best Lap" value={selected.bestLap || "—"} />
                <Metric
                  label="Tyre"
                  value={
                    selected.tyre
                      ? selected.tyre +
                        (selected.tyreNew == null ? "" : selected.tyreNew ? " · NEW" : " · USED")
                      : "—"
                  }
                />
                <Metric label="Stint" value={selected.stintNumber ?? "—"} />
                <Metric label="Tyre Laps" value={selected.stintLaps ?? "—"} />
                <Metric label="Pit Stops" value={selected.pitStops ?? selectedEvents?.pitStops.length ?? "—"} />
              </div>

              <div className="liveSectors">
                {selected.sectors.map((sector, index) => (
                  <Sector key={index} index={index} sector={sector} />
                ))}
              </div>

              <div className="liveSpeedTraps">
                <Metric label="I1" value={selected.speeds.i1 ? selected.speeds.i1 + " km/h" : "—"} />
                <Metric label="I2" value={selected.speeds.i2 ? selected.speeds.i2 + " km/h" : "—"} />
                <Metric label="Finish" value={selected.speeds.finish ? selected.speeds.finish + " km/h" : "—"} />
                <Metric label="ST" value={selected.speeds.straight ? selected.speeds.straight + " km/h" : "—"} />
              </div>
            </>
          ) : (
            <div className="liveEmpty">Waiting for driver data…</div>
          )}
        </article>

        <article className="liveCard liveTrackCard">
          <div className="liveCardHeader liveCardHeaderSplit">
            <div>
              <span>POSITION.Z</span>
              <strong>Live Track / XY Position</strong>
            </div>
            {selected && <DriverIdentity driver={selected} compact />}
          </div>
          <LiveTrackMap
            positions={positions}
            histories={positionHistory}
            drivers={drivers}
            selectedNumber={selected?.number ?? null}
            onSelect={setSelectedNumber}
          />
        </article>

        <article className="liveCard liveInsightsCard">
          <div className="liveCardHeader">
            <span>DERIVED · FACTUAL</span>
            <strong>Race Story</strong>
          </div>
          <div className="liveInsightList">
            {insights.map((insight, index) => (
              <InsightCard key={insight.title + index} insight={insight} />
            ))}
            {!insights.length && <div className="liveEmpty">Waiting for enough timing data to build driver context…</div>}
          </div>
        </article>

        <article className="liveCard liveCommentaryCard">
          <div className="liveCardHeader liveCardHeaderSplit">
            <div>
              <span>LIVE CONTEXT · DERIVED</span>
              <strong>Commentary Desk</strong>
            </div>
            <small>timing facts only</small>
          </div>
          <CommentaryList
            items={commentary}
            selectedNumber={selected?.number ?? null}
            onSelect={setSelectedNumber}
          />
        </article>

        <article className="liveCard liveStrategyCard">
          <div className="liveCardHeader">
            <span>DRIVER EVENTS</span>
            <strong>Strategy / Activity</strong>
          </div>
          {selected ? (
            <div className="liveStrategyBody">
              <div className="liveStrategyDriver">
                <DriverIdentity driver={selected} />
                <span>P{valueOrDash(selected.position)}</span>
              </div>
              <div className="liveStrategyStats">
                <Metric label="Pit stops" value={selectedEvents?.pitStops.length ?? selected.pitStops ?? "—"} />
                <Metric label="Overtakes" value={selectedEvents?.overtakesMade ?? "—"} />
                <Metric label="Lost to passes" value={selectedEvents?.overtakenBy ?? "—"} />
                <Metric label="Radio clips" value={selectedEvents?.radio.length ?? 0} />
                <Metric label="RC mentions" value={selectedMentions} />
                <Metric
                  label="Projected WDC"
                  value={
                    selectedChampionship?.projectedPosition == null
                      ? "—"
                      : "P" + selectedChampionship.projectedPosition
                  }
                />
                <Metric
                  label="Projected pts"
                  value={selectedChampionship?.projectedPoints ?? "—"}
                />
                <Metric label="Current lap" value={selected.currentLap ?? "—"} />
              </div>
              {!!selectedEvents?.pitStops.length && (
                <div className="liveEventMiniList">
                  {selectedEvents.pitStops.slice(0, 4).map((stop, index) => (
                    <div key={[stop.number, stop.lap, stop.duration, index].join("-")}>
                      <strong>{stop.lap == null ? "PIT" : "L" + stop.lap}</strong>
                      <span>{stop.duration || stop.pitLaneTime || "pit event"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="liveEmpty">Select a driver.</div>
          )}
        </article>

        <article className="liveCard liveConditionsCard">
          <div className="liveCardHeader">
            <span>CONDITIONS</span>
            <strong>Track / Weather</strong>
          </div>
          <div className="liveConditionsTitle">
            <strong>{trackStatus?.label ?? "—"}</strong>
            <span>{[session?.location, session?.country].filter(Boolean).join(", ")}</span>
          </div>
          <div className="liveMetrics">
            <Metric label="Air" value={weather?.airTemp ? weather.airTemp + "°C" : "—"} />
            <Metric label="Track" value={weather?.trackTemp ? weather.trackTemp + "°C" : "—"} />
            <Metric label="Humidity" value={weather?.humidity ? weather.humidity + "%" : "—"} />
            <Metric label="Wind" value={weather?.windSpeed ? weather.windSpeed + " m/s" : "—"} />
            <Metric label="Wind Dir" value={weather?.windDirection ? weather.windDirection + "°" : "—"} />
            <Metric label="Rain" value={weather ? (weather.rainfall ? "YES" : "NO") : "—"} />
            <Metric label="Pressure" value={weather?.pressure ? weather.pressure + " hPa" : "—"} />
            <Metric label="Session Clock" value={sessionClock?.remaining || "—"} />
          </div>
        </article>

        <article className="liveCard liveExplorerCard">
          <div className="liveCardHeader liveCardHeaderSplit">
            <div>
              <span>ALL RECEIVED DATA</span>
              <strong>Feed / Driver Explorer</strong>
            </div>
            <small>{feedNames.length} feeds received</small>
          </div>
          <FeedExplorer
            store={store}
            coverage={feedCoverage}
            driver={selected}
            facts={selectedFacts}
          />
        </article>

        <article className="liveCard liveFeedsCard">
          <div className="liveCardHeader liveCardHeaderSplit">
            <div>
              <span>DATA BUS</span>
              <strong>Feed Coverage</strong>
            </div>
            <small>{feedNames.length} active</small>
          </div>
          <div className="liveFeedGrid">
            {feedCoverage.map((feed) => (
              <div key={feed.feed} className={feed.active ? "active" : ""} title={feed.active ? "Data received" : "No data received in this session"}>
                <i />
                <span>{feed.feed}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="liveCard liveControlCard">
          <div className="liveCardHeader">
            <span>OFFICIAL</span>
            <strong>Race Control</strong>
          </div>
          <div className="liveRaceControl">
            {raceControl.slice(0, 30).map((item, index) => {
              const upper = item.message.toUpperCase();
              const mentionedDrivers = drivers.filter((driver) =>
                upper.includes("CAR " + driver.number) ||
                (!!driver.tla && upper.includes(driver.tla.toUpperCase())) ||
                (!!driver.name && upper.includes(driver.name.toUpperCase()))
              ).slice(0, 4);
              const selectedMention = !!selected && mentionedDrivers.some((driver) => driver.number === selected.number);
              return (
                <div className={"liveRaceMessage " + (selectedMention ? "selectedDriver" : "")} key={item.utc + "-" + index}>
                  <span>{item.flag || item.category || "INFO"}</span>
                  <small>
                    {item.lap != null ? "L" + item.lap : ""}
                    {item.utc
                      ? " · " +
                        new Date(item.utc).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : ""}
                  </small>
                  <p>{item.message}</p>
                  {!!mentionedDrivers.length && (
                    <div className="liveRcDrivers">
                      {mentionedDrivers.map((driver) => (
                        <button
                          type="button"
                          key={driver.number}
                          style={{ "--row-color": "#" + driver.teamColour } as CSSProperties}
                          onClick={() => setSelectedNumber(driver.number)}
                        >
                          <i />
                          {driver.tla || driver.number}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!raceControl.length && <div className="liveEmpty">Waiting for race control messages…</div>}
          </div>
        </article>

        <article className="liveCard liveRadioCard">
          <div className="liveCardHeader liveCardHeaderSplit">
            <div>
              <span>TEAM RADIO</span>
              <strong>Latest Captures</strong>
            </div>
            <div className="liveRadioHeaderTools">
              {selected && <small>{selectedEvents?.radio.length ?? 0} for {selected.tla}</small>}
              {radioTranscriptionConfigured ? (
                <button
                  type="button"
                  className={"liveAutoTranscribe " + (autoTranscribeRadio ? "active" : "")}
                  onClick={() => setAutoTranscribeRadio((value) => !value)}
                  title={radioTranscriptionModel ? "Model: " + radioTranscriptionModel : undefined}
                >
                  AUTO TRANSCRIBE {autoTranscribeRadio ? "ON" : "OFF"}
                </button>
              ) : (
                <small title="Set OPENAI_API_KEY on the local server to enable speech-to-text.">
                  TRANSCRIPTION NOT CONFIGURED
                </small>
              )}
            </div>
          </div>
          <div className="liveRadioList">
            {selectedRadio.slice(0, 14).map((clip, index) => {
              const driver = driverByNumber.get(clip.number);
              const url = teamRadioUrl(session, clip);
              const isSelected = clip.number === selected?.number;
              const transcript = clip.path ? radioTranscripts[clip.path] : undefined;
              return (
                <div
                  className={"liveRadioItem " + (isSelected ? "selectedDriver" : "")}
                  key={clip.utc + "-" + index}
                  style={driver ? ({ "--row-color": "#" + driver.teamColour } as CSSProperties) : undefined}
                >
                  <div className="liveRadioMeta">
                    <strong>
                      {driver ? (
                        <button
                          type="button"
                          className="liveDriverLink"
                          onClick={() => setSelectedNumber(driver.number)}
                        >
                          <DriverIdentity driver={driver} compact />
                        </button>
                      ) : (
                        driverLabel(driver, clip.number)
                      )}
                    </strong>
                    <span>
                      {clip.utc
                        ? new Date(clip.utc).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "—"}
                    </span>
                  </div>
                  {clip.text ? (
                    <p className="liveTranscript">
                      <small>F1 TRANSCRIPT</small>
                      {clip.text}
                    </p>
                  ) : transcript?.status === "done" && transcript.text ? (
                    <p className="liveTranscript ai">
                      <small>AI TRANSCRIPT{transcript.model ? " · " + transcript.model : ""}</small>
                      {transcript.text}
                    </p>
                  ) : transcript?.status === "error" ? (
                    <div className="liveTranscriptError">
                      <span>{transcript.error}</span>
                      <button type="button" onClick={() => clip.path && setRadioTranscripts((state) => {
                        const next = { ...state };
                        delete next[clip.path];
                        return next;
                      })}>RETRY</button>
                    </div>
                  ) : radioTranscriptionConfigured && clip.path ? (
                    <button
                      type="button"
                      className="liveTranscribeButton"
                      disabled={transcript?.status === "loading"}
                      onClick={() => void transcribeRadioClip(clip)}
                    >
                      {transcript?.status === "loading" ? "TRANSCRIBING…" : "TRANSCRIBE RADIO"}
                    </button>
                  ) : null}
                  {url ? (
                    <audio controls preload="none" src={url}>
                      Team radio audio
                    </audio>
                  ) : (
                    <small>Audio path unavailable</small>
                  )}
                </div>
              );
            })}
            {!radio.length && <div className="liveEmpty">Waiting for TeamRadio…</div>}
          </div>
        </article>
      </section>
    </main>
  );
}