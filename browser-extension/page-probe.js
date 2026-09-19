(() => {
  const roots = new Set();
  const tracked = new Set();
  const identities = new WeakMap();
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
  function score(video) {
    const r = video.getBoundingClientRect();
    const area =
      Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return (!video.paused && !video.ended ? 1e9 : 0) + area * 1000;
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
    if (!chosen?.isConnected || !tracked.has(chosen))
      chosen = [...tracked]
        .filter((v) => v.readyState > 0)
        .sort((a, b) => score(b) - score(a))[0];
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
        score: score(chosen),
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
        },
      },
      "*",
    );
  }
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
