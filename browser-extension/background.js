let sourceTabId = null;

async function updateBadge(tabId) {
  const active = sourceTabId === tabId;
  await chrome.action.setBadgeText({ tabId, text: active ? "SYNC" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: active ? "#2f7d4d" : "#555555" });
  await chrome.action.setTitle({
    tabId,
    title: active ? "Disconnect this tab from F1 Data Terminal" : "Use this tab for F1 Data Terminal sync",
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const previous = sourceTabId;
  sourceTabId = sourceTabId === tab.id ? null : tab.id;

  if (previous && previous !== sourceTabId) {
    try { await updateBadge(previous); } catch { /* tab may have closed */ }
  }
  await updateBadge(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sourceTabId === tabId) sourceTabId = null;
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "F1_VIDEO_STATE") return;
  if (!sender.tab?.id || sender.tab.id !== sourceTabId) return;

  fetch("http://localhost:3000/api/video-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.state),
  }).catch(() => {
    // The terminal may not be running yet. Keep the extension silent and retry
    // on the next video-state sample.
  });
});
