# Video Sync Companion 0.4.1

Connects one selected HTML5 player to explicitly paired F1 Data Terminal tabs at `http://localhost:3000` or `http://127.0.0.1:3000`. All HTTP sync has been removed.

## Install and pair

1. Start the terminal locally, then open it in Chrome or Edge.
2. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, and load this folder unpacked. Existing users: **Reload** the extension and refresh both terminal and video tabs.
3. With the **terminal tab active**, click the extension button. `LINK` confirms pairing. Clicking again unpairs it.
4. With the **F1 TV tab active**, click the extension button. `WAIT` means discovery is running; `OK` means one player is selected and reporting. The extension also opens Chrome's side panel with the local **LIVE** terminal beside the F1 TV player. A **PIN VIDEO** control appears over the selected F1 TV player when browser Picture-in-Picture is available; use it to float the real F1 TV video over the replay terminal without copying or re-hosting the protected stream. If no player appears, initialize playback and refresh the source tab. Clicking the extension again disconnects.
5. For replays, return to the standalone terminal when needed. When automatic sync metadata is available, it anchors itself without any lap selection. Open AUTO/SYNC to see the detected video time and race-start offset. MATCH NOW remains the fallback.

The terminal follows pause, play, seeks, playback rate, and detected stalls. When automatic replay alignment succeeds, VIDEO LOCK is enabled and the terminal timeline becomes read-only: scrub in F1 TV and the data follows the video. Losing the source pauses the clock. Changing media invalidates the anchor. ±1 / ±0.1 second offset buttons preserve the lock. Turning VIDEO LOCK off restores manual replay controls. Without the companion, MATCH NOW starts the terminal's manual clock.

## Scope and privacy

Only paired standalone terminal tabs on exact allowed origins receive replay video state, in the top frame. The integrated side panel embeds the local /live page and does not receive or forward F1 TV media state. Other localhost ports cannot retrieve it. The HTTP endpoint returns 410 and no state. Pairing lasts for the browser session; repeat it after browser restart.

Messages contain a version, random media identity, sequence, playback time, duration, paused/buffering/ended state, playback rate, title (up to 240 characters), and timestamp. They contain **no URL**, video, audio, screenshot, cookie, credentials, or DRM keys. Page titles may themselves contain personal information, so only pair terminal tabs you trust.

A minimal document-start hook retains weak references to closed shadow roots. Observers, periodic discovery, and playback reporting activate only in the selected source tab. Detached videos are discarded. Each frame continuously ranks its attached video elements by recent clock advancement, playing state, and visible size. A stopped pre-roll/placeholder can therefore hand off to the real F1 TV race player without requiring a reconnect. The worker then elects one frame/player and holds it while fresh samples arrive. Source selection and election survive worker suspension. Old and out-of-order samples are rejected.

For videos with edits or ads inserted into the same timeline, match again after the discontinuity. Providers that reuse the same element and source without any detectable media change can require manual rematching. To reselect among multiple players, disconnect and reconnect after the desired player is initialized.

## Development

`shared/video-protocol.js` in the repository is canonical. Run `npm run extension:build` after changing it; CI checks that this folder's generated copy matches. The background worker is an ES module.
