(() => {
  const roots = new Set();
  const tracked = new Set();
  const identities = new WeakMap();
  const activity = new WeakMap();
  const observers = new Map();
  let enabled = false,
    timer = null,
    chosen = null,
    lastDiscovery = 0,
    sequence = 0;
  let previousTime = null,
    lastAdvance = 0,
    previousSource = "",
    mediaId = "";
  function scan(root) {
    if (root instanceof HTMLVideoElement) tracked.add(root);
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("video").forEach((video) => tracked.add(video));
    if (root.shadowRoot) observe(root.shadowRoot);
    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) observe(element.shadowRoot);
    });
  }
  function observe(root) {
    if (!enabled || observers.has(root)) return;
    scan(root);
    const observer = new MutationObserver((changes) =>
      changes.forEach((change) => change.addedNodes.forEach(scan)),
    );
    observer.observe(root, { childList: true, subtree: true });
    observers.set(root, observer);
  }
  // Minimal early hook: discovery and observers are dormant until the user selects this tab.
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attach.call(this, init);
    roots.add(new WeakRef(root));
    if (enabled) observe(root);
    return root;
  };
  function visibleArea(video) {
    const r = video.getBoundingClientRect();
    return (
      Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
    );
  }
  function updateActivity(video, now) {
    const currentTime = Number(video.currentTime);
    const previous = activity.get(video);
    const advanced =
      Number.isFinite(currentTime) &&
      (!previous || Math.abs(currentTime - previous.time) > 0.005);
    const next = {
      time: currentTime,
      lastAdvance: advanced ? now : previous?.lastAdvance ?? now,
    };
    activity.set(video, next);
    return next;
  }
  function score(video, now) {
    const state = updateActivity(video, now);
    const advancing = now - state.lastAdvance <= 800;
    const duration =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(video.duration, 4 * 60 * 60)
        : 0;
    const intrinsicArea =
      Number.isFinite(video.videoWidth) && Number.isFinite(video.videoHeight)
        ? Math.max(0, video.videoWidth * video.videoHeight)
        : 0;
    const bitmovin =
      typeof video.closest === "function" &&
      video.closest(".bitmovinplayer-container, [class*='bitmovin']") !== null;
    return (
      (advancing && !video.paused && !video.ended ? 2e9 : 0) +
      (!video.paused && !video.ended ? 1e9 : 0) +
      (bitmovin ? 1e9 : 0) +
      visibleArea(video) * 1000 +
      intrinsicArea * 250 +
      duration * 120000
    );
  }
  function wallClockMs(video) {
    try {
      if (typeof video.getStartDate !== "function") return null;
      const start = video.getStartDate();
      const startMs = start instanceof Date ? start.getTime() : Number.NaN;
      if (
        !Number.isFinite(startMs) ||
        startMs < 946684800000 ||
        startMs > 4102444800000 ||
        !Number.isFinite(video.currentTime)
      )
        return null;
      const frameMs = startMs + video.currentTime * 1000;
      return frameMs >= 946684800000 && frameMs <= 4102444800000
        ? frameMs
        : null;
    } catch {
      return null;
    }
  }
  function emit() {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastDiscovery > 5000) {
      scan(document);
      for (const reference of roots) {
        const root = reference.deref();
        if (!root || !root.host.isConnected) {
          roots.delete(reference);
          if (root) {
            observers.get(root)?.disconnect();
            observers.delete(root);
          }
        } else observe(root);
      }
      lastDiscovery = now;
    }
    for (const video of tracked) if (!video.isConnected) tracked.delete(video);
    const candidates = [...tracked].filter(
      (video) => video.readyState > 0 && Number.isFinite(video.currentTime),
    );
    for (const video of candidates) updateActivity(video, now);
    const best = candidates.sort((a, b) => score(b, now) - score(a, now))[0];
    if (!chosen?.isConnected || !tracked.has(chosen)) chosen = best;
    else if (best && best !== chosen) {
      const chosenState = activity.get(chosen);
      const chosenAdvancing =
        chosenState && now - chosenState.lastAdvance <= 1000;
      const bestScore = score(best, now);
      const chosenScore = score(chosen, now);
      // Re-elect when the old player has stopped advancing, or when a clearly
      // stronger active player appears. F1 TV can leave pre-roll/placeholder
      // video elements attached after the real race player starts.
      if (!chosenAdvancing || bestScore > chosenScore + 5e8) chosen = best;
    }
    if (!chosen || !Number.isFinite(chosen.currentTime)) return;
    if (!identities.has(chosen)) identities.set(chosen, crypto.randomUUID());
    // Do not transmit media URLs. Identity changes invalidate anchors without disclosing tokens.
    const source = `${identities.get(chosen)}:${location.href}:${chosen.currentSrc}`;
    if (source !== previousSource) {
      previousSource = source;
      mediaId = crypto.randomUUID();
      sequence = 0;
      previousTime = null;
      lastAdvance = now;
    }
    if (
      previousTime === null ||
      Math.abs(chosen.currentTime - previousTime) > 0.005
    )
      lastAdvance = now;
    previousTime = chosen.currentTime;
    const buffering =
      !chosen.paused &&
      !chosen.ended &&
      (chosen.seeking || chosen.readyState < 3 || now - lastAdvance > 600);
    window.postMessage(
      {
        source: "F1_VIDEO_PROBE",
        score: score(chosen, now),
        state: {
          version: 1,
          sourceId: mediaId,
          sequence: sequence++,
          currentTime: chosen.currentTime,
          duration: Number.isFinite(chosen.duration) ? chosen.duration : null,
          paused: chosen.paused,
          buffering,
          ended: chosen.ended,
          playbackRate: chosen.playbackRate,
          title: document.title.slice(0, 240),
          capturedAt: now,
          wallClockMs: wallClockMs(chosen),
        },
      },
      "*",
    );
  }
  window.addEventListener("F1_DATA_TERMINAL_PIP", () => {
    const reply = (status) =>
      window.dispatchEvent(
        new CustomEvent("F1_DATA_TERMINAL_PIP_RESULT", { detail: status }),
      );
    if (!enabled || !chosen || !chosen.isConnected) {
      reply("NO_VIDEO");
      return;
    }
    if (
      !document.pictureInPictureEnabled ||
      chosen.disablePictureInPicture ||
      typeof chosen.requestPictureInPicture !== "function"
    ) {
      reply("UNAVAILABLE");
      return;
    }
    if (document.pictureInPictureElement === chosen) {
      document
        .exitPictureInPicture()
        .then(() => reply("OFF"))
        .catch(() => reply("BLOCKED"));
      return;
    }
    chosen
      .requestPictureInPicture()
      .then(() => reply("ON"))
      .catch(() => reply("BLOCKED"));
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "F1_PROBE_CONTROL")
      return;
    const next = event.data.enabled === true;
    if (enabled === next) return;
    enabled = next;
    if (enabled) {
      observe(document);
      lastDiscovery = 0;
      timer = setInterval(emit, 250);
      emit();
    } else {
      clearInterval(timer);
      for (const observer of observers.values()) observer.disconnect();
      observers.clear();
      tracked.clear();
      chosen = null;
    }
  });
  for (const name of [
    "play",
    "pause",
    "seeking",
    "seeked",
    "ratechange",
    "waiting",
    "playing",
    "loadedmetadata",
  ])
    document.addEventListener(name, emit, true);
})();
