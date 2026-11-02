/* Keep the lobby screen awake on a Fire TV Stick.
   Prefer the Screen Wake Lock API. When it is missing or a gesture-time
   request fails, fall back to a muted looping video, the same idea as NoSleep.js.
   The video is created on the first interaction so play() stays inside the gesture. */
(function () {
  "use strict";

  var sentinel = null;
  var requesting = false;
  var gestured = false;
  var wakeMissing = false;
  var video = null;
  var dot = null;
  var resumeAt = 0;

  function apiPresent() {
    return !!(navigator.wakeLock && typeof navigator.wakeLock.request === "function");
  }

  function held() {
    return !!sentinel || (video && !video.paused);
  }

  function paint() {
    var stage = document.getElementById("stage");
    if (!dot && stage) {
      dot = document.createElement("div");
      dot.className = "awake-dot";
      dot.setAttribute("aria-hidden", "true");
      stage.appendChild(dot);
    }
    if (dot) dot.classList.toggle("is-on", held());
  }

  function ensureVideo() {
    if (video) return video;
    video = document.createElement("video");
    video.className = "awake-video";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.setAttribute("preload", "auto");
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("disableremoteplayback", "");
    video.setAttribute("aria-hidden", "true");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.volume = 0;
    video.controls = false;
    video.tabIndex = -1;
    if ("disablePictureInPicture" in video) video.disablePictureInPicture = true;
    if ("disableRemotePlayback" in video) video.disableRemotePlayback = true;
    video.src = "assets/awake.mp4";
    video.addEventListener("pause", function () {
      if (sentinel || !gestured || document.visibilityState !== "visible") return;
      if (!wakeMissing && apiPresent()) return;
      var now = Date.now();
      if (now < resumeAt) return;
      resumeAt = now + 1000;
      startVideo();
    });
    document.body.appendChild(video);
    return video;
  }

  function startVideo() {
    var el = ensureVideo();
    el.muted = true;
    var pending;
    try {
      pending = el.play();
    } catch (err) {
      paint();
      return;
    }
    if (pending && typeof pending.then === "function") {
      pending.then(function () {
        if (sentinel) pauseVideo();
        else paint();
      }, paint);
    } else if (sentinel) pauseVideo();
    else paint();
  }

  function pauseVideo() {
    if (video && !video.paused) {
      try { video.pause(); } catch (err) {}
    }
  }

  function onRelease() {
    sentinel = null;
    paint();
    if (document.visibilityState !== "visible") return;
    setTimeout(function () {
      if (document.visibilityState !== "visible") return;
      requestLock();
      if (gestured && !sentinel && (wakeMissing || !apiPresent())) startVideo();
    }, 250);
  }

  function requestLock() {
    if (!apiPresent()) {
      wakeMissing = true;
      paint();
      return;
    }
    if (requesting || sentinel) return;
    requesting = true;
    var fromGesture = gestured;
    var pending;
    try {
      pending = navigator.wakeLock.request("screen");
    } catch (err) {
      requesting = false;
      if (fromGesture) wakeMissing = true;
      paint();
      return;
    }
    if (!pending || typeof pending.then !== "function") {
      requesting = false;
      if (fromGesture) wakeMissing = true;
      paint();
      return;
    }
    pending.then(function (lock) {
      requesting = false;
      if (!lock) {
        if (fromGesture) wakeMissing = true;
        if (gestured && (wakeMissing || !apiPresent())) startVideo();
        paint();
        return;
      }
      wakeMissing = false;
      sentinel = lock;
      try { lock.addEventListener("release", onRelease); } catch (err) {}
      pauseVideo();
      paint();
    }, function () {
      requesting = false;
      if (fromGesture) wakeMissing = true;
      if (gestured) startVideo();
      paint();
    });
  }

  function onVisible() {
    if (document.visibilityState !== "visible") return;
    requestLock();
    if (gestured && !sentinel && (wakeMissing || !apiPresent())) startVideo();
  }

  function onGesture(event) {
    if (event && event.repeat) return;
    gestured = true;
    /* play() has to run in this turn. Wake Lock gets the gesture when the
       API exists; the video runs only once we know the API is missing or a
       gestured request already failed. */
    if (!sentinel && (!apiPresent() || wakeMissing)) startVideo();
    requestLock();
  }

  document.addEventListener("visibilitychange", onVisible);
  document.addEventListener("pointerdown", onGesture, true);
  document.addEventListener("keydown", onGesture, true);
  document.addEventListener("click", onGesture, true);
  requestLock();
  paint();
})();
