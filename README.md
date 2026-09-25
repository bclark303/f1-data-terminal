# F1 Data Terminal

A local Formula 1 timing and telemetry companion with two modes: historical replay using OpenF1, and a best-effort **LIVE** terminal driven directly by Formula 1's public live-timing stream. The replay selector exposes completed OpenF1 race sessions from **2023 onward**, while keeping the 2025 Canadian Grand Prix as the default baseline.

## Run locally

Use Node.js 22.12+ (22 or 24) and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For normal use, `npm run build && npm start` runs a production build. Both commands bind to **127.0.0.1**. This version supports one local server process and one browser profile's selected video source; it is not a multi-user or serverless service. No account or API key is needed for historical OpenF1 data.

## Replay behaviour

- Choose any completed historical race exposed by OpenF1 from 2023 onward. The selected session is stored in the URL (`?session=...`), so reloads and shared local links preserve the race.
- One clock controls timing, telemetry, race control, weather, and the virtual track.
- LAST and BEST show **completed** laps. The current lap is tracked separately. Seeking backward removes results that had not happened yet.
- Race-control clicks jump five seconds before the event and disengage video follow.
- Telemetry and measured XY positions become unavailable after 1.5 seconds without samples. Intervals expire after 15 seconds. Weather is held until the next observation.
- Brake data is an on/off signal, not measured pedal pressure. Provider pedal sentinel values above 100 (observed: 104) are represented as unknown.
- G loads are estimates from speed and XY heading, not accelerometer readings. Stale, poorly aligned, or implausible values are rejected. The short trailing filter introduces smoothing delay.
- The circuit is reconstructed from one recorded clean lap. **Solid markers use available measured XY** (selected driver and the geometry driver). **Dashed markers estimate progress from the previous completed lap**. Estimates are hidden once that reference lap duration is exceeded and are unavailable on lap one. They cannot accurately represent pit stops, safety cars, or overtakes. Loading a driver makes their XY available; a full-field measured tracking mode is not included.

## Integrated live mode

Open **/live** for the standalone live terminal. It connects through the local Next server to Formula 1's SignalR Core timing stream and consumes DriverList, TimingData, TimingAppData, RaceControlMessages, WeatherData, TrackStatus, LapCount, SessionInfo/Status, and CarData telemetry. The transport is anonymous and unofficial; Formula 1 can change it or restrict individual feeds without notice, so missing feeds are shown as unavailable rather than inferred.

Browser companion **0.4** adds Chrome/Edge Side Panel integration. With the local server running, selecting an F1 TV tab with the extension opens the live terminal beside the official F1 TV player. The video remains entirely inside F1 TV: the terminal does not proxy video/audio, inspect DRM, or receive F1 TV credentials.

## Video companion

See [browser-extension/README.md](browser-extension/README.md). Version 0.3 requires explicitly pairing the terminal before selecting the video tab. The old HTTP bridge is retired and returns 410; it stores no playback metadata.

When a paired video source appears, the terminal now attempts **automatic replay alignment**. It requests the selected session's public, curated F1 TV race-start offset from MultiViewer's sync metadata API and anchors that video timestamp to OpenF1's first Lap 1 timestamp. No F1 TV URL, account data, cookies, video, audio, screenshot, or DRM information is sent to the lookup service; only the public OpenF1 meeting/session identifiers are used. Successful auto-sync follows pause, seek, speed, and stalls immediately.

MATCH NOW remains the fallback when automatic metadata is unavailable or a particular replay has been edited differently. Manual replay controls disengage follow without destroying the anchor; fine offset buttons preserve follow. Clearing an automatic anchor does not immediately recreate it for the same selected video source. Reloading/changing the race or selecting a new video source allows automatic matching again.

For a cut/edited broadcast, match again after each discontinuity. The companion detects HTML5 media state, not broadcast content, so it cannot itself verify that the selected F1 TV replay is the same race selected in the terminal. Multiple frames are supported, but one elected player remains authoritative until it stops reporting. To reselect a player, disconnect and reconnect the source tab.

## Architecture and data policy

- `app/page.tsx`: essential session/driver/lap loading; optional datasets fail independently with a retry control.
- `lib/sessions.ts`: completed historical race catalogue and proxy bounds. It filters OpenF1 race sessions to 2023 onward and excludes the live-session grace window. Providers are keyed by session to reset clock, driver selection, and anchors.
- `lib/openf1.ts`, `request-scheduler.ts`, `disk-cache.ts`: schema-validated ingestion, single-flight requests, 15-second network/body deadline, bounded retry and queue (newest interactive driver requests first), 400 ms request spacing and 30 requests/minute. Rate limiting is process-local; multiple replicas require a shared limiter.
- Whole-driver high-rate datasets are ingested once and served from a persistent cache. The server retains up to 32 datasets / approximately 64 MiB of serialized text in memory. Individual downloads are limited to 20 MiB. Disk cache is capped at 256 MiB, with a 24-hour TTL and atomic writes. Set `F1_CACHE_DIR` to choose its location (default `.cache/openf1-v1`). Read-only disk failures degrade to memory caching. Size budgets describe serialized text, not total JavaScript heap use.
- Client cache: 12 datasets / approximately 48 MiB of serialized text, one-hour TTL. Shared downloads are canceled when no consumers remain; already-running shared server ingestion may finish. Error controls explicitly retry the same selection.
- `lib/replay-index.ts`: sorted numeric time indexes, bounded window lookup, completion-aware lap summaries, and position quality rules. No per-tick full telemetry scans.
- `lib/replay-state.ts`: pure clock/follow state machine. `shared/video-protocol.js` validates both sides of extension messaging; `npm run extension:build` generates the extension copy.
- `lib/auto-sync.ts` and `/api/auto-sync`: bounded, best-effort lookup of public MultiViewer session-start metadata used to align the F1 TV video clock automatically. Failure degrades to manual lap matching.
- `lib/live-timing.ts` and `/api/live-timing`: pure live-feed reducer/selectors plus a Node-only SignalR-to-SSE bridge for Formula 1's anonymous timing stream. Compressed car telemetry is inflated server-side and forwarded only to the local browser.
- `components/panel.tsx`: only window layout, persistence, and interaction. `track-viewport.tsx` owns camera pan/zoom/follow without DOM queries into another component.

The source can access its own page-world probe messages; treat them as untrusted media metadata. Validation prevents malformed clocks, and the extension never forwards from unselected tabs. Terminal pairing and exact-origin checks isolate normal unrelated local applications. Pairing is browser-session scoped; pair again after restarting the browser. No full URLs, video/audio, cookies, screenshots, or DRM information are transmitted.

## Layout and accessibility

Drag panel headers or resize their edges. Focus a panel title and use arrow keys to move it; Shift+arrows resize. RESET LAYOUT restores defaults. Browser resizing keeps panels reachable. Narrow screens use stacked panels. Map zoom buttons and driver selection work with the keyboard; dragging pans the map. Storage failure only disables persistence.

## Verification

```sh
npm run extension:check
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests cover replay completion boundaries, rewind, stale samples, numeric estimates, sync ownership/lifecycle, exact-origin pairing, competing frames, protocol validation, bounded caches, rate limits, and API validation. Browser tests seed synthetic race datasets in a temporary cache and exercise the actual production server; they do not require OpenF1 or F1 TV. Run them with port 3000 free to avoid connecting to your normal terminal. Live-mode browser tests use synthetic SSE records and do not contact Formula 1. No automated test asserts F1 TV's current player internals, Formula 1's live endpoint availability, or DRM behaviour.

CI installs the committed lockfile with `npm ci`, runs these gates, and retains failure traces. Dependency updates are checked weekly.
