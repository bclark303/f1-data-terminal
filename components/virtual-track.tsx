"use client";
import { useMemo } from "react";
import type { Driver, Lap, LocationPoint } from "@/lib/types";
import {
  indexRows,
  windowAt,
  makeLapIndex,
  estimatedProgress,
  measuredPosition,
} from "@/lib/replay-index";
import { TrackViewport } from "./track-viewport";
type Projection = {
  x: (value: number) => number;
  y: (value: number) => number;
};

type TrackModel = {
  points: LocationPoint[];
  cumulative: number[];
  total: number;
};

function makeProjection(points: LocationPoint[]): Projection | null {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const canvasWidth = 1000;
  const canvasHeight = 600;
  const padding = 48;
  const scale = Math.min(
    (canvasWidth - padding * 2) / spanX,
    (canvasHeight - padding * 2) / spanY,
  );
  const offsetX = (canvasWidth - spanX * scale) / 2;
  const offsetY = (canvasHeight - spanY * scale) / 2;

  return {
    x: (value) => offsetX + (value - minX) * scale,
    y: (value) => offsetY + (value - minY) * scale,
  };
}

function makeTrackModel(points: LocationPoint[]): TrackModel | null {
  if (points.length < 2) return null;
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
    cumulative.push(total);
  }
  if (total <= 0) return null;
  return { points, cumulative, total };
}

function pointAtProgress(model: TrackModel, progress: number) {
  const target = Math.max(0, Math.min(0.9999, progress)) * model.total;
  let low = 0;
  let high = model.cumulative.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (model.cumulative[mid] < target) low = mid + 1;
    else high = mid;
  }
  const right = Math.max(1, low);
  const left = right - 1;
  const startDistance = model.cumulative[left];
  const segment = Math.max(1, model.cumulative[right] - startDistance);
  const t = (target - startDistance) / segment;
  return {
    x:
      model.points[left].x + (model.points[right].x - model.points[left].x) * t,
    y:
      model.points[left].y + (model.points[right].y - model.points[left].y) * t,
  };
}

export function VirtualTrack({
  selectedLocations,
  drivers,
  lapsByDriver,
  geometry,
  geometryLap,
  raceTime,
  selectedDriver,
  onSelect,
  loading,
  error,
}: {
  selectedLocations: LocationPoint[];
  drivers: Driver[];
  lapsByDriver: Map<number, Lap[]>;
  geometry: LocationPoint[];
  geometryLap: Lap | null;
  raceTime: number;
  selectedDriver: number;
  onSelect: (driver: number) => void;
  loading: boolean;
  error: string | null;
}) {
  const circuitPoints = useMemo(() => {
    if (!geometry.length) return [];
    if (!geometryLap?.date_start || !geometryLap.lap_duration)
      return geometry.filter((_, index) => index % 10 === 0);
    const start = Date.parse(geometryLap.date_start);
    const end = start + geometryLap.lap_duration * 1000;
    const lapPoints = geometry.filter((point) => {
      const timestamp = Date.parse(point.date);
      return timestamp >= start && timestamp <= end;
    });
    return lapPoints.filter((_, index) => index % 2 === 0);
  }, [geometry, geometryLap]);

  const projection = useMemo(
    () => makeProjection(circuitPoints),
    [circuitPoints],
  );
  const trackModel = useMemo(
    () => makeTrackModel(circuitPoints),
    [circuitPoints],
  );

  const lapIndexes = useMemo(
    () =>
      new Map(
        [...lapsByDriver].map(([driver, rows]) => [driver, makeLapIndex(rows)]),
      ),
    [lapsByDriver],
  );
  const selectedIndex = useMemo(
    () => indexRows(selectedLocations, (point) => point.date),
    [selectedLocations],
  );
  const geometryIndex = useMemo(
    () => indexRows(geometry, (point) => point.date),
    [geometry],
  );
  const currentPoints = useMemo(() => {
    if (!trackModel) return [];
    return drivers.flatMap((driver) => {
      const measured =
        driver.driver_number === selectedDriver
          ? measuredPosition(selectedIndex, raceTime)
          : driver.driver_number === geometry[0]?.driver_number
            ? measuredPosition(geometryIndex, raceTime)
            : null;
      if (measured) return [{ driver, current: measured, estimated: false }];
      const index = lapIndexes.get(driver.driver_number);
      const progress = index ? estimatedProgress(index, raceTime) : null;
      return progress === null
        ? []
        : [
            {
              driver,
              current: pointAtProgress(trackModel, progress),
              estimated: true,
            },
          ];
    });
  }, [
    drivers,
    raceTime,
    trackModel,
    selectedDriver,
    selectedIndex,
    geometryIndex,
    geometry,
    lapIndexes,
  ]);
  const selectedTrail = useMemo(
    () => windowAt(selectedIndex, raceTime - 6000, raceTime),
    [selectedIndex, raceTime],
  );

  const trackPath = useMemo(() => {
    if (!projection || circuitPoints.length < 2) return "";
    return (
      circuitPoints
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${projection.x(point.x).toFixed(1)},${projection.y(point.y).toFixed(1)}`,
        )
        .join(" ") + " Z"
    );
  }, [circuitPoints, projection]);

  const trailPath = useMemo(() => {
    if (!projection || selectedTrail.length < 2) return "";
    return selectedTrail
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${projection.x(point.x).toFixed(1)},${projection.y(point.y).toFixed(1)}`,
      )
      .join(" ");
  }, [projection, selectedTrail]);

  if (!projection || !trackModel) {
    return (
      <div className="trackCanvas emptyTrack">
        {error
          ? error
          : loading
            ? "Loading circuit geometry…"
            : "No circuit geometry available."}
      </div>
    );
  }

  return (
    <div className="trackCanvas">
      <TrackViewport
        selected={(() => {
          const point = currentPoints.find(
            (item) => item.driver.driver_number === selectedDriver,
          )?.current;
          return point
            ? { x: projection.x(point.x), y: projection.y(point.y) }
            : null;
        })()}
      >
        {trackPath && (
          <>
            <path d={trackPath} className="circuitGlow" />
            <path d={trackPath} className="circuitLine" />
          </>
        )}
        {trailPath && <path d={trailPath} className="selectedTrail" />}
        {currentPoints.map(({ driver, current, estimated }) => {
          const x = projection.x(current.x);
          const y = projection.y(current.y);
          const active = selectedDriver === driver.driver_number;
          return (
            <g
              key={driver.driver_number}
              className={`trackCar ${active ? "selected" : ""} ${estimated ? "estimated" : ""}`}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
              onClick={() => onSelect(driver.driver_number)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(driver.driver_number);
                }
              }}
              aria-label={`Select ${driver.full_name}${estimated ? ", estimated position" : ", measured position"}`}
            >
              <circle
                r={active ? 18 : 13}
                className="carHalo"
                style={{ stroke: `#${driver.team_colour}` }}
              />
              <circle r={active ? 13 : 10} className="carCore" />
              <text y="3.5" textAnchor="middle">
                {driver.driver_number}
              </text>
            </g>
          );
        })}
      </TrackViewport>
      <div className="trackLegend">
        <span>
          {currentPoints.length}/{drivers.length} cars plotted
        </span>
        <span>
          {loading ? "LOADING GEOMETRY" : "SOLID: MEASURED · DASHED: ESTIMATED"}
        </span>
      </div>
      {error && <div className="trackError">{error}</div>}
    </div>
  );
}
