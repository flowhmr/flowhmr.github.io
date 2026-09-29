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

const comparisonTabs = [...document.querySelectorAll('.comparison-tab')];
const comparisonPlayers = [...document.querySelectorAll('.comparison-panel video')];
let activeComparison = 0;
let comparisonStarted = false;
let comparisonShouldResume = false;
function selectComparison(index, focus = false) {
  activeComparison = index;
  comparisonTabs.forEach((tab, tabIndex) => {
    const selected = index === tabIndex;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    if (!selected) comparisonPlayers[tabIndex].pause();
  });
  if (focus) comparisonTabs[index].focus();
  if (!reducedMotion.matches) {
    comparisonStarted = true;
    comparisonPlayers[index].play().catch(() => { /* Keep the poster and native play control. */ });
  }
}
comparisonTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectComparison(index));
  tab.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % comparisonTabs.length;
    if (event.key === 'ArrowLeft') target = (index - 1 + comparisonTabs.length) % comparisonTabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = comparisonTabs.length - 1;
    if (target !== undefined) { event.preventDefault(); selectComparison(target, true); }
  });
});
new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting) {
    comparisonShouldResume = !comparisonPlayers[activeComparison].paused;
    comparisonPlayers.forEach(player => player.pause());
  } else if ((!comparisonStarted || comparisonShouldResume) && !reducedMotion.matches) {
    comparisonStarted = true;
    comparisonShouldResume = false;
    comparisonPlayers[activeComparison].play().catch(() => { /* Native controls remain available. */ });
  }
}, { threshold: 0.25 }).observe(document.querySelector('.comparisons-section'));
reducedMotion.addEventListener('change', event => {
  if (event.matches) comparisonPlayers.forEach(player => player.pause());
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) comparisonPlayers.forEach(player => player.pause());
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
