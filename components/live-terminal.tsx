"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  applyLiveRecord,
  selectLiveDrivers,
  selectLiveLapCount,
  selectLiveRaceControl,
  selectLiveSessionInfo,
  selectLiveSessionStatus,
  selectLiveTrackStatus,
  selectLiveWeather,
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
  const weather = useMemo(() => selectLiveWeather(store), [store]);
  const trackStatus = useMemo(() => selectLiveTrackStatus(store), [store]);
  const raceControl = useMemo(() => selectLiveRaceControl(store), [store]);
  const lapCount = useMemo(() => selectLiveLapCount(store), [store]);
  const session = useMemo(() => selectLiveSessionInfo(store), [store]);
  const sessionStatus = useMemo(() => selectLiveSessionStatus(store), [store]);

  const selected =
    drivers.find((driver) => driver.number === selectedNumber) ??
    drivers[0] ??
    null;

  const drs =
    selected?.drs == null
      ? "—"
      : selected.drs >= 10
        ? "OPEN"
        : selected.drs >= 8
          ? "ARMED"
          : "CLOSED";

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
                </span>
                <span>
                  {driver.position === "1"
                    ? "LEADER"
                    : valueOrDash(driver.gap)}
                </span>
                <span>{valueOrDash(driver.interval)}</span>
                <span>{valueOrDash(driver.lastLap)}</span>
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
            <span>FOCUS</span>
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
                  <p>{selected.team || "Formula 1"}</p>
                </div>
                <b>P{valueOrDash(selected.position)}</b>
              </div>
              <div className="liveMetrics">
                <Metric label="Speed" value={selected.speed ?? "—"} />
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
                <Metric label="DRS" value={drs} />
                <Metric label="Best Lap" value={selected.bestLap || "—"} />
                <Metric
                  label="Stint"
                  value={
                    selected.tyre
                      ? selected.tyre +
                        (selected.stintLaps == null
                          ? ""
                          : " · " + selected.stintLaps)
                      : "—"
                  }
                />
              </div>
            </>
          ) : (
            <div className="liveEmpty">Waiting for driver data…</div>
          )}
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
              label="Rain"
              value={weather ? (weather.rainfall ? "YES" : "NO") : "—"}
            />
            <Metric
              label="Pressure"
              value={weather?.pressure ? weather.pressure + " hPa" : "—"}
            />
          </div>
        </article>

        <article className="liveCard liveControlCard">
          <div className="liveCardHeader">
            <span>OFFICIAL</span>
            <strong>Race Control</strong>
          </div>
          <div className="liveRaceControl">
            {raceControl.slice(0, 20).map((item, index) => (
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
      </section>
    </main>
  );
}
