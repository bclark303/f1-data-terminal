async function getSourceTabId() {
  const stored = await chrome.storage.session.get("sourceTabId");
  return Number.isInteger(stored.sourceTabId) ? stored.sourceTabId : null;
}

async function setSourceTabId(tabId) {
  if (tabId == null) await chrome.storage.session.remove("sourceTabId");
  else await chrome.storage.session.set({ sourceTabId: tabId });
}

async function updateBadge(tabId, sourceTabId) {
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
  const previous = await getSourceTabId();
  const next = previous === tab.id ? null : tab.id;
  await setSourceTabId(next);

  if (previous && previous !== next) {
    try { await updateBadge(previous, next); } catch { /* tab may have closed */ }
  }
  await updateBadge(tab.id, next);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const sourceTabId = await getSourceTabId();
  if (sourceTabId === tabId) await setSourceTabId(null);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "F1_VIDEO_STATE" || !sender.tab?.id) return;

  void (async () => {
    const sourceTabId = await getSourceTabId();
    if (sender.tab.id !== sourceTabId) return;

    fetch("http://localhost:3000/api/video-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.state),
    }).catch(() => {
      // The terminal may not be running yet. Keep the extension silent and retry
      // on the next video-state sample.
    });
  })();
});
