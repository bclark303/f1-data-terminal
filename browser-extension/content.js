const terminal =
  window === window.top &&
  ["http://localhost:3000", "http://127.0.0.1:3000"].includes(location.origin);
let enabled = false;
window.addEventListener("message", (event) => {
  if (
    !enabled ||
    event.source !== window ||
    event.data?.source !== "F1_VIDEO_PROBE"
  )
    return;
  chrome.runtime
    .sendMessage({
      type: "F1_VIDEO_STATE",
      state: event.data.state,
      score: event.data.score,
    })
    .catch(() => {});
});
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "F1_PROBE_ENABLE") {
    enabled = message.enabled === true;
    window.postMessage(
      { source: "F1_PROBE_CONTROL", enabled },
      location.origin === "null" ? "*" : location.origin,
    );
  }
  if (terminal && message?.type === "F1_VIDEO_STATE_TO_TERMINAL") {
    window.postMessage(
      { source: "F1_DATA_TERMINAL_EXTENSION", state: message.state },
      location.origin,
    );
  }
});
chrome.runtime.sendMessage({ type: "F1_READY" }).catch(() => {});
