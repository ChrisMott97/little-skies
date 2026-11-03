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
import { Sound } from './audio.js';

// ---- Renderer -----------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY.haze, 350, 5200);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 20000);

// ---- Light: golden late-afternoon sun, lavender sky fill, warm ground bounce --
const sunDir = new THREE.Vector3(-0.6, 0.45, 0.55).normalize();
const hemi = new THREE.HemisphereLight('#c6dcf4', '#a9b98a', 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d6', 2.55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const S = 150;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 1200 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// ---- World ------------------------------------------------------------------
const sky = createSky(sunDir);
scene.add(sky);
const terrain = createTerrain(paintFeatures(), REGION, sunDir);
scene.add(terrain);
const water = createWater(sunDir);
scene.add(water);
const clouds = createClouds(sunDir);
scene.add(clouds);
const trees = createTrees();
scene.add(trees);
scene.add(createFlowers());
const airfield = createAirfield();
scene.add(airfield);
const buildings = createBuildings();
scene.add(buildings);
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
const post = createPost(renderer, scene, camera);
const day = createDayCycle({ scene, sun, hemi, sky, clouds, water, terrain, post, lamps: buildings.userData.lamps });

// ---- Plane ------------------------------------------------------------------
const plane = createPlane();
scene.add(plane);
const flight = new FlightModel();
const chase = new ChaseCamera(camera);
const input = new Input(canvas);
const sound = new Sound();

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
    flash();
    toast(data.kind === 'splash' ? 'splash! back to the airfield 💦' : 'bonk! back to the airfield 🌼');
    chase.first = true;
  } else if (type === 'takeoff') {
    toast('up, up and away ☁️');
    hideTitle();
  } else if (type === 'landed') {
    toast(data.vy > -2 ? 'buttery landing ✨' : 'touchdown!');
  }
};

let paused = false;
input.on('KeyC', () => chase.toggle());
input.on('KeyH', () => ui.help.classList.toggle('hidden'));
input.on('KeyM', () => toast(sound.toggleMute() ? 'sound off' : 'sound on'));
input.on('KeyG', () => {
  day.skip(3);
  toast('time passes… 🕰️');
});
input.on('KeyN', () => toast(sound.toggleMusic() ? 'music on 🎻' : 'music off'));
input.on('KeyP', () => {
  paused = !paused;
  toast(paused ? 'paused' : 'unpaused');
});
input.on('KeyI', () => {
  input.invertPitch = !input.invertPitch;
  toast(input.invertPitch ? 'pitch: ↑ nose up' : 'pitch: ↑ nose down');
});
input.on('KeyT', () => {
  flight.resetToAir();
  chase.first = true;
  flash();
  hideTitle();
});
input.on('Enter', () => {
  flight.resetToRunway();
  chase.first = true;
  flash();
});
const startAudio = () => sound.start();
window.addEventListener('keydown', startAudio, { once: true });
window.addEventListener('pointerdown', startAudio, { once: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---- Loop -------------------------------------------------------------------
let last = performance.now();
let lastPeriod = '';
let t = 0;
const shadowSnap = (2 * S) / 2048;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  if (!paused) {
    t += dt;
    shared.uTime.value = t;
    const controls = input.read();
    if (controls.throttle > 0 && titleShown && flight.onGround) setTimeout(hideTitle, 2500);
    // two physics substeps for smoothness
    for (let i = 0; i < 2; i++) flight.update(dt / 2, controls);

    plane.position.copy(flight.position);
    plane.quaternion.copy(flight.quaternion);
    plane.userData.animate(dt, t, flight);
    clouds.userData.update(dt);
    airfield.userData.update(dt, t);
    buildings.userData.update(dt, t);
    balloons.userData.update(dt, t);
    birds.userData.update(dt, t);
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

// fade in once the first frame is ready
requestAnimationFrame(() => {
  ui.fade.style.opacity = 0;
});
frame();

// handy for tinkering from the dev console
window.sim = { day, sound, scene, flight, plane, camera, renderer, chase, LAYOUT, groundHeight, post };
console.log(`[sim] ${trees.userData.count} trees, ${LAYOUT.houses.length} houses, ${LAYOUT.fields.length} fields`, countryside.userData.counts, `${traffic.userData.count} vehicles, ${boats.userData.count} boats, ${LAYOUT.bridges.length} bridges`);
