'use strict';

const video = document.querySelector('#demo-video');
const foregroundVideos = [...document.querySelectorAll('.video-frame video')];
const heroVideo = document.querySelector('#hero-video');
const heroToggle = document.querySelector('.hero-video-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let wantsBackgroundMotion = !reducedMotion.matches;
let heroVisible = true;

function updatePlaybackButton() {
  const paused = heroVideo.paused;
  heroToggle.dataset.state = paused ? 'paused' : 'playing';
  heroToggle.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} background video`);
  heroToggle.querySelector('span').textContent = `${paused ? 'Play' : 'Pause'} background`;
}
function syncBackgroundPlayback() {
  const foregroundPlaying = foregroundVideos.some(player => !player.paused && !player.ended);
  if (wantsBackgroundMotion && heroVisible && !document.hidden && !foregroundPlaying) {
    heroVideo.play().catch(updatePlaybackButton);
  } else heroVideo.pause();
}
heroToggle.hidden = false;
heroVideo.addEventListener('play', updatePlaybackButton);
heroVideo.addEventListener('pause', updatePlaybackButton);
heroToggle.addEventListener('click', () => {
  wantsBackgroundMotion = heroVideo.paused;
  if (wantsBackgroundMotion) foregroundVideos.forEach(player => player.pause());
  syncBackgroundPlayback();
});
document.querySelector('.watch-button').addEventListener('click', () => {
  video.play().catch(() => { /* Native controls remain available if playback is blocked. */ });
});
reducedMotion.addEventListener('change', event => {
  wantsBackgroundMotion = !event.matches;
  syncBackgroundPlayback();
});
document.addEventListener('visibilitychange', syncBackgroundPlayback);
new IntersectionObserver(([entry]) => {
  heroVisible = entry.isIntersecting;
  syncBackgroundPlayback();
}, { threshold: 0.05 }).observe(document.querySelector('.hero'));
foregroundVideos.forEach(player => {
  player.addEventListener('play', () => {
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

  function playActive() {
    if (reducedMotion.matches || document.hidden) return;
    started = true;
    shouldResume = false;
    players[activeIndex].play().catch(() => { /* Keep the poster and native play control. */ });
  }
  function selectTab(index, focus = false) {
    activeIndex = index;
    tabs.forEach((tab, tabIndex) => {
      const selected = index === tabIndex;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[tabIndex].hidden = !selected;
      if (!selected) players[tabIndex].pause();
    });
    if (focus) tabs[index].focus();
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
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) {
      shouldResume ||= !players[activeIndex].paused;
      players.forEach(player => player.pause());
    } else if (!started || shouldResume) playActive();
  }, { threshold: 0.25 }).observe(section);
  reducedMotion.addEventListener('change', event => {
    if (event.matches) players.forEach(player => player.pause());
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      shouldResume ||= !players[activeIndex].paused;
      players.forEach(player => player.pause());
    } else if (inView && shouldResume) playActive();
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
