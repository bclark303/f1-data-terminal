"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

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
  return `f1-terminal-panel:${id}:v1`;
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
  const initialLayout = defaultLayout ?? DEFAULTS[keyFromClass(className)] ?? { x: 12, y: 12, width: 420, height: 320 };
  const panelRef = useRef<HTMLElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [layout, setLayout] = useState(initialLayout);
  const [zIndex, setZIndex] = useState(1);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey(layoutId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as PanelLayout;
        if ([parsed.x, parsed.y, parsed.width, parsed.height].every(Number.isFinite)) {
          const workspace = panelRef.current?.parentElement ?? null;
          setLayout(clampLayout(parsed, workspace));
        }
      } catch {
        localStorage.removeItem(storageKey(layoutId));
      }
    }

    const reset = () => {
      localStorage.removeItem(storageKey(layoutId));
      setLayout(initialLayout);
    };
    window.addEventListener("f1-terminal-reset-layout", reset);
    return () => window.removeEventListener("f1-terminal-reset-layout", reset);
  }, [layoutId, initialLayout.x, initialLayout.y, initialLayout.width, initialLayout.height]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const active = interactionRef.current;
      if (!active) return;
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
    };

    const handleUp = () => {
      if (!interactionRef.current) return;
      interactionRef.current = null;
      setLayout((current) => {
        localStorage.setItem(storageKey(layoutId), JSON.stringify(current));
        return current;
      });
      document.body.classList.remove("panelInteracting");
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [layoutId]);

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
      className={`panel floatingPanel ${className}`}
      style={style}
      onPointerDown={() => {
        topZ += 1;
        setZIndex(topZ);
      }}
    >
      <header className="panelHeader panelDragHandle" onPointerDown={(event) => beginInteraction(event, { kind: "drag" })}>
        <div>
          {kicker && <div className="panelKicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        {actions && <div className="panelActions">{actions}</div>}
      </header>
      <div className="panelBody">{children}</div>
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
