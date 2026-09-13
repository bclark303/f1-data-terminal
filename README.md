# F1 Data Terminal

A replay-first Formula 1 timing, telemetry, race-control and virtual-track terminal built with Next.js and historical OpenF1 data.

## Current milestone

V0 foundation:

- 2025 Canadian Grand Prix replay target
- shared replay clock with play/pause, seek, speed and manual sync nudging
- timing/classification view
- globally selected driver/car view
- race-control event feed with click-to-jump
- track/venue/weather view
- virtual-track panel shell (high-rate XY position data will be loaded in time chunks rather than downloading an entire race at startup)
- OpenF1 historical data adapter

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Architecture direction

The app uses one replay clock shared by every panel. Browser-video synchronization will connect to that clock rather than individual views. The next stages are data caching/indexing, telemetry traces, accurate circuit geometry, lap-based manual synchronization, and a Chromium browser companion for replay auto-sync.
