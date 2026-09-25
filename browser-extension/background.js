import {
  isTerminalUrl,
  parseVideoState,
  isNewerState,
  STALE_MS,
} from "./video-protocol.js";

function isFormula1VideoTab(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "f1tv.formula1.com" ||
        url.hostname.endsWith(".formula1.com"))
    );
  } catch {
    return false;
  }
}

function f1TvContentId(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/detail\/(\d{6,20})(?:\/|$)/);
    return match?.[1] ?? url.searchParams.get("contentId");
  } catch {
    return null;
  }
}

async function openIntegratedLivePanel(tab) {
  if (!tab?.id || !isFormula1VideoTab(tab.url)) return;
  try {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: "sidepanel.html",
      enabled: true,
    });
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.warn("Integrated live panel:", error?.message ?? error);
  }
}

async function badge(tabId, text, title) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: text === "OK" ? "#2f7d4d" : "#6a6a6a",
    });
    await chrome.action.setTitle({ tabId, title });
  } catch {
    /* Tab closed. */
  }
}
async function deliver(state) {
  const { terminalTabs = [] } =
    await chrome.storage.session.get("terminalTabs");
  await Promise.allSettled(
    terminalTabs.map(async (id) => {
      const tab = await chrome.tabs.get(id);
      if (!isTerminalUrl(tab.url)) return;
      await chrome.tabs.sendMessage(
        id,
        { type: "F1_VIDEO_STATE_TO_TERMINAL", state },
        { frameId: 0 },
      );
    }),
  );
}
async function clearSource() {
  await chrome.storage.session.remove([
    "latestVideoState",
    "elected",
    "candidates",
  ]);
  await deliver(null);
}
async function enable(tabId, enabled) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "F1_PROBE_ENABLE", enabled });
  } catch {
    /* Refresh needed. */
  }
}
// Serialize short storage transactions, never network calls. Survives service worker suspension.
let queue = Promise.resolve();
function serial(task) {
  queue = queue
    .then(task)
    .catch((error) => console.warn("Video sync:", error.message));
}
chrome.action.onClicked.addListener((tab) =>
  serial(async () => {
    if (!tab.id) return;
    if (isTerminalUrl(tab.url)) {
      const { terminalTabs = [] } =
        await chrome.storage.session.get("terminalTabs");
      const paired = terminalTabs.includes(tab.id);
      await chrome.storage.session.set({
        terminalTabs: paired
          ? terminalTabs.filter((id) => id !== tab.id)
          : [...terminalTabs, tab.id],
      });
      await chrome.tabs
        .sendMessage(
          tab.id,
          { type: "F1_VIDEO_STATE_TO_TERMINAL", state: null },
          { frameId: 0 },
        )
        .catch(() => {});
      await badge(
        tab.id,
        paired ? "" : "LINK",
        paired ? "Pair this terminal" : "Terminal paired; select a video tab",
      );
      return;
    }
    const { sourceTabId } = await chrome.storage.session.get("sourceTabId");
    if (sourceTabId) {
      await enable(sourceTabId, false);
      await badge(sourceTabId, "", "Use this tab for video sync");
    }
    await clearSource();
    if (sourceTabId === tab.id) {
      await chrome.storage.session.remove("sourceTabId");
      return;
    }
    await chrome.storage.session.set({ sourceTabId: tab.id });
    await enable(tab.id, true);
    await badge(tab.id, "WAIT", "Discovering a video player");
    await openIntegratedLivePanel(tab);
  }),
);
chrome.tabs.onRemoved.addListener((id) =>
  serial(async () => {
    const { sourceTabId, terminalTabs = [] } = await chrome.storage.session.get(
      ["sourceTabId", "terminalTabs"],
    );
    await chrome.storage.session.set({
      terminalTabs: terminalTabs.filter((tab) => tab !== id),
    });
    if (sourceTabId === id) {
      await chrome.storage.session.remove("sourceTabId");
      await clearSource();
    }
  }),
);
chrome.tabs.onUpdated.addListener((id, change) => {
  if (!change.url && change.status !== "loading") return;
  serial(async () => {
    const { sourceTabId, terminalTabs = [] } = await chrome.storage.session.get(
      ["sourceTabId", "terminalTabs"],
    );
    if (id === sourceTabId) await clearSource();
    if (change.url && !isTerminalUrl(change.url))
      await chrome.storage.session.set({
        terminalTabs: terminalTabs.filter((tab) => tab !== id),
      });
  });
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab?.id) return;
  serial(async () => {
    const {
      sourceTabId,
      terminalTabs = [],
      latestVideoState,
      elected,
      candidates = {},
    } = await chrome.storage.session.get([
      "sourceTabId",
      "terminalTabs",
      "latestVideoState",
      "elected",
      "candidates",
    ]);
    if (message?.type === "F1_READY") {
      if (sender.tab.id === sourceTabId)
        await chrome.tabs.sendMessage(
          sender.tab.id,
          { type: "F1_PROBE_ENABLE", enabled: true },
          { frameId: sender.frameId },
        );
      if (sender.frameId === 0 && isTerminalUrl(sender.url)) {
        if (!terminalTabs.includes(sender.tab.id)) {
          await chrome.storage.session.set({
            terminalTabs: [...terminalTabs, sender.tab.id],
          });
          await badge(
            sender.tab.id,
            "LINK",
            "Terminal linked automatically; select an F1 TV video tab",
          );
        }
        await chrome.tabs.sendMessage(
          sender.tab.id,
          {
            type: "F1_VIDEO_STATE_TO_TERMINAL",
            state: parseVideoState(latestVideoState),
          },
          { frameId: 0 },
        );
      }
      return;
    }
    if (sender.tab.id !== sourceTabId || message?.type !== "F1_VIDEO_STATE")
      return;
    const state = parseVideoState(message.state);
    if (!state) return;
    const key = `${sender.frameId}:${state.sourceId}`;
    const now = Date.now();
    const score = Number.isFinite(message.score)
      ? Math.max(0, Math.min(1e12, message.score))
      : 0;
    const fresh = Object.fromEntries(
      Object.entries(candidates).filter(([, candidate]) => now - candidate.at < 1500),
    );
    fresh[key] = {
      at: now,
      first: candidates[key]?.first ?? now,
      score,
    };

    const electedCandidate = elected?.key ? fresh[elected.key] : null;
    const currentFresh =
      electedCandidate && now - electedCandidate.at <= STALE_MS;
    const winnerEntry = Object.entries(fresh).sort(
      (a, b) => b[1].score - a[1].score,
    )[0];
    const winnerKey = winnerEntry?.[0] ?? key;
    const winner = winnerEntry?.[1] ?? fresh[key];
    let electedKey = elected?.key ?? null;

    if (!currentFresh) {
      const oldest = Math.min(...Object.values(fresh).map((candidate) => candidate.first));
      if (now - oldest < 350) {
        await chrome.storage.session.set({ candidates: fresh });
        return;
      }
      electedKey = winnerKey;
    } else if (
      winnerKey !== electedKey &&
      now - winner.first >= 600 &&
      winner.score > electedCandidate.score + 3e8
    ) {
      // Cross-frame handoff: a long-form / visibly stronger player can replace
      // a stale placeholder or secondary F1 TV video even while both advance.
      electedKey = winnerKey;
    }

    await chrome.storage.session.set({ candidates: fresh });
    if (key !== electedKey) return;

    const sourceTab = await chrome.tabs.get(sourceTabId);
    const identified = {
      ...state,
      contentId: f1TvContentId(sourceTab.url),
      sourceId: `${sourceTabId}:${sender.frameId}:${state.sourceId}`,
    };
    if (
      latestVideoState?.sourceId === identified.sourceId &&
      !isNewerState(latestVideoState ?? null, identified)
    )
      return;
    await chrome.storage.session.set({
      elected: { key, at: now, score },
      latestVideoState: identified,
    });
    await badge(
      sourceTabId,
      "OK",
      `Video selected and syncing${identified.contentId ? ` · content ${identified.contentId}` : ""}`,
    );
    await deliver(identified);
  });
});
