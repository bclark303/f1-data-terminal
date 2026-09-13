const PROBE_SOURCE = "F1_DATA_TERMINAL_VIDEO_PROBE";
const TERMINAL_SOURCE = "F1_DATA_TERMINAL_EXTENSION";
const isTerminal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== PROBE_SOURCE) return;

  if (event.data.found && event.data.state) {
    chrome.runtime.sendMessage({
      type: "F1_VIDEO_STATE",
      state: event.data.state,
    }).catch(() => {
      // Extension context can briefly disappear during navigation/reload.
    });
  } else {
    chrome.runtime.sendMessage({
      type: "F1_VIDEO_STATUS",
      found: false,
      capturedAt: event.data.capturedAt ?? Date.now(),
    }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!isTerminal || message?.type !== "F1_VIDEO_STATE_TO_TERMINAL") return;
  window.postMessage({
    source: TERMINAL_SOURCE,
    state: message.state,
  }, location.origin);
});

if (isTerminal) {
  chrome.runtime.sendMessage({ type: "F1_TERMINAL_READY" }).catch(() => {});
}
