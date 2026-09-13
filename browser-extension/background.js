async function getSourceTabId() {
  const stored = await chrome.storage.session.get("sourceTabId");
  return Number.isInteger(stored.sourceTabId) ? stored.sourceTabId : null;
}

async function setSourceTabId(tabId) {
  if (tabId == null) await chrome.storage.session.remove(["sourceTabId", "latestVideoState"]);
  else await chrome.storage.session.set({ sourceTabId: tabId });
}

async function setBadge(tabId, text, color, title) {
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setTitle({ tabId, title });
}

async function updateBadge(tabId, sourceTabId, status = "selected") {
  const active = sourceTabId === tabId;
  if (!active) {
    await setBadge(tabId, "", "#555555", "Use this tab for F1 Data Terminal sync");
    return;
  }

  if (status === "ok") {
    await setBadge(tabId, "OK", "#2f7d4d", "F1 Data Terminal: video detected and syncing");
  } else if (status === "no-video") {
    await setBadge(tabId, "NO", "#9a4f25", "F1 Data Terminal: selected tab, but no video detected");
  } else {
    await setBadge(tabId, "WAIT", "#6a6a6a", "F1 Data Terminal: waiting for video player");
  }
}

async function forwardToTerminal(state) {
  const terminalTabs = await chrome.tabs.query({
    url: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"],
  });
  await Promise.allSettled(terminalTabs.map((tab) => {
    if (!tab.id) return Promise.resolve();
    return chrome.tabs.sendMessage(tab.id, {
      type: "F1_VIDEO_STATE_TO_TERMINAL",
      state,
    });
  }));
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const previous = await getSourceTabId();
  const next = previous === tab.id ? null : tab.id;
  await setSourceTabId(next);

  if (previous && previous !== next) {
    try { await updateBadge(previous, next); } catch { /* tab may have closed */ }
  }
  await updateBadge(tab.id, next, next ? "selected" : "off");
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const sourceTabId = await getSourceTabId();
  if (sourceTabId === tabId) await setSourceTabId(null);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab?.id) return;

  void (async () => {
    const sourceTabId = await getSourceTabId();

    if (message?.type === "F1_TERMINAL_READY") {
      const stored = await chrome.storage.session.get("latestVideoState");
      if (stored.latestVideoState) {
        try {
          await chrome.tabs.sendMessage(sender.tab.id, {
            type: "F1_VIDEO_STATE_TO_TERMINAL",
            state: stored.latestVideoState,
          });
        } catch {
          // Terminal content script may still be initializing.
        }
      }
      return;
    }

    if (sender.tab.id !== sourceTabId) return;

    if (message?.type === "F1_VIDEO_STATUS" && message.found === false) {
      await updateBadge(sender.tab.id, sourceTabId, "no-video");
      return;
    }

    if (message?.type !== "F1_VIDEO_STATE" || !message.state) return;

    const state = {
      ...message.state,
      connected: true,
      receivedAt: Date.now(),
    };

    await chrome.storage.session.set({ latestVideoState: state });
    await updateBadge(sender.tab.id, sourceTabId, "ok");
    await forwardToTerminal(state);

    // Keep the original localhost bridge as a fallback for older terminal tabs.
    fetch("http://localhost:3000/api/video-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.state),
    }).catch(() => {});
  })();
});
