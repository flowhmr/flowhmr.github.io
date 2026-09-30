'use strict';

// Match the motion viewer's controls while keeping this video's playback independent.
(() => {
  const player = document.querySelector('[data-demo-player]');
  const video = player.querySelector('video');
  const find = name => player.querySelector(`[data-demo-${name}]`);
  const controls = find('controls');
  const play = find('play');
  const scrub = find('scrub');
  const mute = find('mute');
  const soundLabel = find('sound-label');
  const fullscreen = find('fullscreen');
  const error = find('error');

  function update() {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Math.min(video.currentTime || 0, duration);
    const paused = video.paused || video.ended;
    play.dataset.state = paused ? 'paused' : 'playing';
    play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    scrub.max = String(duration);
    scrub.value = String(current);
    scrub.setAttribute('aria-valuetext', `${current.toFixed(2)} of ${duration.toFixed(2)} seconds`);
    scrub.disabled = duration === 0;
    const muted = video.muted || video.volume === 0;
    soundLabel.textContent = muted ? 'Sounds off' : 'Sounds on';
    mute.setAttribute('aria-label', muted ? 'Sounds off — unmute' : 'Sounds on — mute');
    mute.setAttribute('aria-pressed', String(muted));
    fullscreen.setAttribute('aria-label', document.fullscreenElement === player ? 'Exit fullscreen' : 'Enter fullscreen');
  }

  function reportError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function togglePlayback() {
    error.hidden = true;
    if (!video.paused && !video.ended) {
      video.pause();
      return;
    }
    prepareVideo(video);
    if (video.ended) video.currentTime = 0;
    video.play().catch(cause => {
      if (cause.name !== 'AbortError') reportError('The video could not play. Please try again.');
      update();
    });
  }

  function seek(seconds) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, seconds));
    update();
  }

  async function enterFullscreen() {
    try {
      if (document.fullscreenElement === player) return;
      if (document.fullscreenEnabled && player.requestFullscreen) await player.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch {
      reportError('Fullscreen is unavailable in this browser.');
    }
  }

  function playFullscreen() {
    // Request fullscreen directly from the click to preserve user activation.
    enterFullscreen();
    if (video.paused || video.ended) togglePlayback();
  }

  play.addEventListener('click', togglePlayback);
  video.addEventListener('click', () => {
    if (document.fullscreenElement === player || video.webkitDisplayingFullscreen) togglePlayback();
    else playFullscreen();
  });
  scrub.addEventListener('input', () => seek(Number(scrub.value)));
  mute.addEventListener('click', () => {
    if (video.volume === 0) {
      video.volume = 1;
      video.muted = false;
    } else video.muted = !video.muted;
    update();
  });
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else await enterFullscreen();
    } catch {
      reportError('Fullscreen is unavailable in this browser.');
    }
  });
  fullscreen.hidden = !(document.fullscreenEnabled && player.requestFullscreen) && !video.webkitEnterFullscreen;
  player.addEventListener('keydown', event => {
    if (event.target.closest('button, select, input')) return;
    if (event.code === 'Enter' && event.target === video) { event.preventDefault(); playFullscreen(); }
    if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  });
  ['loadedmetadata', 'durationchange', 'timeupdate', 'seeking', 'seeked', 'play', 'pause', 'ended', 'ratechange', 'volumechange', 'emptied'].forEach(name => {
    video.addEventListener(name, update);
  });
  video.addEventListener('playing', () => { error.hidden = true; });
  video.addEventListener('error', () => reportError('The video could not load. Please refresh to try again.'));
  document.addEventListener('fullscreenchange', update);

  // Native controls are the fallback if JavaScript is unavailable.
  update();
  video.playbackRate = 1;
  video.controls = false;
  controls.hidden = false;
  mute.hidden = false;
})();
