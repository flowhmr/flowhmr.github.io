// Interactive viewer: input video, generated motion on the HY-Motion wooden character, and PHC tracking in simulation.
// The input video is the master clock; both 3D streams follow its decoded time.
const root = document.querySelector('[data-motion-viewer]');
const FPS = 30;
const CAMERA_OFFSET = [1.55, -4.75, 1.4];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = selector => root.querySelector(selector);
const ui = root && {
  card: $('.mv-card'), category: $('[data-mv-category]'), title: $('[data-mv-title]'),
  stage: $('[data-mv-canvas]'), video: $('[data-mv-video]'), loading: $('[data-mv-loading]'),
  play: $('[data-mv-play]'), prev: $('[data-mv-prev]'), next: $('[data-mv-next]'), scrub: $('[data-mv-scrub]'),
  time: $('[data-mv-time]'), speed: $('[data-mv-speed]'), follow: $('[data-mv-follow]'), reset: $('[data-mv-reset]'),
  gallery: $('[data-mv-gallery]'),
  stripPrev: $('[data-mv-strip-prev]'), stripNext: $('[data-mv-strip-next]'),
};

let THREE, manifest, base, renderer, camera, orbit, smpl, smplBones, smplHolder;
let scenes = [], bodies = [], trails = [], thumbs = new Map(), cache = new Map();
let clip = null, data = null, frame = 0, token = 0, lastTick = 0;
let wantPlay = !reducedMotion.matches, visible = false, following = true, ready = false, pendingId = null;
let pelvis, desired, step, qa, qb, va, vb;
let playPending = null;

if (root) boot().catch(error => showMessage('The 3D viewer could not start.', error));

function showMessage(text, error) {
  ui.loading.hidden = false;
  ui.loading.textContent = text;
  if (error) console.error(error);
}

async function boot() {
  const url = new URL(root.dataset.manifest, location.href);
  base = new URL('.', url).href;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  manifest = await response.json();
  buildGallery();
  await nearViewport(root);
  await setup();
  ready = true;
  await select(pendingId || manifest.clips[0].id);
  requestAnimationFrame(tick);
}

function nearViewport(element) {
  return new Promise(resolve => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); resolve(); }
    }, { rootMargin: '600px 0px' });
    observer.observe(element);
  });
}

// ---------- Clip strip: three copies with seamless wrap-around ----------
const COPIES = 3;
let setWidth = 0, activeIndex = 0, stripAnimation = 0, dragged = false;

function buildGallery() {
  const track = ui.gallery;
  const fragment = document.createDocumentFragment();
  for (let copy = 0; copy < COPIES; copy++) {
    manifest.clips.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mv-thumb';
      button.title = item.title;
      button.innerHTML = `<img src="${base}${item.thumb}?v=${item.v}" alt="" draggable="false" decoding="async"><span class="mv-badge">${item.category}</span><span class="mv-thumb-title">${item.title}</span>`;
      if (copy === 1) button.setAttribute('aria-label', `${item.category}: ${item.title}`);
      else { button.tabIndex = -1; button.setAttribute('aria-hidden', 'true'); }
      button.addEventListener('click', () => { if (!dragged) select(item.id, { play: true }); });
      fragment.append(button);
      if (!thumbs.has(item.id)) thumbs.set(item.id, []);
      thumbs.get(item.id)[copy] = button;
      button.dataset.index = String(index);
    });
  }
  track.append(fragment);
  const measure = () => {
    const [a, b] = thumbs.get(manifest.clips[0].id);
    setWidth = b.offsetLeft - a.offsetLeft;
    wrapStrip();
  };
  measure();
  new ResizeObserver(() => { measure(); centerThumb(activeIndex, false); }).observe(track);
  track.addEventListener('scroll', wrapStrip, { passive: true });
  ui.stripPrev.addEventListener('click', () => stepClip(-1));
  ui.stripNext.addEventListener('click', () => stepClip(1));
  track.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    stepClip(event.key === 'ArrowRight' ? 1 : -1);
    thumbs.get(manifest.clips[activeIndex].id)[1].focus({ preventScroll: true });
  });
  // Mouse drag scrolls the strip; touch and trackpads use native scrolling.
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    cancelAnimationFrame(stripAnimation);
    const startX = event.clientX;
    let lastX = startX;
    dragged = false;
    const move = e => {
      if (Math.abs(e.clientX - startX) > 5) { dragged = true; track.classList.add('is-dragging'); }
      track.scrollLeft -= e.clientX - lastX;
      lastX = e.clientX;
      wrapStrip();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      track.classList.remove('is-dragging');
      setTimeout(() => { dragged = false; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  markActive(0, false);
}

// Keep the scroll position inside the middle copy; returns the applied shift.
function wrapStrip() {
  if (!setWidth) return 0;
  const track = ui.gallery, x = track.scrollLeft;
  const shift = x < setWidth * 0.5 ? setWidth : x > setWidth * 1.5 ? -setWidth : 0;
  if (shift) track.scrollLeft = x + shift;
  return shift;
}

function centerThumb(index, smooth) {
  const track = ui.gallery, center = track.scrollLeft + track.clientWidth / 2;
  let delta = Infinity;
  for (const button of thumbs.get(manifest.clips[index].id)) {
    const d = button.offsetLeft + button.offsetWidth / 2 - center;
    if (Math.abs(d) < Math.abs(delta)) delta = d;
  }
  cancelAnimationFrame(stripAnimation);
  if (!smooth || reducedMotion.matches || Math.abs(delta) < 1) { track.scrollLeft += delta; wrapStrip(); return; }
  let from = track.scrollLeft;
  const start = performance.now(), duration = 450;
  const animate = now => {
    const t = Math.min(1, (now - start) / duration);
    track.scrollLeft = from + delta * (1 - Math.pow(1 - t, 3));
    from += wrapStrip();
    if (t < 1) stripAnimation = requestAnimationFrame(animate);
  };
  stripAnimation = requestAnimationFrame(animate);
}

function markActive(index, smooth = true) {
  activeIndex = index;
  thumbs.forEach(buttons => buttons.forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.index) === index))));
  centerThumb(index, smooth);
}

function stepClip(delta) {
  const count = manifest.clips.length;
  select(manifest.clips[(activeIndex + delta + count) % count].id, { play: true });
}

// ---------- 3D setup ----------
async function setup() {
  const [three, { OrbitControls }, { RectAreaLightUniformsLib }] = await Promise.all([
    import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/lights/RectAreaLightUniformsLib.js'),
  ]);
  THREE = three;
  pelvis = new THREE.Vector3(); desired = new THREE.Vector3(); step = new THREE.Vector3();
  qa = new THREE.Quaternion(); qb = new THREE.Quaternion(); va = new THREE.Vector3(); vb = new THREE.Vector3();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  ui.stage.prepend(renderer.domElement);
  RectAreaLightUniformsLib.init();

  camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
  camera.up.set(0, 0, 1);
  orbit = new OrbitControls(camera, renderer.domElement);
  Object.assign(orbit, { enableDamping: true, minDistance: 1.5, maxDistance: 16, maxPolarAngle: Math.PI * 0.95, enableZoom: false });
  // Wheel zoom only after the viewer is engaged, so page scrolling is never captured by accident.
  renderer.domElement.addEventListener('pointerdown', () => { orbit.enableZoom = true; });
  ui.stage.addEventListener('pointerleave', () => { orbit.enableZoom = false; });

  const style = manifest.style;
  const material = key => {
    const m = style.materials[key];
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setRGB(...m['Base Color'].slice(0, 3), THREE.LinearSRGBColorSpace),
      roughness: m.Roughness, metalness: m.Metallic, ior: m.IOR, specularIntensity: m['Specular IOR Level'] * 2,
    });
  };
  scenes = [makeScene(style), makeScene(style)];
  smplHolder = new THREE.Group();
  smplHolder.rotation.x = Math.PI / 2; // SMPL-H Y-up -> simulation Z-up
  scenes[0].scene.add(smplHolder);
  const blue = material('blue');
  for (const name of manifest.bodies) {
    const group = new THREE.Group();
    for (const spec of manifest.geometry[name]) group.add(geometryMesh(spec, blue));
    scenes[1].scene.add(group);
    bodies.push(group);
  }

  const model = manifest.model;
  const [buffer, texture] = await Promise.all([
    fetchBuffer(`${model.file}?v=${model.v}`),
    new THREE.TextureLoader().loadAsync(`${base}${model.texture}?v=${model.v}`),
  ]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  buildCharacter(model, buffer, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0 }));

  new ResizeObserver(resize).observe(ui.stage);
  resize();
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) ui.video.pause();
    else if (wantPlay && clip) play();
  }, { threshold: 0.15 }).observe(ui.card);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ui.video.pause();
    else if (wantPlay && visible && clip) play();
  });
  // On mobile the input video can enter the viewport after the taller viewer card.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) resumePlayback();
  }, { threshold: [0, 0.15] }).observe(ui.video);
  bindControls();
}

function makeScene(style) {
  const scene = new THREE.Scene();
  const background = new THREE.Color('#f4f6f6');
  scene.background = background;
  scene.fog = new THREE.Fog(background, 10, 28);
  scene.add(new THREE.AmbientLight(new THREE.Color().setRGB(...style.ambient), Math.PI));
  // Lights and the shadow camera travel with the performer for long-range motion.
  const rig = new THREE.Group();
  scene.add(rig);
  for (const l of style.lights.slice(0, 3)) {
    const light = new THREE.RectAreaLight(0xffffff, l.energy / (l.size * l.size * Math.PI), l.size, l.size);
    light.position.fromArray(l.position);
    light.lookAt(0, 0, 1);
    rig.add(light);
  }
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, -4, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.1, far: 20 });
  Object.assign(sun.shadow, { bias: -0.00015, normalBias: 0.002, radius: 2 });
  rig.add(sun, sun.target);
  // Weak, shadowless bounce light so soles stay readable when orbiting below the ground.
  const bounce = new THREE.DirectionalLight(0xffffff, 0.55);
  bounce.position.set(1, -2, -6);
  rig.add(bounce, bounce.target);
  // Half-meter tiles provide a stable height reference without hiding contact shadows.
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileCanvas.height = 256;
  const ctx = tileCanvas.getContext('2d');
  ctx.fillStyle = '#c5cecf';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#e0e5e4';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillRect(128, 128, 128, 128);
  const floorTexture = new THREE.CanvasTexture(tileCanvas);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(200, 200);
  floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({
    map: floorTexture, roughness: 1, metalness: 0,
  }));
  ground.position.z = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  return { scene, rig };
}

function geometryMesh(g, material) {
  const mesh = new THREE.Mesh(undefined, material);
  if (g.type === 'sphere') {
    mesh.geometry = new THREE.SphereGeometry(g.size[0], 32, 24);
    mesh.position.fromArray(g.pos || [0, 0, 0]);
  } else if (g.type === 'box') {
    mesh.geometry = new THREE.BoxGeometry(...g.size.map(x => x * 2));
    mesh.position.fromArray(g.pos || [0, 0, 0]);
    if (g.quat) mesh.quaternion.set(g.quat[1], g.quat[2], g.quat[3], g.quat[0]);
  } else if (g.type === 'capsule') {
    const a = new THREE.Vector3().fromArray(g.fromto, 0), b = new THREE.Vector3().fromArray(g.fromto, 3);
    mesh.geometry = new THREE.CapsuleGeometry(g.size[0], a.distanceTo(b), 10, 24);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  } else throw new Error(`Unknown geometry ${g.type}`);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function resize() {
  const w = ui.stage.clientWidth, h = ui.stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / 2 / h;
  camera.zoom = Math.min(1, camera.aspect / 0.8);
  camera.updateProjectionMatrix();
}

// ---------- Data ----------
async function fetchBuffer(path) {
  const response = await fetch(base + path);
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.arrayBuffer();
}

function dequantize(values) {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 4) {
    const x = values[i], y = values[i + 1], z = values[i + 2], w = values[i + 3];
    const n = Math.hypot(x, y, z, w) || 1;
    out[i] = x / n; out[i + 1] = y / n; out[i + 2] = z / n; out[i + 3] = w / n;
  }
  return out;
}

async function loadClip(item) {
  if (cache.has(item.id)) return cache.get(item.id);
  const buffer = await fetchBuffer(`${item.data}?v=${item.v}`);
  const J = manifest.model.joints, B = manifest.bodies.length, R = item.frames;
  let offset = 0;
  const take = (Type, count) => { const array = new Type(buffer, offset, count); offset += count * Type.BYTES_PER_ELEMENT; return array; };
  const result = {
    root: take(Float32Array, R * 3), robotPos: take(Float32Array, R * B * 3),
    pose: dequantize(take(Int16Array, R * J * 4)), robotQuat: dequantize(take(Int16Array, R * B * 4)),
  };
  if (offset !== buffer.byteLength) throw new Error(`Unexpected clip size for ${item.id}`);
  cache.set(item.id, result);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return result;
}

function waitForVideo(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('video')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Video metadata timed out')); }, 20000);
    function cleanup() { clearTimeout(timer); video.removeEventListener('loadedmetadata', done); video.removeEventListener('error', fail); }
    video.addEventListener('loadedmetadata', done);
    video.addEventListener('error', fail);
  });
}

// The HY-Motion wooden character shares the SMPL-H joint layout and rest orientation,
// so generated local joint rotations drive it directly.
function buildCharacter(model, buffer, material) {
  const V = model.vertices, F = model.triangles;
  let offset = 0;
  const take = (Type, count) => { const array = new Type(buffer, offset, count); offset += count * Type.BYTES_PER_ELEMENT; return array; };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(take(Float32Array, V * 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(take(Float32Array, V * 2), 2));
  geometry.setIndex(new THREE.BufferAttribute(take(Uint16Array, F * 3), 1));
  geometry.setAttribute('normal', new THREE.BufferAttribute(take(Int8Array, V * 3), 3, true));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(take(Uint8Array, V * 4), 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(take(Uint8Array, V * 4), 4, true));
  if (offset !== buffer.byteLength) throw new Error('Unexpected character size');
  const J = model.rest, parents = model.parents;
  smplBones = parents.map(() => new THREE.Bone());
  parents.forEach((parent, j) => {
    const bone = smplBones[j];
    if (parent < 0) bone.position.fromArray(J, 0);
    else {
      bone.position.set(J[j * 3] - J[parent * 3], J[j * 3 + 1] - J[parent * 3 + 1], J[j * 3 + 2] - J[parent * 3 + 2]);
      smplBones[parent].add(bone);
    }
  });
  smpl = new THREE.SkinnedMesh(geometry, material);
  smpl.add(smplBones[0]);
  smpl.bind(new THREE.Skeleton(smplBones));
  smpl.castShadow = smpl.receiveShadow = true;
  smpl.frustumCulled = false;
  smplHolder.add(smpl);
}

// ---------- Ground trajectory ----------
const TRAIL_WIDTH = 0.045, TRAIL_Z = 0.004;
const TRAIL_STYLE = [{ color: '#b98d62' }, { color: '#2f6f86' }];

// Flat ribbon along the pelvis ground projection; 6 indices per segment.
function ribbonGeometry(points) {
  const n = points.length / 2, positions = new Float32Array(n * 6), index = new Uint32Array(Math.max(0, n - 1) * 6);
  let tx = 1, ty = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - 2), q = Math.min(n - 1, i + 2);
    const dx = points[q * 2] - points[p * 2], dy = points[q * 2 + 1] - points[p * 2 + 1], len = Math.hypot(dx, dy);
    if (len > 1e-4) { tx = dx / len; ty = dy / len; }
    const nx = -ty * TRAIL_WIDTH / 2, ny = tx * TRAIL_WIDTH / 2, x = points[i * 2], y = points[i * 2 + 1];
    positions.set([x + nx, y + ny, TRAIL_Z, x - nx, y - ny, TRAIL_Z], i * 6);
    if (i < n - 1) index.set([2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

function buildTrails(item, clipData) {
  for (const trail of trails) {
    for (const mesh of [trail.full, trail.progress]) { mesh.parent.remove(mesh); mesh.geometry.dispose(); }
  }
  trails = [];
  const R = item.frames, B = manifest.bodies.length, o = item.offset;
  const generated = new Float32Array(R * 2), simulated = new Float32Array(R * 2);
  for (let k = 0; k < R; k++) {
    generated[k * 2] = clipData.root[k * 3] + o[0];
    generated[k * 2 + 1] = -clipData.root[k * 3 + 2] + o[1];
    simulated[k * 2] = clipData.robotPos[k * B * 3];
    simulated[k * 2 + 1] = clipData.robotPos[k * B * 3 + 1];
  }
  [generated, simulated].forEach((points, i) => {
    const geometry = ribbonGeometry(points);
    const make = (geo, opacity) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: TRAIL_STYLE[i].color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      mesh.renderOrder = 1;
      scenes[i].scene.add(mesh);
      return mesh;
    };
    const progress = new THREE.BufferGeometry();
    progress.setAttribute('position', geometry.getAttribute('position'));
    progress.setIndex(geometry.getIndex());
    trails.push({ full: make(geometry, 0.22), progress: make(progress, 0.85) });
  });
}

// ---------- Playback ----------
function applyPose(f) {
  const R = clip.frames, J = manifest.model.joints, B = bodies.length;
  const a = Math.floor(f), b = Math.min(a + 1, R - 1), t = f - a;
  for (let j = 0; j < J; j++) {
    qa.fromArray(data.pose, (a * J + j) * 4);
    qb.fromArray(data.pose, (b * J + j) * 4);
    smplBones[j].quaternion.slerpQuaternions(qa, qb, t);
  }
  va.fromArray(data.root, a * 3);
  vb.fromArray(data.root, b * 3);
  const hip = va.lerp(vb, t);
  pelvis.set(hip.x + clip.offset[0], -hip.z + clip.offset[1], hip.y + clip.offset[2]);
  smplBones[0].position.copy(hip).divideScalar(clip.scale);
  for (let i = 0; i < B; i++) {
    bodies[i].position.lerpVectors(va.fromArray(data.robotPos, (a * B + i) * 3), vb.fromArray(data.robotPos, (b * B + i) * 3), t);
    qa.fromArray(data.robotQuat, (a * B + i) * 4);
    qb.fromArray(data.robotQuat, (b * B + i) * 4);
    bodies[i].quaternion.slerpQuaternions(qa, qb, t);
  }
  for (const { rig } of scenes) rig.position.set(pelvis.x, pelvis.y, 0);
  for (const trail of trails) trail.progress.geometry.setDrawRange(0, Math.floor(f) * 6);
  ui.scrub.value = String(Math.round(f));
  ui.time.textContent = `${(f / FPS).toFixed(2)} / ${(R / FPS).toFixed(2)} s`;
}

function resetCamera() {
  orbit.target.set(pelvis.x, pelvis.y, 0.9);
  camera.position.set(pelvis.x + CAMERA_OFFSET[0], pelvis.y + CAMERA_OFFSET[1], 0.9 + CAMERA_OFFSET[2]);
  orbit.update();
}

function followPerformer(dt) {
  if (!following) return;
  desired.set(pelvis.x, pelvis.y, orbit.target.z);
  step.subVectors(desired, orbit.target).multiplyScalar(1 - Math.exp(-dt * 5));
  orbit.target.add(step);
  camera.position.add(step);
}

function draw() {
  const w = ui.stage.clientWidth, h = ui.stage.clientHeight;
  renderer.setScissorTest(true);
  scenes.forEach(({ scene }, i) => {
    renderer.setViewport(i * w / 2, 0, w / 2, h);
    renderer.setScissor(i * w / 2, 0, w / 2, h);
    renderer.render(scene, camera);
  });
  renderer.setScissorTest(false);
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - lastTick) / 1000 || 0);
  lastTick = now;
  if (!visible || document.hidden || !clip || !ui.loading.hidden) return;
  const video = ui.video;
  if (!video.paused && !video.seeking) frame = Math.max(0, Math.min(clip.frames - 1, video.currentTime * FPS - 0.5));
  applyPose(frame);
  followPerformer(dt);
  orbit.update();
  draw();
}

function seek(target) {
  if (!clip) return;
  frame = Math.max(0, Math.min(clip.frames - 1, Math.round(target)));
  ui.video.currentTime = (frame + 0.5) / FPS;
  applyPose(frame);
}

function resumePlayback() {
  if (wantPlay && visible && !document.hidden && ui.loading.hidden && clip && ui.video.paused) play();
}

async function play() {
  if (!clip || document.hidden || !ui.loading.hidden) return;
  if (playPending) return playPending;
  const video = ui.video;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = wantPlay;
  video.playbackRate = Number(ui.speed.value);
  const attempt = video.play();
  playPending = attempt;
  try { await attempt; } catch { /* Retry on readiness, visibility, or a viewer tap. */ }
  finally { if (playPending === attempt) playPending = null; updatePlayButton(); }
}

function pause() {
  wantPlay = false;
  ui.video.autoplay = false;
  ui.video.pause();
}

function updatePlayButton() {
  const paused = ui.video.paused;
  ui.play.dataset.state = paused ? 'paused' : 'playing';
  ui.play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
}

function bindControls() {
  const video = ui.video;
  video.muted = video.defaultMuted = true;
  video.playsInline = true;
  video.addEventListener('loadeddata', resumePlayback);
  video.addEventListener('canplay', resumePlayback);
  // A blocked mobile autoplay can be resumed without switching the selected case.
  root.addEventListener('click', event => {
    if (!event.target.closest('button, input, select')) resumePlayback();
  });
  video.addEventListener('play', updatePlayButton);
  video.addEventListener('pause', updatePlayButton);
  ui.play.addEventListener('click', () => {
    if (video.paused) { wantPlay = true; play(); } else pause();
  });
  ui.prev.addEventListener('click', () => { pause(); seek(frame - 1); });
  ui.next.addEventListener('click', () => { pause(); seek(frame + 1); });
  ui.scrub.addEventListener('input', () => { pause(); seek(Number(ui.scrub.value)); });
  ui.speed.addEventListener('change', () => { video.playbackRate = Number(ui.speed.value); });
  ui.follow.addEventListener('click', () => {
    following = !following;
    ui.follow.setAttribute('aria-pressed', String(following));
  });
  ui.reset.addEventListener('click', resetCamera);
  ui.card.addEventListener('keydown', event => {
    if (event.target.closest('button, select, input')) return;
    if (event.code === 'Space') { event.preventDefault(); ui.play.click(); }
    if (event.code === 'ArrowRight') { event.preventDefault(); ui.next.click(); }
    if (event.code === 'ArrowLeft') { event.preventDefault(); ui.prev.click(); }
  });
}

async function select(id, { play: start = false } = {}) {
  if (!ready) { pendingId = id; return; }
  const item = manifest.clips.find(entry => entry.id === id);
  if (start) wantPlay = true;
  markActive(manifest.clips.indexOf(item), clip !== null);
  if (clip === item && ui.loading.hidden) {
    seek(0);
    if (wantPlay && visible) play();
    return;
  }
  const mine = ++token;
  ui.category.textContent = item.category;
  ui.title.textContent = item.title;
  showMessage('Loading motion…');
  const video = ui.video;
  video.pause();
  playPending = null;
  video.autoplay = false;
  video.src = `${base}${item.video}?v=${item.v}`;
  video.load();
  try {
    const [clipData] = await Promise.all([loadClip(item), waitForVideo(video)]);
    if (mine !== token) return;
    clip = item;
    data = clipData;
    smpl.scale.setScalar(item.scale);
    smplHolder.position.fromArray(item.offset);
    buildTrails(item, clipData);
    ui.scrub.max = String(item.frames - 1);
    seek(0);
    resetCamera();
    ui.loading.hidden = true;
    if (wantPlay && visible) play();
  } catch (error) {
    if (mine === token) showMessage('This clip could not be loaded. Please try another one.', error);
  }
}
