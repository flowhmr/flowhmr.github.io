'use strict';

const video = document.querySelector('#demo-video');
const foregroundVideos = [...document.querySelectorAll('.video-frame video')];
const heroVideo = document.querySelector('#hero-video');
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
  return !player.closest('[hidden]') && (!player.closest('.application-card') || player.closest('.application-card').classList.contains('is-active'));
}
function visibleFraction(player) {
  const bounds = player.getBoundingClientRect();
  const visibleHeight = Math.max(0, Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0));
  return bounds.height ? visibleHeight / bounds.height : 0;
}

// Prepare only nearby foreground videos; hidden tabs retain just their posters.
const pendingLoads = new Map();
function isNearby(player) {
  const bounds = player.getBoundingClientRect();
  return isSelected(player) && bounds.bottom > 0 && bounds.top < innerHeight + 240;
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
}, { rootMargin: '0px 0px 240px 0px', threshold: 0 });
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


function syncBackgroundPlayback(immediate = false) {
  cancelHeroStart();
  const eligible = () => wantsBackgroundMotion && heroVisible && !document.hidden &&
    visibleFraction(heroVideo) >= 0.05 && !foregroundVideos.some(player => !player.paused && !player.ended);
  if (!eligible()) { heroVideo.pause(); return; }
  if (!heroVideo.paused) return;
  const play = () => {
    prepareVideo(heroVideo);
    heroVideo.play().catch(() => { /* Keep the poster if autoplay is blocked. */ });
  };
  if (immediate === true) play();
  else cancelHeroStart = afterScrollSettles(play, eligible);
}
document.querySelector('.watch-button').addEventListener('click', () => {
  prepareVideo(video);
  video.play().catch(() => { /* The custom play button remains available if playback is blocked. */ });
});
reducedMotion.addEventListener('change', event => {
  wantsBackgroundMotion = !event.matches;
  syncBackgroundPlayback();
});
document.addEventListener('visibilitychange', syncBackgroundPlayback);
new IntersectionObserver(([entry]) => {
  heroVisible = entry.isIntersecting && entry.intersectionRatio >= 0.05;
  syncBackgroundPlayback();
}, { rootMargin: '0px', threshold: 0.05 }).observe(document.querySelector('.hero'));
foregroundVideos.forEach(player => {
  player.addEventListener('play', () => {
    if (document.hidden || !isSelected(player)) { player.pause(); return; }
    const gallery = player.closest('[data-video-gallery]');
    foregroundVideos.forEach(other => {
      const sharesGallery = gallery && other.closest('[data-video-gallery]') === gallery;
      if (other !== player && !sharesGallery) other.pause();
    });
    syncBackgroundPlayback();
  });
  player.addEventListener('pause', syncBackgroundPlayback);
  player.addEventListener('ended', syncBackgroundPlayback);
});
syncBackgroundPlayback();

// Large, scrollable video cards; only the centered card plays.
document.querySelectorAll('.video-carousel').forEach(carousel => {
  const track = carousel.querySelector('[data-video-gallery]');
  const cards = [...track.querySelectorAll('.application-card')];
  let active = -1;
  function update() {
    const center = track.getBoundingClientRect().left + track.clientWidth / 2;
    const distances = cards.map(card => Math.abs(card.getBoundingClientRect().left + card.offsetWidth / 2 - center));
    const index = distances.indexOf(Math.min(...distances));
    if (index === active) return;
    active = index;
    cards.forEach((card, i) => {
      card.classList.toggle('is-active', i === active);
      card.inert = i !== active;
      const player = card.querySelector('video');
      if (i !== active) player.pause();
      else player.dispatchEvent(new Event('carouselactivate'));
    });
  }
  function move(delta) {
    const next = cards[(active + delta + cards.length) % cards.length];
    track.scrollTo({left: track.scrollLeft + next.getBoundingClientRect().left - track.getBoundingClientRect().left - (track.clientWidth - next.offsetWidth) / 2, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  }
  carousel.querySelector('.carousel-prev').addEventListener('click', () => move(-1));
  carousel.querySelector('.carousel-next').addEventListener('click', () => move(1));
  track.addEventListener('keydown', event => {
    if (event.target !== track) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
  });
  track.addEventListener('scroll', update, {passive:true});
  update();
});

// Tabs and gallery videos share lazy autoplay, pause, and visibility behavior.
document.querySelectorAll('[data-video-tabs], video[data-autoplay-video]').forEach(container => {
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const players = tabs.length ? panels.map(panel => panel.querySelector('video')) : [container];
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
  }, { rootMargin: '0px', threshold: [0, 0.25] });
  players.forEach(player => {
    visibilityObserver.observe(player);
    player.addEventListener('carouselactivate', () => {
      inView = visibleFraction(player) >= 0.25;
      shouldResume = true;
      if (inView) scheduleActive();
    });
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

// Keep the paper placeholder in place until a publication URL is available.
document.querySelectorAll('[data-placeholder-link]').forEach(link => {
  link.addEventListener('click', event => event.preventDefault());
});
