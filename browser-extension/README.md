# F1 Data Terminal Video Sync Companion

This unpacked Chromium extension sends only HTML5 video playback state to a locally running F1 Data Terminal at `http://localhost:3000`.

It does not capture video, audio, screenshots, DRM keys, cookies, or account credentials. The payload contains only:

- current playback time
- duration
- play/pause state
- playback rate
- page title and URL
- sample timestamp

## Install in Chrome or Edge

1. Run the terminal locally with `npm run dev`.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select this repository's `browser-extension` folder.
6. Open the browser tab containing the F1 replay.
7. Click the **F1 Data Terminal Video Sync** extension button once. Its badge changes to `SYNC`.
8. In the terminal, the replay bar should change from `VIDEO ○` to `VIDEO ●`.

Click the extension button again to disconnect that tab. Clicking it in a different video tab moves the sync source to that tab.

## Synchronize a replay

1. In the terminal click **SYNC**.
2. Choose a lap number that is about to appear on the broadcast.
3. The instant the broadcast lap counter changes to that lap, click **MATCH NOW**.
4. When the companion is connected, the terminal records both the race timestamp and browser-video timestamp and enables **AUTO FOLLOW**.
5. From then on video pause, play, seek and playback-rate changes drive the terminal clock.
6. Use the ±1 s and ±0.1 s controls for fine adjustment if the broadcast graphic itself is slightly delayed from the timing feed.

Manual lap matching works without the extension; the terminal simply continues from the matched race timestamp using its own replay clock.

## Current limitation

The companion targets a local terminal on port 3000. A future deployed version should use a dedicated local bridge/WebSocket rather than relying on server memory in a serverless deployment.
