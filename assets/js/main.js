'use strict';

const video = document.querySelector('#demo-video');
const foregroundVideos = [...document.querySelectorAll('.video-frame video')];
const heroVideo = document.querySelector('#hero-video');
const heroToggle = document.querySelector('.hero-video-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let wantsBackgroundMotion = !reducedMotion.matches;
let heroVisible = false;

// Keep MP4 URLs out of the media loader until the selected video is needed.
function prepareVideo(player) {
  const sources = [...player.querySelectorAll('source[data-src]')];
  if (!sources.some(source => !source.hasAttribute('src'))) return;
  sources.forEach(source => { source.src = source.dataset.src; });
  player.preload = 'metadata';
  player.load();
}
let lastScrollAt = performance.now();
window.addEventListener('scroll', () => { lastScrollAt = performance.now(); }, { passive: true });
function afterScrollSettles(action, eligible) {
  let timer;
  function check() {
    if (!eligible()) return;
    const remaining = 220 - (performance.now() - lastScrollAt);
    if (remaining > 0) timer = setTimeout(check, remaining);
    else action();
  }
  timer = setTimeout(check, 220);
  return () => clearTimeout(timer);
}
function isSelected(player) {
  return !player.closest('[hidden]');
}
function visibleFraction(player) {
  const bounds = player.getBoundingClientRect();
  const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
  const visibleHeight = Math.max(0, Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, headerBottom));
  return bounds.height ? visibleHeight / bounds.height : 0;
}

// Prepare only nearby foreground videos; hidden tabs retain just their posters.
const pendingLoads = new Map();
const headerHeight = Math.ceil(document.querySelector('.site-header').getBoundingClientRect().height);
function isNearby(player) {
  const bounds = player.getBoundingClientRect();
  return isSelected(player) && bounds.bottom > document.querySelector('.site-header').getBoundingClientRect().bottom && bounds.top < innerHeight + 240;
}
function schedulePreparation(player) {
  pendingLoads.get(player)?.();
  pendingLoads.delete(player);
  if (!isNearby(player) || !player.querySelector('source[data-src]:not([src])')) return;
  pendingLoads.set(player, afterScrollSettles(() => {
    prepareVideo(player);
    pendingLoads.delete(player);
  }, () => !document.hidden && isNearby(player)));
}
const nearbyVideos = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) schedulePreparation(entry.target);
    else {
      pendingLoads.get(entry.target)?.();
      pendingLoads.delete(entry.target);
    }
  });
}, { rootMargin: `-${headerHeight}px 0px 240px 0px`, threshold: 0 });
document.addEventListener('visibilitychange', () => {
  pendingLoads.forEach(cancel => cancel());
  pendingLoads.clear();
  if (!document.hidden) foregroundVideos.forEach(schedulePreparation);
});
foregroundVideos.forEach(player => {
  nearbyVideos.observe(player);
  player.addEventListener('pointerdown', () => prepareVideo(player), { once: true });
  player.addEventListener('keydown', () => prepareVideo(player), { once: true });
});
let cancelHeroStart = () => {};

function updatePlaybackButton() {
  const paused = heroVideo.paused;
  heroToggle.dataset.state = paused ? 'paused' : 'playing';
  heroToggle.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} background video`);
  heroToggle.querySelector('span').textContent = `${paused ? 'Play' : 'Pause'} background`;
}
function syncBackgroundPlayback(immediate = false) {
  cancelHeroStart();
  const eligible = () => wantsBackgroundMotion && heroVisible && !document.hidden &&
    visibleFraction(heroVideo) >= 0.05 && !foregroundVideos.some(player => !player.paused && !player.ended);
  if (!eligible()) { heroVideo.pause(); return; }
  if (!heroVideo.paused) return;
  const play = () => {
    prepareVideo(heroVideo);
    heroVideo.play().catch(updatePlaybackButton);
  };
  if (immediate === true) play();
  else cancelHeroStart = afterScrollSettles(play, eligible);
}
heroToggle.hidden = false;
heroVideo.addEventListener('play', updatePlaybackButton);
heroVideo.addEventListener('pause', updatePlaybackButton);
heroToggle.addEventListener('click', () => {
  wantsBackgroundMotion = heroVideo.paused;
  if (wantsBackgroundMotion) foregroundVideos.forEach(player => player.pause());
  syncBackgroundPlayback(true);
});
document.querySelector('.watch-button').addEventListener('click', () => {
  prepareVideo(video);
  video.play().catch(() => { /* Native controls remain available if playback is blocked. */ });
});
reducedMotion.addEventListener('change', event => {
  wantsBackgroundMotion = !event.matches;
  syncBackgroundPlayback();
});
document.addEventListener('visibilitychange', syncBackgroundPlayback);
new IntersectionObserver(([entry]) => {
  heroVisible = entry.isIntersecting && entry.intersectionRatio >= 0.05;
  syncBackgroundPlayback();
}, { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: 0.05 }).observe(document.querySelector('.hero'));
foregroundVideos.forEach(player => {
  player.addEventListener('play', () => {
    if (document.hidden || !isSelected(player)) { player.pause(); return; }
    foregroundVideos.forEach(other => { if (other !== player) other.pause(); });
    syncBackgroundPlayback();
  });
  player.addEventListener('pause', syncBackgroundPlayback);
  player.addEventListener('ended', syncBackgroundPlayback);
});
syncBackgroundPlayback();

// Keep each video tab group independent while sharing foreground playback rules.
document.querySelectorAll('[data-video-tabs]').forEach(section => {
  const tabs = [...section.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const players = panels.map(panel => panel.querySelector('video'));
  let activeIndex = 0;
  let started = false;
  let shouldResume = false;
  let inView = false;
  let cancelAutoStart = () => {};

  function playActive() {
    if (reducedMotion.matches || document.hidden) return;
    started = true;
    shouldResume = false;
    prepareVideo(players[activeIndex]);
    players[activeIndex].play().catch(() => { /* Keep the poster and native play control. */ });
  }
  function scheduleActive() {
    cancelAutoStart();
    cancelAutoStart = afterScrollSettles(playActive, () => inView && isSelected(players[activeIndex]) &&
      visibleFraction(players[activeIndex]) >= 0.25 && !document.hidden && !reducedMotion.matches && (!started || shouldResume));
  }
  function selectTab(index, focus = false) {
    cancelAutoStart();
    activeIndex = index;
    tabs.forEach((tab, tabIndex) => {
      const selected = index === tabIndex;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[tabIndex].hidden = !selected;
      if (!selected) players[tabIndex].pause();
    });
    if (focus) tabs[index].focus();
    inView = visibleFraction(players[index]) >= 0.25;
    prepareVideo(players[index]);
    playActive();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target !== undefined) { event.preventDefault(); selectTab(target, true); }
    });
  });
  const visibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target !== players[activeIndex]) return;
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      cancelAutoStart();
      if (!inView) {
        shouldResume ||= !players[activeIndex].paused;
        players.forEach(player => player.pause());
      } else if (!started || shouldResume) scheduleActive();
    });
  }, { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: [0, 0.25] });
  players.forEach(player => {
    visibilityObserver.observe(player);
    player.addEventListener('play', () => {
      if (player !== players[activeIndex]) return;
      cancelAutoStart();
      started = true;
      shouldResume = false;
    });
  });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) {
      cancelAutoStart();
      shouldResume = false;
      players.forEach(player => player.pause());
    }
  });
  document.addEventListener('visibilitychange', () => {
    cancelAutoStart();
    if (document.hidden) {
      shouldResume ||= !players[activeIndex].paused;
      players.forEach(player => player.pause());
    } else if (inView && (!started || shouldResume)) scheduleActive();
  });
});

document.querySelectorAll('[data-figure-dialog]').forEach(opener => {
  const diagram = document.getElementById(opener.dataset.figureDialog);
  let previousOverflow = '';
  opener.addEventListener('click', () => {
    previousOverflow = document.body.style.overflow;
    diagram.showModal();
    document.body.style.overflow = 'hidden';
  });
  diagram.querySelector('.dialog-close').addEventListener('click', () => diagram.close());
  diagram.addEventListener('click', event => {
    if (event.target === diagram) {
      const bounds = diagram.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) diagram.close();
    }
  });
  diagram.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    opener.focus({ preventScroll: true });
  });
});

const navigation = [...document.querySelectorAll('.nav-links a')];
const sections = navigation.map(link => document.querySelector(link.getAttribute('href')));
let scheduled = false;
function updateNavigation() {
  let current = null;
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= window.innerHeight * 0.42) current = section.id;
  }
  for (const link of navigation) {
    if (link.hash === `#${current}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  scheduled = false;
}
window.addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(updateNavigation); }
}, { passive: true });
window.addEventListener('resize', updateNavigation);
updateNavigation();
