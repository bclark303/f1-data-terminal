(() => {
  const SOURCE = "F1_DATA_TERMINAL_VIDEO_PROBE";
  const tracked = new Set();
  const observedRoots = new WeakSet();
  let lastMissingNotice = 0;

  function addVideo(video) {
    if (video instanceof HTMLVideoElement) tracked.add(video);
  }

  function scan(root) {
    try {
      if (root instanceof HTMLVideoElement) addVideo(root);
      if (!root?.querySelectorAll) return;
      root.querySelectorAll("video").forEach(addVideo);
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) observeRoot(element.shadowRoot);
      });
    } catch {
      // A cross-origin or transient root can reject inspection. Ignore it.
    }
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    scan(root);
    try {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element || node instanceof DocumentFragment) scan(node);
          });
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    } catch {
      // Some transient roots cannot be observed; periodic discovery is a fallback.
    }
  }

  // Keep references to shadow roots even when the page creates them as closed.
  // This runs in the page's MAIN world at document_start so it sees player setup.
  try {
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function patchedAttachShadow(init) {
      const root = originalAttachShadow.call(this, init);
      observeRoot(root);
      return root;
    };
  } catch {
    // If a site locks this prototype down, normal/open-root discovery still works.
  }

  observeRoot(document);

  function visibleArea(video) {
    try {
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      return width * height;
    } catch {
      return 0;
    }
  }

  function selectVideo() {
    // Catch players inserted before observers settled or into open shadow roots.
    scan(document);
    const candidates = [...tracked].filter((video) => {
      try {
        return Number.isFinite(video.currentTime) && (video.isConnected || video.readyState > 0);
      } catch {
        return false;
      }
    });
    if (!candidates.length) return null;

    return candidates
      .map((video) => {
        const area = visibleArea(video);
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const activeBoost = !video.paused && !video.ended ? 1_000_000_000 : 0;
        return { video, score: activeBoost + area * 1000 + duration };
      })
      .sort((a, b) => b.score - a.score)[0]?.video ?? null;
  }

  function emit() {
    const video = selectVideo();
    if (!video) {
      const now = Date.now();
      if (now - lastMissingNotice > 1000) {
        lastMissingNotice = now;
        window.postMessage({ source: SOURCE, found: false, capturedAt: now }, "*");
      }
      return;
    }

    let state;
    try {
      state = {
        currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        paused: video.paused,
        playbackRate: video.playbackRate,
        title: document.title,
        url: location.href,
        capturedAt: Date.now(),
      };
    } catch {
      return;
    }

    window.postMessage({ source: SOURCE, found: true, state }, "*");
  }

  const mediaEvents = ["play", "pause", "seeking", "seeked", "ratechange", "waiting", "playing", "loadedmetadata"];
  for (const eventName of mediaEvents) document.addEventListener(eventName, emit, true);

  setInterval(emit, 250);
  emit();
})();
