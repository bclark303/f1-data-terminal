"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampLayout,
  defaultLayout,
  type PanelLayout,
} from "@/lib/panel-layout";
export type { PanelLayout } from "@/lib/panel-layout";
let topZ = 1;
type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
function read(id: string) {
  try {
    const value = JSON.parse(
      localStorage.getItem(`f1-panel:${id}:v3`) ?? "null",
    );
    return value &&
      [value.x, value.y, value.width, value.height].every(Number.isFinite)
      ? (value as PanelLayout)
      : null;
  } catch {
    return null;
  }
}
function save(id: string, value: PanelLayout | null) {
  try {
    if (value) localStorage.setItem(`f1-panel:${id}:v3`, JSON.stringify(value));
    else localStorage.removeItem(`f1-panel:${id}:v3`);
  } catch {
    /* Layout persistence is optional. */
  }
}
export function Panel({
  id,
  title,
  kicker,
  actions,
  className = "",
  children,
}: {
  id: string;
  title: string;
  kicker?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const interaction = useRef<{
    x: number;
    y: number;
    layout: PanelLayout;
    edge?: Edge;
  } | null>(null);
  const fallback = useMemo(() => defaultLayout(id, 1448), [id]);
  const [layout, setLayout] = useState(fallback);
  const [z, setZ] = useState(1);
  const current = useRef(layout);
  useEffect(() => {
    current.current = layout;
  }, [layout]);
  useEffect(() => {
    const workspace = ref.current?.parentElement;
    if (!workspace) return;
    const bounds = () => ({
      width: workspace.clientWidth,
      height: workspace.clientHeight,
    });
    const initial = read(id) ?? defaultLayout(id, bounds().width);
    const update = (value: PanelLayout) => {
      const next = clampLayout(value, bounds());
      current.current = next;
      setLayout(next);
    };
    update(initial);
    const reset = () => {
      save(id, null);
      update(defaultLayout(id, bounds().width));
    };
    const observer = new ResizeObserver(() => {
      if (window.innerWidth <= 900) return;
      update(current.current);
    });
    observer.observe(workspace);
    window.addEventListener("f1-terminal-reset-layout", reset);
    return () => {
      observer.disconnect();
      window.removeEventListener("f1-terminal-reset-layout", reset);
    };
  }, [id]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = interaction.current,
        workspace = ref.current?.parentElement;
      if (!active || !workspace) return;
      const next = { ...active.layout },
        dx = event.clientX - active.x,
        dy = event.clientY - active.y;
      if (!active.edge) {
        next.x += dx;
        next.y += dy;
      } else {
        if (active.edge.includes("e")) next.width += dx;
        if (active.edge.includes("s")) next.height += dy;
        if (active.edge.includes("w")) {
          const width = Math.max(280, next.width - dx);
          next.x += next.width - width;
          next.width = width;
        }
        if (active.edge.includes("n")) {
          const height = Math.max(220, next.height - dy);
          next.y += next.height - height;
          next.height = height;
        }
      }
      current.current = clampLayout(next, {
        width: workspace.clientWidth,
        height: workspace.clientHeight,
      });
      setLayout(current.current);
    };
    const finish = () => {
      if (interaction.current) save(id, current.current);
      interaction.current = null;
      document.body.classList.remove("panelInteracting");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      finish();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, [id]);
  function begin(event: ReactPointerEvent, edge?: Edge) {
    if (
      window.innerWidth <= 900 ||
      event.button !== 0 ||
      (!edge && (event.target as Element).closest("button,select,input,a"))
    )
      return;
    event.preventDefault();
    interaction.current = {
      x: event.clientX,
      y: event.clientY,
      layout: current.current,
      edge,
    };
    document.body.classList.add("panelInteracting");
  }
  return (
    <section
      ref={ref}
      className={`panel floatingPanel ${className}`}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
        zIndex: z,
      }}
      onPointerDown={() => setZ(++topZ)}
      aria-label={title}
    >
      <header
        className="panelHeader panelDragHandle"
        onPointerDown={(event) => begin(event)}
      >
        <div
          tabIndex={0}
          role="group"
          aria-label={`${title} layout. Arrow keys move; Shift and arrows resize.`}
          onKeyDown={(event) => {
            const dx =
                event.key === "ArrowLeft"
                  ? -10
                  : event.key === "ArrowRight"
                    ? 10
                    : 0,
              dy =
                event.key === "ArrowUp"
                  ? -10
                  : event.key === "ArrowDown"
                    ? 10
                    : 0;
            const workspace = ref.current?.parentElement;
            if ((!dx && !dy) || !workspace || window.innerWidth <= 900) return;
            event.preventDefault();
            const next = { ...current.current };
            if (event.shiftKey) {
              next.width += dx;
              next.height += dy;
            } else {
              next.x += dx;
              next.y += dy;
            }
            current.current = clampLayout(next, {
              width: workspace.clientWidth,
              height: workspace.clientHeight,
            });
            setLayout(current.current);
            save(id, current.current);
          }}
        >
          {kicker && <div className="panelKicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        <div className="panelActions">{actions}</div>
      </header>
      <div className="panelBody">{children}</div>
      {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as Edge[]).map((edge) => (
        <i
          key={edge}
          aria-hidden="true"
          className={`panelResize panelResize-${edge}`}
          onPointerDown={(event) => begin(event, edge)}
        />
      ))}
    </section>
  );
}
