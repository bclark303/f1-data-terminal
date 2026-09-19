"use client";
import { useEffect, useRef, useState } from "react";
type Point = { x: number; y: number };
export function TrackViewport({
  selected,
  children,
}: {
  selected: Point | null;
  children: React.ReactNode;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [follow, setFollow] = useState(false);
  const [center, setCenter] = useState<Point>({ x: 500, y: 300 });
  const drag = useRef<{
    clientX: number;
    clientY: number;
    center: Point;
    scale: number;
  } | null>(null);
  const width = 1000 / zoom,
    height = 600 / zoom;
  const target = follow && selected ? selected : center;
  const x = Math.max(0, Math.min(1000 - width, target.x - width / 2));
  const y = Math.max(0, Math.min(600 - height, target.y - height / 2));
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) =>
        Math.max(1, Math.min(8, current * (event.deltaY < 0 ? 1.2 : 1 / 1.2))),
      );
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, []);
  return (
    <>
      <svg
        ref={ref}
        className="trackSvg"
        viewBox={`${x} ${y} ${width} ${height}`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const dx =
            event.key === "ArrowLeft"
              ? -25
              : event.key === "ArrowRight"
                ? 25
                : 0;
          const dy =
            event.key === "ArrowUp" ? -25 : event.key === "ArrowDown" ? 25 : 0;
          if (!dx && !dy) return;
          event.preventDefault();
          setFollow(false);
          setCenter({ x: target.x + dx / zoom, y: target.y + dy / zoom });
        }}
        role="group"
        aria-label="Circuit map with driver positions. Arrow keys pan."
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as Element).closest(".trackCar")
          )
            return;
          event.preventDefault();
          setFollow(false);
          const initial = { x: x + width / 2, y: y + height / 2 };
          setCenter(initial);
          drag.current = {
            clientX: event.clientX,
            clientY: event.clientY,
            center: initial,
            scale: ref.current?.getScreenCTM()?.a ?? 1,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (active)
            setCenter({
              x:
                active.center.x -
                (event.clientX - active.clientX) / active.scale,
              y:
                active.center.y -
                (event.clientY - active.clientY) / active.scale,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {children}
      </svg>
      <div className="trackControls">
        <button
          aria-label="Zoom out"
          onClick={() => setZoom((value) => Math.max(1, value / 1.4))}
        >
          −
        </button>
        <span>{zoom.toFixed(1)}×</span>
        <button
          aria-label="Zoom in"
          onClick={() => setZoom((value) => Math.min(8, value * 1.4))}
        >
          +
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setCenter({ x: 500, y: 300 });
            setFollow(false);
          }}
        >
          FIT
        </button>
        <button
          aria-pressed={follow}
          onClick={() => setFollow((value) => !value)}
        >
          {follow ? "FOLLOWING" : "FOLLOW"}
        </button>
      </div>
    </>
  );
}
