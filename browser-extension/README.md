# F1 Data Terminal Video Sync Companion

This unpacked Chromium extension sends only HTML5 video playback state to a locally running F1 Data Terminal at `http://localhost:3000`.

It does not capture video, audio, screenshots, DRM keys, cookies, or account credentials. The payload contains only:

- current playback time
- duration
- play/pause state
- playback rate
- page title and URL
- sample timestamp

The probe runs at `document_start` in all frames and tracks video elements created inside open or closed shadow roots. This is specifically intended to cope with modern embedded players such as F1 TV while remaining generic enough for other HTML5 replay services.

## Install in Chrome or Edge

1. Run the terminal locally with `npm run dev`.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository's `browser-extension` folder. If it was already loaded, click **Reload** after pulling new code.
5. Refresh both the F1 TV replay tab and the local terminal tab.
6. Start or pause the replay so the player is fully initialized.
7. Click the **F1 Data Terminal Video Sync** extension button once while the F1 TV tab is active.

The extension badge is diagnostic:

- `WAIT` — tab selected; waiting for the player to initialize
- `NO` — selected tab is reachable, but no HTML5 video element has been detected
- `OK` — video clock detected and being forwarded to the terminal
- no badge — that tab is not selected as the sync source

When the badge reaches `OK`, the terminal replay bar should change from `VIDEO ○` to `VIDEO ●`.

Click the extension button again to disconnect that tab. Clicking it in a different video tab moves the sync source to that tab.

## Synchronize a replay

1. In the terminal click **SYNC**.
2. Choose a lap number that is about to appear on the broadcast.
3. The instant the broadcast lap counter changes to that lap, click **MATCH NOW**.
4. When the companion is connected, the terminal records both the race timestamp and browser-video timestamp and enables **AUTO FOLLOW**.
5. From then on video pause, play, seek and playback-rate changes drive the terminal clock.
6. Use the ±1 s and ±0.1 s controls for fine adjustment if the broadcast graphic itself is slightly delayed from the timing feed.

Manual lap matching works without the extension; the terminal simply continues from the matched race timestamp using its own replay clock.

## Transport

Version 0.2 sends playback state directly from the selected video tab to the local terminal tab through the extension messaging system. It also retains the original localhost HTTP bridge as a fallback. This avoids depending on browser local-network permissions for the normal path.
