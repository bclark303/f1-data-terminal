# Video Sync Companion 0.4.5

Connects one selected HTML5 player to explicitly paired F1 Data Terminal tabs at `http://localhost:3000` or `http://127.0.0.1:3000`. All HTTP sync has been removed.

## Install and pair

1. Start the terminal locally, then open it in Chrome or Edge. Trusted top-level terminal tabs on `localhost:3000` / `127.0.0.1:3000` link automatically.
2. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, and load this folder unpacked. Existing users: **Reload** the extension and refresh both terminal and video tabs.
3. With the **F1 TV tab active**, click the extension button. `WAIT` means discovery is running; `OK` means one player is selected and reporting. The extension also opens Chrome's side panel with the local **LIVE** terminal beside the F1 TV player. A **PIN VIDEO** control appears over the selected F1 TV player when browser Picture-in-Picture is available; use it to float the real F1 TV video over the replay terminal without copying or re-hosting the protected stream. If no player appears, initialize playback and refresh the source tab. Clicking the extension again disconnects.
4. For replays, return to the standalone terminal when needed. Start the matching replay and expose the F1 TV controls once; the companion learns the on-screen player time and its offset from the underlying HTML media clock. Scrub F1 TV to the start of the race. The terminal shows the target start time while armed and changes to **SYNCED** automatically when the player reaches that window; after that, any F1 TV seek drives the terminal.

The companion prefers the visible F1 TV player timeline, then Bitmovin UI metadata, and only then the raw HTML media clock. This matters because F1 TV can display a VOD time such as 00:52:48 while the protected media element itself reports a completely different MediaSource timestamp. The terminal follows pause, play, seeks, playback rate, and detected stalls. When automatic replay alignment succeeds, VIDEO LOCK is enabled and the terminal timeline becomes read-only: scrub in F1 TV and the data follows the video. Losing the source pauses the clock. Changing media invalidates the anchor. ±1 / ±0.1 second offset buttons preserve the lock. Turning VIDEO LOCK off restores manual replay controls. Without the companion, MATCH NOW starts the terminal's manual clock.

## Scope and privacy

Only top-level terminal tabs on the exact allowed local origins receive replay video state. They auto-link when loaded; unrelated localhost ports and terminal subframes remain excluded. The integrated side panel embeds the local /live page and does not receive or forward F1 TV media state. Other localhost ports cannot retrieve it. The HTTP endpoint returns 410 and no state. Pairing lasts for the browser session; repeat it after browser restart.

Messages contain a version, random media identity, sequence, effective player playback time, raw HTML media time, clock source, duration, paused/buffering/ended state, playback rate, title (up to 240 characters), timestamp, optional media wall-clock time, and the numeric F1 TV content ID parsed from the selected tab when available. They contain **no URL**, video, audio, screenshot, cookie, credentials, or DRM keys. Page titles may themselves contain personal information, so only pair terminal tabs you trust.

A minimal document-start hook retains weak references to closed shadow roots. Observers, periodic discovery, and playback reporting activate only in the selected source tab. Detached videos are discarded. Each frame continuously ranks its attached video elements by recent clock advancement, playing state, visible size, intrinsic resolution, duration, and whether it belongs to the Bitmovin player. The worker also re-evaluates competing frames instead of permanently holding the first one that happened to report. A substantially stronger long-form race player can therefore replace an advancing placeholder, preview, or secondary video without requiring a reconnect. Source selection and election survive worker suspension. Old and out-of-order samples are rejected.

For videos with edits or ads inserted into the same timeline, match again after the discontinuity. Providers that reuse the same element and source without any detectable media change can require manual rematching. To reselect among multiple players, disconnect and reconnect after the desired player is initialized.

## Development

`shared/video-protocol.js` in the repository is canonical. Run `npm run extension:build` after changing it; CI checks that this folder's generated copy matches. The background worker is an ES module.
