"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIVE_TOPICS,
  applyLiveRecord,
  selectLiveClock,
  selectLiveDrivers,
  selectLiveFeedNames,
  selectLiveLapCount,
  selectLivePositions,
  selectLiveRaceControl,
  selectLiveSessionInfo,
  selectLiveSessionStatus,
  selectLiveTeamRadio,
  selectLiveTrackStatus,
  selectLiveWeather,
  teamRadioUrl,
  type LiveDriverRow,
  type LivePosition,
  type LiveSector,
  type LiveTimingStore,
} from "@/lib/live-timing";

type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

type StatusPayload = {
  status?: ConnectionState;
  message?: string;
  at?: number;
};

type Point = { x: number; y: number };

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
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

function Sector({
  index,
  sector,
}: {
  index: number;
  sector: LiveSector;
}) {
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
              className={status ? "crossed" : ""}
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

function LiveTrackMap({
  positions,
  drivers,
  selectedNumber,
  onSelect,
}: {
  positions: LivePosition[];
  drivers: LiveDriverRow[];
  selectedNumber: string | null;
  onSelect: (number: string) => void;
}) {
  const histories = useRef(new Map<string, Point[]>());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let changed = false;
    for (const position of positions) {
      let history = histories.current.get(position.number);
      if (!history) {
        history = [];
        histories.current.set(position.number, history);
      }
      const previous = history.at(-1);
      const moved =
        !previous ||
        Math.hypot(position.x - previous.x, position.y - previous.y) >= 8;
      if (!moved) continue;
      history.push({ x: position.x, y: position.y });
      if (history.length > 2500) history.splice(0, history.length - 2500);
      changed = true;
    }
    if (changed) setRevision((value) => value + 1);
  }, [positions]);

  const projection = useMemo(() => {
    void revision;
    const selectedHistory = selectedNumber
      ? histories.current.get(selectedNumber) ?? []
      : [];
    const reference =
      selectedHistory.length >= 20
        ? selectedHistory
        : [...histories.current.values()].flat();
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
  }, [positions, revision, selectedNumber]);

  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.number, driver])),
    [drivers],
  );

  const selectedPath =
    projection?.selectedHistory
      .map((point) => {
        const projected = projection.point(point.x, point.y);
        return projected.x.toFixed(1) + "," + projected.y.toFixed(1);
      })
      .join(" ") ?? "";

  return (
    <div className="liveTrackWrap">
      <svg
        className="liveTrackSvg"
        viewBox="0 0 1000 460"
        role="img"
        aria-label="Live car positions"
      >
        {selectedPath && (
          <>
            <polyline className="liveTrackTraceOuter" points={selectedPath} />
            <polyline className="liveTrackTrace" points={selectedPath} />
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
                  if (event.key === "Enter" || event.key === " ")
                    onSelect(position.number);
                }}
              >
                <circle
                  r={selected ? 9 : 6}
                  style={{
                    fill: "#" + (driver?.teamColour || "8b98a5"),
                  }}
                />
                <text x="11" y="4">
                  {driverLabel(driver, position.number)}
                </text>
              </g>
            );
          })}
      </svg>
      {!positions.length && (
        <div className="liveTrackWaiting">
          Waiting for Position.z…
        </div>
      )}
      <div className="liveTrackLegend">
        <span>
          {positions.length
            ? positions.length + " cars · ~220 ms position feed"
            : "position feed unavailable"}
        </span>
        <span>trace builds from received XY samples</span>
      </div>
    </div>
  );
}

export function LiveTerminal() {
  const [store, setStore] = useState<LiveTimingStore>({});
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);

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
        const record = JSON.parse(event.data) as {
          feed?: string;
          data?: unknown;
          at?: number;
        };
        if (!record.feed) return;
        setStore((current) =>
          applyLiveRecord(current, record.feed as string, record.data),
        );
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
      setConnection((current) =>
        current === "error" ? "error" : "disconnected",
      );
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

  const selected =
    drivers.find((driver) => driver.number === selectedNumber) ??
    drivers[0] ??
    null;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.number, driver])),
    [drivers],
  );

  return (
    <main className="liveShell">
      <header className="liveTopBar">
        <div>
          <div className="brand">
            F1 DATA TERMINAL <span>LIVE</span>
          </div>
          <div className="liveEventName">
            {session?.meeting || "Formula 1 Live Timing"}
          </div>
          <div className="liveSessionName">
            {session?.session || "Waiting for active session"}
          </div>
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
        <strong>{trackStatus?.label ?? "WAITING FOR TRACK STATUS"}</strong>
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
        <span>
          {lastUpdate
            ? new Date(lastUpdate).toLocaleTimeString()
            : "NO DATA YET"}
        </span>
      </div>

      {connection === "error" && (
        <div className="dataError" role="alert">
          Live timing unavailable
          {connectionMessage ? ": " + connectionMessage : "."} The browser
          will retry automatically.
        </div>
      )}

      <section className="liveGrid">
        <article className="liveCard liveTimingCard">
          <div className="liveCardHeader">
            <span>FIELD</span>
            <strong>Timing / Classification</strong>
          </div>
          <div className="liveTimingTable">
            <div className="liveTimingRow liveTimingHead">
              <span>P</span>
              <span>DRIVER</span>
              <span>GAP</span>
              <span>INT</span>
              <span>LAST</span>
              <span>S1</span>
              <span>S2</span>
              <span>S3</span>
              <span>TYRE</span>
            </div>
            {drivers.map((driver) => (
              <button
                key={driver.number}
                className={
                  "liveTimingRow " +
                  (selected?.number === driver.number ? "selected" : "")
                }
                onClick={() => setSelectedNumber(driver.number)}
              >
                <span>{valueOrDash(driver.position)}</span>
                <span className="liveDriverCell">
                  <i style={{ background: "#" + driver.teamColour }} />
                  {driver.tla || driver.number}
                  {driver.inPit && <em>PIT</em>}
                </span>
                <span>
                  {driver.position === "1"
                    ? "LEADER"
                    : valueOrDash(driver.gap)}
                </span>
                <span>{valueOrDash(driver.interval)}</span>
                <span>{valueOrDash(driver.lastLap)}</span>
                {driver.sectors.map((sector, index) => (
                  <span
                    key={index}
                    className={
                      sector.overallFastest
                        ? "timingPurple"
                        : sector.personalFastest
                          ? "timingGreen"
                          : ""
                    }
                  >
                    {valueOrDash(sector.value)}
                  </span>
                ))}
                <span>{driver.tyre ? driver.tyre.slice(0, 1) : "—"}</span>
              </button>
            ))}
            {!drivers.length && (
              <div className="liveEmpty">
                Waiting for Formula 1 timing data…
              </div>
            )}
          </div>
        </article>

        <article className="liveCard liveDriverCard">
          <div className="liveCardHeader">
            <span>FOCUS + TELEMETRY</span>
            <strong>Driver / Car</strong>
          </div>
          {selected ? (
            <>
              <div className="liveDriverHero">
                <div
                  className="liveDriverNumber"
                  style={{ borderColor: "#" + selected.teamColour }}
                >
                  {selected.number}
                </div>
                <div>
                  <h2>{selected.name || selected.tla}</h2>
                  <p>
                    {selected.team || "Formula 1"}
                    {selected.inPit
                      ? " · IN PIT"
                      : selected.retired
                        ? " · RETIRED"
                        : selected.stopped
                          ? " · STOPPED"
                          : ""}
                  </p>
                </div>
                <b>P{valueOrDash(selected.position)}</b>
              </div>

              <div className="liveMetrics">
                <Metric
                  label="Speed"
                  value={selected.speed == null ? "—" : selected.speed + " km/h"}
                />
                <Metric label="Gear" value={selected.gear ?? "—"} />
                <Metric
                  label="RPM"
                  value={selected.rpm?.toLocaleString() ?? "—"}
                />
                <Metric
                  label="Throttle"
                  value={
                    selected.throttle == null
                      ? "—"
                      : Math.round(selected.throttle) + "%"
                  }
                />
                <Metric
                  label="Brake"
                  value={
                    selected.brake == null
                      ? "—"
                      : selected.brake
                        ? "ON"
                        : "OFF"
                  }
                />
                <Metric label="Aero ch45" value={selected.aero ?? "—"} />
                <Metric label="Best Lap" value={selected.bestLap || "—"} />
                <Metric
                  label="Tyre"
                  value={
                    selected.tyre
                      ? selected.tyre +
                        (selected.tyreNew == null
                          ? ""
                          : selected.tyreNew
                            ? " · NEW"
                            : " · USED")
                      : "—"
                  }
                />
                <Metric
                  label="Tyre Laps"
                  value={selected.stintLaps ?? "—"}
                />
                <Metric
                  label="Driver Lap"
                  value={selected.currentLap ?? "—"}
                />
                <Metric
                  label="Pit Stops"
                  value={selected.pitStops ?? "—"}
                />
                <Metric
                  label="Speed Trap"
                  value={
                    selected.speeds.straight
                      ? selected.speeds.straight + " km/h"
                      : "—"
                  }
                />
              </div>

              <div className="liveSectors">
                {selected.sectors.map((sector, index) => (
                  <Sector key={index} index={index} sector={sector} />
                ))}
              </div>

              <div className="liveSpeedTraps">
                <Metric
                  label="I1"
                  value={selected.speeds.i1 || "—"}
                />
                <Metric
                  label="I2"
                  value={selected.speeds.i2 || "—"}
                />
                <Metric
                  label="Finish"
                  value={selected.speeds.finish || "—"}
                />
                <Metric
                  label="ST"
                  value={selected.speeds.straight || "—"}
                />
              </div>
            </>
          ) : (
            <div className="liveEmpty">Waiting for driver data…</div>
          )}
        </article>

        <article className="liveCard liveTrackCard">
          <div className="liveCardHeader">
            <span>POSITION.Z</span>
            <strong>Live Track / XY Position</strong>
          </div>
          <LiveTrackMap
            positions={positions}
            drivers={drivers}
            selectedNumber={selected?.number ?? null}
            onSelect={setSelectedNumber}
          />
        </article>

        <article className="liveCard liveConditionsCard">
          <div className="liveCardHeader">
            <span>CONDITIONS</span>
            <strong>Track / Weather</strong>
          </div>
          <div className="liveConditionsTitle">
            <strong>{trackStatus?.label ?? "—"}</strong>
            <span>
              {[session?.location, session?.country].filter(Boolean).join(", ")}
            </span>
          </div>
          <div className="liveMetrics">
            <Metric
              label="Air"
              value={weather?.airTemp ? weather.airTemp + "°C" : "—"}
            />
            <Metric
              label="Track"
              value={weather?.trackTemp ? weather.trackTemp + "°C" : "—"}
            />
            <Metric
              label="Humidity"
              value={weather?.humidity ? weather.humidity + "%" : "—"}
            />
            <Metric
              label="Wind"
              value={
                weather?.windSpeed ? weather.windSpeed + " m/s" : "—"
              }
            />
            <Metric
              label="Wind Dir"
              value={weather?.windDirection ? weather.windDirection + "°" : "—"}
            />
            <Metric
              label="Rain"
              value={weather ? (weather.rainfall ? "YES" : "NO") : "—"}
            />
            <Metric
              label="Pressure"
              value={weather?.pressure ? weather.pressure + " hPa" : "—"}
            />
            <Metric
              label="Session Clock"
              value={sessionClock?.remaining || "—"}
            />
          </div>
        </article>

        <article className="liveCard liveControlCard">
          <div className="liveCardHeader">
            <span>OFFICIAL</span>
            <strong>Race Control</strong>
          </div>
          <div className="liveRaceControl">
            {raceControl.slice(0, 24).map((item, index) => (
              <div
                className="liveRaceMessage"
                key={item.utc + "-" + index}
              >
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
              </div>
            ))}
            {!raceControl.length && (
              <div className="liveEmpty">
                Waiting for race control messages…
              </div>
            )}
          </div>
        </article>

        <article className="liveCard liveRadioCard">
          <div className="liveCardHeader">
            <span>TEAM RADIO</span>
            <strong>Latest Captures</strong>
          </div>
          <div className="liveRadioList">
            {radio.slice(0, 12).map((clip, index) => {
              const driver = driverByNumber.get(clip.number);
              const url = teamRadioUrl(session, clip);
              return (
                <div className="liveRadioItem" key={clip.utc + "-" + index}>
                  <div className="liveRadioMeta">
                    <strong>
                      {driverLabel(driver, clip.number)}
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
                  {clip.text && <p>{clip.text}</p>}
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
            {!radio.length && (
              <div className="liveEmpty">
                Waiting for TeamRadio…
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
