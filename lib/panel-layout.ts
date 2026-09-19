export type PanelLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function clampLayout(
  layout: PanelLayout,
  bounds: { width: number; height: number },
): PanelLayout {
  const width = Math.min(
    Math.max(280, layout.width),
    Math.max(280, bounds.width),
  );
  const height = Math.min(
    Math.max(220, layout.height),
    Math.max(220, bounds.height),
  );
  return {
    x: Math.min(Math.max(0, layout.x), Math.max(0, bounds.width - width)),
    y: Math.min(Math.max(0, layout.y), Math.max(0, bounds.height - height)),
    width,
    height,
  };
}
export function defaultLayout(id: string, width: number): PanelLayout {
  if (width < 1100) {
    const left = Math.max(360, (width - 36) * 0.55),
      right = Math.max(280, width - left - 36);
    const compact: Record<string, PanelLayout> = {
      timingPanel: { x: 12, y: 12, width: left, height: 742 },
      driverPanel: { x: left + 24, y: 12, width: right, height: 365 },
      trackPanel: { x: left + 24, y: 389, width: right, height: 365 },
      controlPanel: { x: 12, y: 766, width: left, height: 365 },
      weatherPanel: { x: left + 24, y: 766, width: right, height: 365 },
    };
    if (compact[id]) return compact[id];
  }
  const left = Math.max(360, Math.min(560, width * 0.39));
  const right = Math.max(280, (width - left - 48) / 2);
  const layouts: Record<string, PanelLayout> = {
    timingPanel: { x: 12, y: 12, width: left, height: 742 },
    driverPanel: { x: left + 24, y: 12, width: right, height: 365 },
    trackPanel: { x: left + right + 36, y: 12, width: right, height: 365 },
    controlPanel: { x: left + 24, y: 389, width: right, height: 365 },
    weatherPanel: { x: left + right + 36, y: 389, width: right, height: 365 },
  };
  return layouts[id] ?? { x: 12, y: 12, width: 420, height: 320 };
}
