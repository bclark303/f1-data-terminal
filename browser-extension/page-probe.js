(() => {
  const roots = new Set();
  const tracked = new Set();
  const identities = new WeakMap();
  const activity = new WeakMap();
  const playerTimelineOffsets = new WeakMap();
  const visibleTimelineOffsets = new WeakMap();
  const visibleTimelineScans = new WeakMap();
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
  function parseDisplayedClock(value) {
    const text = String(value ?? "").trim();
    let match = text.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
    if (match) {
      const seconds =
        Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      return seconds <= 8 * 60 * 60 ? seconds : null;
    }
    match = text.match(/^(\d{1,3}):([0-5]\d)$/);
    if (!match) return null;
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    return seconds <= 8 * 60 * 60 ? seconds : null;
  }

  function visibleClockElement(element) {
    if (!(element instanceof Element) || !element.isConnected) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return null;
    const style = getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity || "1") < 0.05
    )
      return null;
    return rect;
  }

  function f1TvDisplayedClock(video) {
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width < 120 || videoRect.height < 80) return null;

    const scopes = [];
    let ancestor = video.parentElement;
    for (let depth = 0; ancestor && depth < 7; depth += 1) {
      scopes.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    try {
      const root = video.getRootNode?.();
      if (root?.querySelectorAll) scopes.push(root);
    } catch {
      /* Ignore inaccessible roots. */
    }
    scopes.push(document);

    const seen = new Set();
    let best = null;
    for (const scope of scopes) {
      if (!scope?.querySelectorAll || seen.has(scope)) continue;
      seen.add(scope);
      let elements;
      try {
        elements = scope.querySelectorAll(
          "time,span,[role='timer'],[class*='time' i],[data-testid*='time' i],div",
        );
      } catch {
        continue;
      }
      for (const element of elements) {
        if (element.childElementCount > 1) continue;
        const text = element.textContent?.trim() ?? "";
        if (text.length < 4 || text.length > 8) continue;
        const seconds = parseDisplayedClock(text);
        if (seconds == null) continue;
        const rect = visibleClockElement(element);
        if (!rect) continue;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const withinX =
          centerX >= videoRect.left - 80 && centerX <= videoRect.right + 80;
        const withinY =
          centerY >= videoRect.top - 30 && centerY <= videoRect.bottom + 100;
        if (!withinX || !withinY) continue;

        const vertical =
          (centerY - videoRect.top) / Math.max(1, videoRect.height);
        const fromLeft = Math.abs(centerX - videoRect.left);
        const classHint =
          /time|progress|control|seek/i.test(
            `${element.className ?? ""} ${element.getAttribute("aria-label") ?? ""}`,
          )
            ? 200000
            : 0;
        const score =
          1000000 +
          classHint +
          (vertical >= 0.55 ? 400000 : 0) +
          (text.split(":").length === 3 ? 100000 : 0) -
          fromLeft * 200 -
          Math.abs(0.88 - vertical) * 100000;

        if (!best || score > best.score)
          best = { seconds, text, score };
      }
    }
    return best;
  }

  function f1TvUiTimeline(video) {
    const raw = Number(video.currentTime);
    if (!Number.isFinite(raw)) return null;
    const previous = visibleTimelineOffsets.get(video);
    const now = Date.now();
    const lastScan = visibleTimelineScans.get(video) ?? 0;
    const shouldScan =
      !previous || video.seeking || now - lastScan >= 1000;

    if (shouldScan) {
      visibleTimelineScans.set(video, now);
      const displayed = f1TvDisplayedClock(video);
      if (displayed) {
        const offset = displayed.seconds - Math.floor(raw);
        if (Number.isFinite(offset) && Math.abs(offset) <= 8 * 60 * 60) {
          const next = {
            offset,
            displayedTime: displayed.seconds,
            displayedText: displayed.text,
            detectedAt: now,
          };
          visibleTimelineOffsets.set(video, next);
          return {
            currentTime: Math.max(0, raw + offset),
            duration: Number.isFinite(video.duration) ? video.duration : null,
            displayedTime: displayed.seconds,
          };
        }
      }
    }

    if (!previous || !Number.isFinite(previous.offset)) return null;
    return {
      currentTime: Math.max(0, raw + previous.offset),
      duration: Number.isFinite(video.duration) ? video.duration : null,
      displayedTime: previous.displayedTime,
    };
  }

  function bitmovinTimeline(video) {
    const raw = Number(video.currentTime);
    const scopes = [];
    try {
      const container =
        typeof video.closest === "function"
          ? video.closest(".bitmovinplayer-container")
          : null;
      if (container) scopes.push(container);
    } catch {
      /* Ignore malformed host-page DOM. */
    }
    try {
      const root = video.getRootNode?.();
      if (root?.querySelectorAll) scopes.push(root);
    } catch {
      /* Ignore inaccessible roots. */
    }
    if (!scopes.includes(document)) scopes.push(document);

    for (const scope of scopes) {
      let candidates = [];
      try {
        candidates = [
          ...scope.querySelectorAll(
            ".bmpui-ui-seekbar[aria-valuenow][aria-valuemax]",
          ),
        ];
      } catch {
        continue;
      }
      for (const seekbar of candidates) {
        const current = Number(seekbar.getAttribute("aria-valuenow"));
        const duration = Number(seekbar.getAttribute("aria-valuemax"));
        const minimum = Number(seekbar.getAttribute("aria-valuemin") ?? "0");
        if (
          !Number.isFinite(current) ||
          !Number.isFinite(duration) ||
          duration <= 0 ||
          duration > 86400 ||
          minimum !== 0 ||
          current < 0 ||
          current > duration + 5
        )
          continue;

        // Bitmovin's seekbar ARIA value comes directly from
        // player.getCurrentTime(), while the underlying HTMLMediaElement can use a
        // different MSE timestamp origin. Learn that origin delta once and project
        // the raw media clock through it. This also keeps advancing after the
        // controls auto-hide and the accessibility value stops repainting.
        const previous = playerTimelineOffsets.get(video);
        let offset = previous?.offset;
        if (!previous || current !== previous.lastAria) {
          offset = current - Math.floor(raw);
          playerTimelineOffsets.set(video, {
            offset,
            lastAria: current,
            duration,
          });
        } else if (previous.duration !== duration) {
          playerTimelineOffsets.set(video, {
            ...previous,
            duration,
          });
        }
        if (!Number.isFinite(offset)) continue;
        return {
          currentTime: Math.max(0, Math.min(duration, raw + offset)),
          duration,
        };
      }
    }
    return null;
  }

  function playbackTimeline(video) {
    const visiblePlayer = f1TvUiTimeline(video);
    if (visiblePlayer) {
      return {
        currentTime: visiblePlayer.currentTime,
        duration: visiblePlayer.duration,
        rawCurrentTime: Number(video.currentTime),
        clockSource: "f1tv-ui",
      };
    }
    const player = bitmovinTimeline(video);
    if (player) {
      return {
        currentTime: player.currentTime,
        duration: player.duration,
        rawCurrentTime: Number(video.currentTime),
        clockSource: "bitmovin-ui",
      };
    }
    return {
      currentTime: Number(video.currentTime),
      duration: Number.isFinite(video.duration) ? video.duration : null,
      rawCurrentTime: Number(video.currentTime),
      clockSource: "html5",
    };
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
    const timeline = playbackTimeline(chosen);
    if (!Number.isFinite(timeline.currentTime)) return;
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
          currentTime: timeline.currentTime,
          duration: timeline.duration,
          paused: chosen.paused,
          buffering,
          ended: chosen.ended,
          playbackRate: chosen.playbackRate,
          title: document.title.slice(0, 240),
          capturedAt: now,
          wallClockMs: wallClockMs(chosen),
          rawCurrentTime: timeline.rawCurrentTime,
          clockSource: timeline.clockSource,
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
