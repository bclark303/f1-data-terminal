const terminal =
  window === window.top &&
  ["http://localhost:3000", "http://127.0.0.1:3000"].includes(location.origin);
const formula1Page =
  location.protocol === "https:" &&
  (location.hostname === "f1tv.formula1.com" ||
    location.hostname.endsWith(".formula1.com"));

let enabled = false;
let pipHost = null;
let pipButton = null;

function removePipControl() {
  pipHost?.remove();
  pipHost = null;
  pipButton = null;
}

function ensurePipControl() {
  if (!enabled || terminal || !formula1Page || pipHost) return;
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.right = "12px";
  host.style.bottom = "12px";
  host.style.zIndex = "2147483647";
  host.style.all = "initial";
  const shadow = host.attachShadow({ mode: "closed" });
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "PIN VIDEO";
  button.title = "Float the selected F1 TV video over the Data Terminal";
  button.style.cssText = [
    "all:initial",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "height:30px",
    "padding:0 10px",
    "border:1px solid #5a6876",
    "border-radius:4px",
    "background:rgba(7,10,14,.94)",
    "color:#e8eef4",
    "font:800 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
    "letter-spacing:.08em",
    "cursor:pointer",
    "box-shadow:0 5px 18px rgba(0,0,0,.35)",
  ].join(";");
  button.addEventListener("click", () => {
    button.textContent = "OPENING…";
    window.dispatchEvent(new CustomEvent("F1_DATA_TERMINAL_PIP"));
  });
  shadow.append(button);
  document.documentElement.append(host);
  pipHost = host;
  pipButton = button;
}

window.addEventListener("F1_DATA_TERMINAL_PIP_RESULT", (event) => {
  if (!pipButton) return;
  const status = event.detail;
  pipButton.textContent =
    status === "ON"
      ? "VIDEO PINNED"
      : status === "OFF"
        ? "PIN VIDEO"
        : status === "NO_VIDEO"
          ? "NO VIDEO"
          : "PIP UNAVAILABLE";
  if (status !== "ON" && status !== "OFF")
    setTimeout(() => {
      if (pipButton) pipButton.textContent = "PIN VIDEO";
    }, 1800);
});

window.addEventListener("message", (event) => {
  if (
    !enabled ||
    event.source !== window ||
    event.data?.source !== "F1_VIDEO_PROBE"
  )
    return;
  ensurePipControl();
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
    if (!enabled) removePipControl();
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
