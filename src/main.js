import * as THREE from 'three';
import { shared } from './materials.js';
import { createTerrain, groundHeight } from './world/terrain.js';
import { createWater } from './world/water.js';
import { createSky, createClouds, SKY } from './world/sky.js';
import { createTrees, createFlowers } from './world/trees.js';
import { createAirfield } from './world/airfield.js';
import { LAYOUT, REGION } from './world/layout.js';
import { paintFeatures } from './world/paint.js';
import { createBuildings, chimneys } from './world/buildings.js';
import { createCountryside, createBalloons, createBirds, createSmoke } from './world/life.js';
import { createTraffic, createBoats } from './world/movers.js';
import { createDayCycle } from './world/daycycle.js';
import { createPost } from './post.js';
import { createPlane } from './plane/model.js';
import { FlightModel } from './plane/flight.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { Sound } from './audio.js';
import { createFx } from './fx.js';
import { createInteractions } from './world/interactions.js';

// ---- Loading card ---------------------------------------------------------------
// Building the world is one long synchronous job, so we pause between the big pieces to let
// the loading card repaint with a new line (the clouds on it drift regardless).
const loaderStatus = document.getElementById('loader-status');
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function step(line) {
  loaderStatus.textContent = line;
  await nextPaint();
}
// keys stay with the card until it's gone, so nothing moves the plane behind it
let onLoaderKey = null;
function swallowKeys(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  if (!e.repeat) onLoaderKey?.(e);
}
window.addEventListener('keydown', swallowKeys, true);

// ---- Renderer -----------------------------------------------------------------
// phones and tablets get a lighter render (post-processing at full Retina res is the main cost)
const touchFirst = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
const SHADOW_RES = touchFirst ? 1024 : 2048;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, touchFirst ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY.haze, 350, 5200);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 20000);
// fov is vertical, so a tall phone screen would see a sliver sideways: widen it in portrait
function fitCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = 60;
  if (touchFirst && camera.aspect < 1) {
    const minHorizontal = 50 * (Math.PI / 180);
    const v = 2 * Math.atan(Math.tan(minHorizontal / 2) / camera.aspect);
    camera.fov = Math.min(90, (v * 180) / Math.PI);
  }
  camera.updateProjectionMatrix();
}
fitCamera();

// ---- Light: golden late-afternoon sun, lavender sky fill, warm ground bounce --
const sunDir = new THREE.Vector3(-0.6, 0.45, 0.55).normalize();
const hemi = new THREE.HemisphereLight('#c6dcf4', '#a9b98a', 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d6', 2.55);
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
const S = 150;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 1200 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// ---- World ------------------------------------------------------------------
await step('painting the hills…');
const sky = createSky(sunDir);
scene.add(sky);
const terrain = createTerrain(paintFeatures(), REGION, sunDir);
scene.add(terrain);
const water = createWater(sunDir);
scene.add(water);
const clouds = createClouds(sunDir);
scene.add(clouds);
await step('planting trees…');
const trees = createTrees();
scene.add(trees);
scene.add(createFlowers());
await step('building the village…');
const airfield = createAirfield();
scene.add(airfield);
const buildings = createBuildings();
scene.add(buildings);
await step('herding sheep…');
const countryside = createCountryside();
scene.add(countryside);
const balloons = createBalloons();
scene.add(balloons);
const birds = createBirds();
scene.add(birds);
const smoke = createSmoke(chimneys);
scene.add(smoke);
const traffic = createTraffic();
scene.add(traffic);
const boats = createBoats();
scene.add(boats);
const fx = createFx();
scene.add(fx.group);
const post = createPost(renderer, scene, camera);
const day = createDayCycle({ scene, sun, hemi, sky, clouds, water, terrain, post, lamps: buildings.userData.lamps });

// ---- Plane ------------------------------------------------------------------
const plane = createPlane();
scene.add(plane);
const flight = new FlightModel();
const chase = new ChaseCamera(camera);
const input = new Input(canvas);
const sound = new Sound();

// ---- Bumping into things ------------------------------------------------------
// what the plane hits tells us here, so we can shake the camera and say something nice
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SMASH_LINES = ['crumble! 🧱', 'oops, someone’s kitchen 🫖', 'sorry! 🙈', 'timber… er, bricks 🧱', 'that’ll buff out ✨'];
const said = new Set();
let lastQuip = -99;
function quip(msg, { once, gap = 5 } = {}) {
  if (once && said.has(once)) return;
  if (t - lastQuip < gap) return;
  if (once) said.add(once);
  lastQuip = t;
  toast(msg);
}
function emit(type, data = {}) {
  if (type === 'smash') {
    chase.bump(0.9);
    quip(said.has('smash') ? pick(SMASH_LINES) : 'crumble! (it’ll tidy itself up) 🧱', { gap: 4 });
    said.add('smash');
  } else if (type === 'pop') {
    chase.bump(0.4);
    quip(said.has('pop') ? pick(['pop! 🎈', 'pfffrrrt 🎈', 'sorry, balloonist! 🪂']) : 'pop! (the balloonist has a parachute) 🪂', { gap: 2 });
    said.add('pop');
  } else if (type === 'rebuilt') {
    quip('good as new ✨', { once: 'rebuilt', gap: 2 });
  } else if (type === 'leaves') {
    chase.bump(data.big ? 0.35 : 0.15);
    if (data.big) quip('right through the big tree! 🍃', { once: 'canopy' });
  } else if (type === 'sheep') {
    quip('baa! 🐑', { once: 'sheep' });
  } else if (type === 'birds') {
    quip('sorry, birds 🐦', { once: 'birds' });
  } else if (type === 'cloud') {
    quip('into the clouds ☁️', { once: 'cloud', gap: 1 });
  }
}
const play = { flight, fx, sound, emit };

// ---- UI ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = {
  speed: $('hud-speed'),
  alt: $('hud-alt'),
  thr: $('hud-thr'),
  help: $('help'),
  toast: $('toast'),
  fade: $('fade'),
  title: $('title'),
  mist: $('mist'),
};
let toastTimer;
function toast(msg, ms = 2200) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
}
function flash() {
  ui.fade.style.transition = 'none';
  ui.fade.style.opacity = 1;
  requestAnimationFrame(() => {
    ui.fade.style.transition = 'opacity 1.2s ease';
    ui.fade.style.opacity = 0;
  });
}
let titleShown = true;
const hideTitle = () => {
  if (titleShown) ui.title.classList.add('gone');
  titleShown = false;
};

flight.onEvent = (type, data) => {
  if (type === 'crash') {
    touch.releaseThrottle();
    flash();
    if (data.what) toast(`bonk! the ${data.what} didn't budge 🌼`);
    else toast(data.kind === 'splash' ? 'splash! back to the airfield 💦' : 'bonk! back to the airfield 🌼');
    chase.first = true;
  } else if (type === 'takeoff') {
    toast('up, up and away ☁️');
    hideTitle();
  } else if (type === 'landed') {
    toast(data.vy > -2 ? 'buttery landing ✨' : 'touchdown!');
  }
};

let paused = false;
// Every action has a key on desktop and a button in the touch menu (☰).
const actions = [
  { key: 'KeyC', icon: '🎥', label: 'camera', run: () => chase.toggle() },
  {
    key: 'KeyT',
    icon: '☁️',
    label: 'into the sky',
    run: () => {
      flight.resetToAir();
      touch.releaseThrottle();
      chase.first = true;
      flash();
      hideTitle();
    },
  },
  {
    key: 'Enter',
    icon: '🛬',
    label: 'airfield',
    run: () => {
      flight.resetToRunway();
      touch.releaseThrottle();
      chase.first = true;
      flash();
    },
  },
  {
    key: 'KeyG',
    icon: '🕰️',
    label: 'pass time',
    run: () => {
      day.skip(3);
      toast('time passes… 🕰️');
    },
  },
  { key: 'KeyM', icon: '🔈', label: 'sound', run: () => toast(sound.toggleMute() ? 'sound off' : 'sound on') },
  { key: 'KeyN', icon: '🎹', label: 'music', run: () => toast(sound.toggleMusic() ? 'music on 🎻' : 'music off') },
  {
    key: 'KeyP',
    icon: '⏸️',
    label: 'pause',
    run: () => {
      paused = !paused;
      toast(paused ? 'paused' : 'unpaused');
    },
  },
  {
    key: 'KeyI',
    icon: '↕️',
    label: 'invert pitch',
    run: () => {
      input.invertPitch = !input.invertPitch;
      toast(input.invertPitch ? 'pitch: ↑ nose up' : 'pitch: ↑ nose down');
    },
  },
  { key: 'KeyH', run: () => ui.help.classList.toggle('hidden') }, // keyboard only
];
for (const a of actions) input.on(a.key, a.run);

const touch = new TouchControls({ actions, toast });
const interactions = createInteractions({ flight, fx, sound, buildings, trees, emit });
input.touch = touch;
if (touchFirst) touch.activate();

const startAudio = () => sound.start();
window.addEventListener('keydown', startAudio, { once: true });
window.addEventListener('pointerdown', startAudio, { once: true });
// iOS only lets audio start from the end of a tap
window.addEventListener('touchend', () => {
  sound.start();
  if (sound.ctx?.state !== 'running') sound.ctx?.resume();
});

window.addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---- Loop -------------------------------------------------------------------
let last = performance.now();
let lastPeriod = '';
let t = 0;
const shadowSnap = (2 * S) / SHADOW_RES;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  if (!paused) {
    t += dt;
    shared.uTime.value = t;
    const controls = input.read();
    if ((controls.throttle > 0 || controls.throttleTarget > 0) && titleShown && flight.onGround) setTimeout(hideTitle, 2500);
    // two physics substeps for smoothness
    for (let i = 0; i < 2; i++) flight.update(dt / 2, controls);

    plane.position.copy(flight.position);
    plane.quaternion.copy(flight.quaternion);
    plane.userData.animate(dt, t, flight);
    interactions.update(dt, t);
    clouds.userData.update(dt, play);
    airfield.userData.update(dt, t);
    buildings.userData.update(dt, t, flight);
    balloons.userData.update(dt, t, play);
    birds.userData.update(dt, t, play);
    countryside.userData.update(dt, t, play);
    fx.update(dt, t);
    const mist = clouds.userData.mist;
    ui.mist.style.opacity = mist > 0.01 ? Math.min(mist * 1.1, 0.6).toFixed(3) : 0;
    if (mist > 0.3) emit('cloud');
    smoke.userData.update(dt, t);
    traffic.userData.update(dt, t);
    boats.userData.update(dt, t);
  }
  if (!paused) {
    day.update(dt, camera);
    if (day.state.name !== lastPeriod) {
      if (lastPeriod) toast(day.state.name, 2600);
      lastPeriod = day.state.name;
    }
    sound.update(flight, dt, day.state.night);
  }
  touch.update(dt, flight);
  chase.update(dt, t, flight, input.consumeLook());
  sky.position.copy(camera.position);

  // keep the shadow frustum centred on the plane (snapped to texels to avoid shimmer)
  const c = flight.position;
  const sx = Math.round(c.x / shadowSnap) * shadowSnap;
  const sz = Math.round(c.z / shadowSnap) * shadowSnap;
  sun.target.position.set(sx, c.y, sz);
  sun.position.set(sx, c.y, sz).addScaledVector(day.lightDir, 500);

  // HUD
  ui.speed.textContent = Math.round(flight.speed * 1.944);
  ui.alt.textContent = Math.round(Math.max(0, flight.position.y - 1.75));
  ui.thr.style.width = `${Math.round(flight.throttle * 100)}%`;

  if (window.sim?.noPost) renderer.render(scene, camera);
  else post.render();
  requestAnimationFrame(frame);
}

// warm up every shader now (behind the card) rather than stuttering on the first frame
await step('warming up the engine…');
try {
  await renderer.compileAsync(scene, camera);
} catch (e) {
  console.warn('[sim] shader warm-up skipped', e);
}
ui.fade.style.opacity = 0;
frame();

// first frame is out: wait for a tap / click / key. That gesture is also what lets the
// browser (especially iOS Safari) start the sound.
await nextPaint();
const loader = document.getElementById('loader');
loader.classList.add('ready');
const go = () => {
  window.removeEventListener('keydown', swallowKeys, true);
  loader.removeEventListener('pointerup', go);
  sound.start();
  if (sound.ctx?.state !== 'running') sound.ctx?.resume();
  document.body.classList.add('started');
  loader.classList.add('gone');
  setTimeout(() => loader.remove(), 1600);
};
onLoaderKey = go;
loader.addEventListener('pointerup', go);

// handy for tinkering from the dev console
window.sim = { day, sound, scene, flight, plane, camera, renderer, chase, input, touch, LAYOUT, groundHeight, post, fx, interactions, balloons };
console.log(`[sim] ${trees.userData.count} trees, ${LAYOUT.houses.length} houses, ${LAYOUT.fields.length} fields`, countryside.userData.counts, `${traffic.userData.count} vehicles, ${boats.userData.count} boats, ${LAYOUT.bridges.length} bridges`);
