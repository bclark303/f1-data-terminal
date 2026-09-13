function visibleArea(video) {
  const rect = video.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
  return width * height;
}

function selectVideo() {
  const videos = [...document.querySelectorAll("video")];
  if (!videos.length) return null;

  return videos
    .map((video) => ({ video, area: visibleArea(video) }))
    .filter(({ video }) => Number.isFinite(video.currentTime))
    .sort((a, b) => {
      // Prefer the largest visible player. If neither is currently visible,
      // prefer the one with the longest duration as the likely main program.
      if (a.area !== b.area) return b.area - a.area;
      return (Number.isFinite(b.video.duration) ? b.video.duration : 0) - (Number.isFinite(a.video.duration) ? a.video.duration : 0);
    })[0]?.video ?? null;
}

function sendState() {
  const video = selectVideo();
  if (!video) return;

  chrome.runtime.sendMessage({
    type: "F1_VIDEO_STATE",
    state: {
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      paused: video.paused,
      playbackRate: video.playbackRate,
      title: document.title,
      url: location.href,
      capturedAt: Date.now(),
    },
  }).catch(() => {
    // The extension context can briefly disappear during navigation/reload.
  });
}

const events = ["play", "pause", "seeking", "seeked", "ratechange", "waiting", "playing", "loadedmetadata"];
for (const eventName of events) {
  document.addEventListener(eventName, sendState, true);
}

setInterval(sendState, 250);
sendState();
