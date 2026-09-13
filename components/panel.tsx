"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

export type PanelLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Interaction = {
  kind: "drag" | "resize";
  edge?: ResizeEdge;
  startX: number;
  startY: number;
  startLayout: PanelLayout;
};

type Point = { x: number; y: number };
type MapPan = { startX: number; startY: number; startCenter: Point };

const MIN_WIDTH = 280;
const MIN_HEIGHT = 220;
let topZ = 20;

const DEFAULTS: Record<string, PanelLayout> = {
  timingPanel: { x: 12, y: 12, width: 560, height: 742 },
  driverPanel: { x: 584, y: 12, width: 420, height: 365 },
  trackPanel: { x: 1016, y: 12, width: 420, height: 365 },
  controlPanel: { x: 584, y: 389, width: 420, height: 365 },
  weatherPanel: { x: 1016, y: 389, width: 420, height: 365 },
};

function keyFromClass(className: string) {
  return Object.keys(DEFAULTS).find((key) => className.split(/\s+/).includes(key)) ?? "panel";
}

function storageKey(id: string) {
  return `f1-terminal-panel:${id}:v2`;
}

function responsiveDefault(id: string, workspace: HTMLElement | null, fallback: PanelLayout) {
  if (!workspace || workspace.clientWidth < 900) return fallback;
  const width = workspace.clientWidth;
  const gap = 12;
  const leftWidth = Math.max(360, Math.min(560, width * 0.39));
  const rightWidth = Math.max(MIN_WIDTH, (width - leftWidth - gap * 4) / 2);
  const secondX = gap * 2 + leftWidth;
  const thirdX = secondX + rightWidth + gap;
  const topHeight = 365;
  const bottomY = gap * 2 + topHeight;
  const tallHeight = topHeight * 2 + gap;

  const layouts: Record<string, PanelLayout> = {
    timingPanel: { x: gap, y: gap, width: leftWidth, height: tallHeight },
    driverPanel: { x: secondX, y: gap, width: rightWidth, height: topHeight },
    trackPanel: { x: thirdX, y: gap, width: rightWidth, height: topHeight },
    controlPanel: { x: secondX, y: bottomY, width: rightWidth, height: topHeight },
    weatherPanel: { x: thirdX, y: bottomY, width: rightWidth, height: topHeight },
  };
  return layouts[id] ?? fallback;
}

function clampLayout(layout: PanelLayout, workspace: HTMLElement | null): PanelLayout {
  if (!workspace) return layout;
  const bounds = workspace.getBoundingClientRect();
  const width = Math.min(Math.max(MIN_WIDTH, layout.width), Math.max(MIN_WIDTH, bounds.width));
  const height = Math.min(Math.max(MIN_HEIGHT, layout.height), Math.max(MIN_HEIGHT, bounds.height));
  return {
    x: Math.min(Math.max(0, layout.x), Math.max(0, bounds.width - width)),
    y: Math.min(Math.max(0, layout.y), Math.max(0, bounds.height - height)),
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function Panel({
  id,
  defaultLayout,
  title,
  kicker,
  actions,
  className = "",
  children,
}: {
  id?: string;
  defaultLayout?: PanelLayout;
  title: string;
  kicker?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const layoutId = id ?? keyFromClass(className);
  const fallbackLayout = defaultLayout ?? DEFAULTS[keyFromClass(className)] ?? { x: 12, y: 12, width: 420, height: 320 };
  const isTrack = layoutId === "trackPanel";
  const panelRef = useRef<HTMLElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const mapPanRef = useRef<MapPan | null>(null);
  const mapCenterRef = useRef<Point>({ x: 500, y: 300 });
  const followFrameRef = useRef<number | null>(null);
  const [layout, setLayout] = useState(fallbackLayout);
  const [zIndex, setZIndex] = useState(1);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapFollow, setMapFollow] = useState(false);
  const [mapPanning, setMapPanning] = useState(false);

  const applyMapView = (zoom = mapZoom, center = mapCenterRef.current) => {
    if (!isTrack) return;
    const svg = panelRef.current?.querySelector<SVGSVGElement>(".trackSvg");
    if (!svg) return;
    const safeZoom = clamp(zoom, 1, 8);
    const width = 1000 / safeZoom;
    const height = 600 / safeZoom;
    const cx = clamp(center.x, width / 2, 1000 - width / 2);
    const cy = clamp(center.y, height / 2, 600 - height / 2);
    mapCenterRef.current = { x: cx, y: cy };
    svg.setAttribute("viewBox", `${cx - width / 2} ${cy - height / 2} ${width} ${height}`);
  };

  const resetMap = () => {
    mapCenterRef.current = { x: 500, y: 300 };
    setMapZoom(1);
    setMapFollow(false);
    requestAnimationFrame(() => applyMapView(1, { x: 500, y: 300 }));
  };

  const changeZoom = (factor: number) => {
    setMapZoom((current) => {
      const next = clamp(current * factor, 1, 8);
      requestAnimationFrame(() => applyMapView(next));
      return next;
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem(storageKey(layoutId));
    const workspace = panelRef.current?.parentElement ?? null;
    const defaultForWorkspace = responsiveDefault(layoutId, workspace, fallbackLayout);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as PanelLayout;
        if ([parsed.x, parsed.y, parsed.width, parsed.height].every(Number.isFinite)) {
          setLayout(clampLayout(parsed, workspace));
        }
      } catch {
        localStorage.removeItem(storageKey(layoutId));
      }
    } else {
      setLayout(clampLayout(defaultForWorkspace, workspace));
    }

    const reset = () => {
      localStorage.removeItem(storageKey(layoutId));
      setLayout(clampLayout(responsiveDefault(layoutId, workspace, fallbackLayout), workspace));
    };
    window.addEventListener("f1-terminal-reset-layout", reset);
    return () => window.removeEventListener("f1-terminal-reset-layout", reset);
  }, [layoutId, fallbackLayout.x, fallbackLayout.y, fallbackLayout.width, fallbackLayout.height]);

  useEffect(() => {
    if (!isTrack || !mapFollow) {
      if (followFrameRef.current !== null) cancelAnimationFrame(followFrameRef.current);
      followFrameRef.current = null;
      return;
    }

    const follow = () => {
      const selected = panelRef.current?.querySelector<SVGGElement>(".trackCar.selected");
      const transform = selected?.getAttribute("transform") ?? "";
      const match = transform.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
      if (match) {
        const center = { x: Number(match[1]), y: Number(match[2]) };
        if (Number.isFinite(center.x) && Number.isFinite(center.y)) applyMapView(mapZoom, center);
      }
      followFrameRef.current = requestAnimationFrame(follow);
    };

    followFrameRef.current = requestAnimationFrame(follow);
    return () => {
      if (followFrameRef.current !== null) cancelAnimationFrame(followFrameRef.current);
      followFrameRef.current = null;
    };
  }, [isTrack, mapFollow, mapZoom]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const active = interactionRef.current;
      if (active) {
        const workspace = panelRef.current?.parentElement ?? null;
        const dx = event.clientX - active.startX;
        const dy = event.clientY - active.startY;
        const next = { ...active.startLayout };

        if (active.kind === "drag") {
          next.x += dx;
          next.y += dy;
        } else {
          const edge = active.edge ?? "se";
          if (edge.includes("e")) next.width += dx;
          if (edge.includes("s")) next.height += dy;
          if (edge.includes("w")) {
            next.x += dx;
            next.width -= dx;
          }
          if (edge.includes("n")) {
            next.y += dy;
            next.height -= dy;
          }
        }
        setLayout(clampLayout(next, workspace));
      }

      const mapPan = mapPanRef.current;
      if (mapPan && isTrack) {
        const svg = panelRef.current?.querySelector<SVGSVGElement>(".trackSvg");
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const unitsX = 1000 / mapZoom;
          const unitsY = 600 / mapZoom;
          const center = {
            x: mapPan.startCenter.x - ((event.clientX - mapPan.startX) / Math.max(1, rect.width)) * unitsX,
            y: mapPan.startCenter.y - ((event.clientY - mapPan.startY) / Math.max(1, rect.height)) * unitsY,
          };
          applyMapView(mapZoom, center);
        }
      }
    };

    const handleUp = () => {
      if (interactionRef.current) {
        interactionRef.current = null;
        setLayout((current) => {
          localStorage.setItem(storageKey(layoutId), JSON.stringify(current));
          return current;
        });
        document.body.classList.remove("panelInteracting");
      }
      if (mapPanRef.current) {
        mapPanRef.current = null;
        setMapPanning(false);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [layoutId, isTrack, mapZoom]);

  const beginInteraction = (
    event: ReactPointerEvent,
    interaction: Omit<Interaction, "startX" | "startY" | "startLayout">,
  ) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (interaction.kind === "drag" && target.closest(".panelActions, button, select, input, a")) return;
    event.preventDefault();
    topZ += 1;
    setZIndex(topZ);
    interactionRef.current = {
      ...interaction,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: layout,
    };
    document.body.classList.add("panelInteracting");
  };

  const handlePanelPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    topZ += 1;
    setZIndex(topZ);
    if (!isTrack || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest(".trackSvg") || target.closest(".trackCar")) return;
    event.preventDefault();
    setMapFollow(false);
    setMapPanning(true);
    mapPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startCenter: { ...mapCenterRef.current },
    };
  };

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!isTrack || !(event.target as HTMLElement).closest(".trackSvg")) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2);
  };

  const style: CSSProperties = {
    left: layout.x,
    top: layout.y,
    width: layout.width,
    height: layout.height,
    zIndex,
  };

  return (
    <section
      ref={panelRef}
      className={`panel floatingPanel ${mapPanning ? "panning" : ""} ${className}`}
      style={style}
      onPointerDown={handlePanelPointerDown}
      onWheel={handleWheel}
    >
      <header className="panelHeader panelDragHandle" onPointerDown={(event) => beginInteraction(event, { kind: "drag" })}>
        <div>
          {kicker && <div className="panelKicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        {(actions || layoutId === "timingPanel") && <div className="panelActions">
          {actions}
          {layoutId === "timingPanel" && <button
            className="layoutResetButton"
            type="button"
            title="Reset all panel positions and sizes"
            onClick={() => window.dispatchEvent(new Event("f1-terminal-reset-layout"))}
          >RESET LAYOUT</button>}
        </div>}
      </header>
      <div className="panelBody">{children}</div>
      {isTrack && <div className="trackControls" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" title="Zoom out" onClick={() => changeZoom(1 / 1.4)}>−</button>
        <span className="trackZoomReadout">{mapZoom.toFixed(1)}×</span>
        <button type="button" title="Zoom in" onClick={() => changeZoom(1.4)}>+</button>
        <button type="button" title="Reset map view" onClick={resetMap}>FIT</button>
        <button
          type="button"
          className={mapFollow ? "active" : ""}
          title="Follow the selected driver"
          onClick={() => setMapFollow((value) => !value)}
        >{mapFollow ? "FOLLOWING" : "FOLLOW"}</button>
      </div>}
      {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeEdge[]).map((edge) => (
        <i
          key={edge}
          className={`panelResize panelResize-${edge}`}
          onPointerDown={(event) => beginInteraction(event, { kind: "resize", edge })}
          aria-hidden="true"
        />
      ))}
    </section>
  );
}
