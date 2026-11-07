// The plane bumping into the world: houses and barns burst into toy blocks
// (and later tidy themselves back up), landmarks stay put, treetops shed
// leaves, and the prop wash ripples grass and water and kicks up petals and spray.
import * as THREE from 'three';
import { shared } from '../materials.js';
import { groundHeight, RIVER } from './terrain.js';

const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const sc = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

const REBUILD_AFTER = 14; // seconds of rubble before the village tidies up
const WASH_HEIGHT = 32; // the prop wash reaches the ground below this height (m)

// ---- Breakable buildings ----------------------------------------------------

/** Positions of every vertex of a building, so it can be hidden and put back. */
function snapshot(b) {
  b.orig = b.ranges.map((r) => r.mesh.geometry.attributes.position.array.slice(r.start * 3, (r.start + r.count) * 3));
  const ca = Math.cos(b.rot);
  const sa = Math.sin(b.rot);
  b.cx = b.x + b.ox * ca;
  b.cz = b.z - b.ox * sa;
  b.frame = new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.baseY, b.z), new THREE.Quaternion().setFromAxisAngle(UP, b.rot), new THREE.Vector3(1, 1, 1));
}

/** Squash/stretch the building about its base (0 = hidden). */
function setScale(b, sy, sxz) {
  const px = b.cx;
  const py = b.groundY;
  const pz = b.cz;
  b.ranges.forEach((r, k) => {
    const attr = r.mesh.geometry.attributes.position;
    const a = attr.array;
    const o = b.orig[k];
    const off = r.start * 3;
    for (let i = 0; i < o.length; i += 3) {
      a[off + i] = px + (o[i] - px) * sxz;
      a[off + i + 1] = py + (o[i + 1] - py) * sy;
      a[off + i + 2] = pz + (o[i + 2] - pz) * sxz;
    }
    attr.addUpdateRange(off, o.length);
    attr.needsUpdate = true;
  });
}

/** Lay out toy blocks that roughly rebuild the building's shape (in its local frame). */
function blockPlan(b) {
  const out = [];
  const C = b.colours;
  const add = (x, y, z, w, h, d, c, rx = 0) => out.push({ x, y, z, w, h, d, c, rx });
  const step = 2.4;
  const rowH = b.walls / Math.max(1, b.floors);
  // walls: a ring of bricks, row by row
  for (let row = 0; row < b.floors; row++) {
    const y = rowH * (row + 0.5);
    for (const side of [-1, 1]) {
      const nu = Math.max(2, Math.round((b.hw * 2) / step));
      for (let i = 0; i < nu; i++) {
        const u = -b.hw + (b.hw * 2 * (i + 0.5)) / nu;
        add(u + b.ox, y, side * (b.hd - 0.35), (b.hw * 2) / nu - 0.08, rowH - 0.08, 0.7, i % 3 === 1 && row % 2 === 0 ? C.shutter : C.wall);
      }
      const nv = Math.max(1, Math.round((b.hd * 2 - 1.4) / step));
      for (let i = 0; i < nv; i++) {
        const w = (b.hd * 2 - 1.4) / nv;
        const vv = -b.hd + 0.7 + w * (i + 0.5);
        add(side * (b.hw - 0.35) + b.ox, y, vv, 0.7, rowH - 0.08, w - 0.08, C.wall);
      }
    }
  }
  // gables
  for (const side of [-1, 1]) add(side * (b.hw - 0.35) + b.ox, b.walls + b.pitch * 0.35, 0, 0.7, b.pitch * 0.6, b.hd, C.wall);
  // roof tiles: slabs down each slope
  const ang = Math.atan2(b.pitch, b.hd);
  const slope = Math.hypot(b.hd, b.pitch) + 0.5;
  const nr = Math.max(2, Math.round((b.hw * 2 + 1) / 2.8));
  for (const side of [-1, 1]) {
    for (let i = 0; i < nr; i++) {
      const u = -b.hw - 0.5 + ((b.hw * 2 + 1) * (i + 0.5)) / nr;
      for (let k = 0; k < 2; k++) {
        const along = (k + 0.5) / 2;
        add(u + b.ox, b.walls + b.pitch * (1 - along) + 0.2, side * along * b.hd, (b.hw * 2 + 1) / nr - 0.1, 0.35, slope / 2 - 0.1, C.roof, side * ang);
      }
    }
  }
  if (b.chimney) {
    add(b.chimney.x, b.chimney.top - 1.6, b.chimney.z, 0.8, 1.5, 0.8, '#a8998a');
    add(b.chimney.x, b.chimney.top - 0.2, b.chimney.z, 1.0, 0.9, 1.0, '#a8998a');
  }
  if (b.turret) {
    for (let k = 0; k < 3; k++) add(b.turret.x, (b.turret.h / 3) * (k + 0.5), b.turret.z, 2.4, b.turret.h / 3 - 0.1, 2.4, k === 2 ? C.roof : C.wall);
  }
  if (b.silo) {
    for (let k = 0; k < 4; k++) add(b.silo.x, 1.25 + k * 2.5, b.silo.z, 3.6, 2.4, 3.6, k === 3 ? C.roof : C.silo);
  }
  // a couple of golden window panes, for sparkle
  for (let k = 0; k < 3; k++) add(rnd(-b.hw, b.hw) + b.ox, rnd(1, b.walls), b.hd * (k % 2 ? 1 : -1), 0.9, 1.1, 0.2, '#ffe2a0');
  return out;
}

export function createInteractions({ flight, fx, sound, buildings, trees, emit }) {
  const breakables = buildings.userData.breakables;
  breakables.forEach(snapshot);
  breakables.forEach((b) => (b.state = 'whole'));
  const solids = buildings.userData.solids;
  const sails = buildings.userData.sails;
  const canopy = buildings.userData.canopy;

  // trees in a coarse grid so we only test the few near the plane
  const CELL = 24;
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const t of trees.userData.list) {
    const k = key(t.x, t.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
  }
  const shaking = new Set();
  const cooling = new Set();

  const wash = shared.uWash.value;
  let washTimer = 0;
  let washSlot = 0;
  let kickTimer = 0;
  let canopyCooldown = 0;
  let solidGrace = 0;

  const vol = (p) => Math.max(0, 1 - p.distanceTo(flight.position) / 250);

  // ---- smash a building ------------------------------------------------------
  function smash(b, impact) {
    b.state = 'rubble';
    b.timer = REBUILD_AFTER;
    setScale(b, 0, 0);
    const vel = flight.velocity;
    b.blocks = blockPlan(b).map((blk) => {
      const home = {
        p: new THREE.Vector3(blk.x, blk.y, blk.z).applyMatrix4(b.frame),
        q: new THREE.Quaternion().setFromAxisAngle(UP, b.rot).multiply(q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), blk.rx)),
      };
      const out = v.copy(home.p).sub(impact);
      out.y = Math.max(out.y, 0) + 2;
      out.normalize();
      const kick = v2.copy(out).multiplyScalar(rnd(4, 11)).addScaledVector(vel, rnd(0.25, 0.55));
      kick.y += rnd(4, 10);
      return fx.block(home.p, kick, new THREE.Vector3(blk.w, blk.h, blk.d), blk.c, home);
    });
    // a cartoon "poof" of dust where it stood, plus a few flying shutters and flowers
    v.set(b.cx, b.baseY + b.walls * 0.5, b.cz);
    fx.puff(v, { n: 10, colour: ['#f4efe8', '#efe3cf', '#e8dccb'], size: 2.4, spread: Math.max(b.hw, b.hd), speed: 6, life: 1.6, up: 0.4 });
    fx.flutter(v, { n: 26, colours: [b.colours.shutter, '#f2869e', '#ffd166', '#fbf8f0'], size: 0.7, speed: 12, spread: 3, life: 5, vel: v2.copy(vel).multiplyScalar(0.3) });
    sound.crumble?.(vol(v));
    // the plane ploughs on, a little slower and a little rattled
    flight.speed *= 0.8;
    emit('smash', { building: b });
  }

  function rebuild(b, dt) {
    if (b.state === 'rubble') {
      b.timer -= dt;
      // wait until you've moved on a little so you can watch it happen
      const away = Math.hypot(flight.position.x - b.cx, flight.position.z - b.cz) > 40;
      if (b.timer > 0 || !away) return;
      b.state = 'gathering';
      b.timer = 2.4;
      b.blocks.forEach((h) => fx.sendHome(h, rnd(0, 0.7), 1.4));
      v.set(b.cx, b.baseY + 2, b.cz);
      sound.rebuild?.(vol(v));
    } else if (b.state === 'gathering') {
      b.timer -= dt;
      if (b.timer > 0) return;
      b.blocks.forEach((h) => fx.drop(h));
      b.blocks = null;
      b.state = 'boing';
      b.timer = 0;
      v.set(b.cx, b.baseY + b.walls, b.cz);
      fx.flutter(v, { n: 22, colours: ['#fff3c0', '#ffe27a', '#ffffff'], size: 0.35, speed: 7, spread: b.hw, life: 2.2, gravity: 0.5 });
      emit('rebuilt', { building: b });
    } else if (b.state === 'boing') {
      // squash and stretch back into shape
      b.timer += dt;
      const k = Math.min(b.timer / 0.8, 1);
      const wob = Math.sin(k * Math.PI * 3) * (1 - k);
      setScale(b, 1 + wob * 0.16, 1 - wob * 0.07);
      if (k >= 1) {
        setScale(b, 1, 1);
        b.state = 'whole';
      }
    }
  }

  /** Is point p inside building b's box-with-a-roof (plus a margin for the wings)? */
  function hits(b, p) {
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const r = b.hw + b.hd + 8;
    if (dx * dx + dz * dz > r * r) return false;
    const ca = Math.cos(b.rot);
    const sa = Math.sin(b.rot);
    const u = dx * ca - dz * sa - b.ox;
    const w = dx * sa + dz * ca;
    const M = 2.6;
    if (Math.abs(u) > b.hw + M || Math.abs(w) > b.hd + M) return false;
    const y = p.y - b.baseY;
    const roof = b.walls + b.pitch * Math.max(0, 1 - Math.abs(w) / b.hd);
    const tall = Math.max(roof, b.chimney ? b.chimney.top : 0, b.turret?.h ?? 0, b.silo?.h ?? 0);
    return y < (Math.abs(w) < b.hd ? tall : b.walls) + 1.2 && y > b.groundY - b.baseY - 2;
  }

  // ---- trees -----------------------------------------------------------------
  function shake(t, dir) {
    t.shake = 1;
    t.shakeDir = Math.atan2(dir.x, dir.z);
    shaking.add(t);
  }

  function updateShakes(dt, time) {
    for (const t of shaking) {
      t.shake = Math.max(0, t.shake - dt * 0.9);
      const tilt = Math.sin(time * 16) * 0.16 * t.shake * t.shake;
      // tip over along the direction the plane went, around the base
      q2.setFromAxisAngle(v.set(Math.cos(t.shakeDir), 0, -Math.sin(t.shakeDir)), tilt);
      q.setFromAxisAngle(UP, t.rot).premultiply(q2);
      m4.compose(v.set(t.x, t.y - 0.3, t.z), q, sc.setScalar(t.scale));
      for (const r of t.refs) {
        r.mesh.setMatrixAt(r.i, m4);
        r.mesh.instanceMatrix.needsUpdate = true;
      }
      if (t.shake <= 0) shaking.delete(t);
    }
  }

  function brushTrees(p) {
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = grid.get(`${cx + i},${cz + j}`);
        if (!list) continue;
        for (const t of list) {
          if (t.cool > 0) continue;
          const pine = t.kind === 'pine';
          const cy = t.y - 0.3 + (pine ? 5 : 4.4) * t.scale;
          const rr = (pine ? 2.4 : 3.2) * t.scale + 1.8;
          const dx = p.x - t.x;
          const dy = (p.y - cy) * (pine ? 0.6 : 0.9);
          const dz = p.z - t.z;
          if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
          t.cool = 2.5;
          cooling.add(t);
          const leaf = new THREE.Color(t.colour);
          const cols = ['#' + leaf.getHexString(), '#' + leaf.clone().offsetHSL(0, 0, 0.1).getHexString(), '#' + leaf.clone().offsetHSL(0.02, 0, -0.08).getHexString()];
          fx.flutter(v.set(t.x, cy, t.z), { n: pine ? 22 : 38, colours: cols, size: 0.6, speed: 9, spread: rr * 0.6, life: 5, vel: v2.copy(flight.velocity).multiplyScalar(0.35) });
          shake(t, flight.velocity);
          flight.speed *= 0.97;
          sound.rustle?.(1);
          emit('leaves');
        }
      }
    }
  }

  // ---- prop wash: ripples, petals and spray ----------------------------------
  function propWash(dt, P, ground, waterLevel) {
    const surface = Math.max(ground, waterLevel);
    const agl = P.y - surface;
    const strength = THREE.MathUtils.clamp(1 - agl / WASH_HEIGHT, 0, 1) * THREE.MathUtils.clamp((flight.speed - 4) / 20, 0, 1) * (0.5 + flight.throttle * 0.5);
    shared.uPlaneWash.value.set(P.x, P.y, P.z, strength);

    // footprints: rings that spread out from under the plane
    for (const w of wash) w.z += dt;
    washTimer -= dt;
    if (washTimer <= 0 && strength > 0.04) {
      washTimer = 0.22;
      wash[washSlot].set(P.x, P.z, 0, strength);
      washSlot = (washSlot + 1) % wash.length;
    }

    // things kicked up when you really skim the surface
    kickTimer -= dt;
    if (agl < 9 && flight.speed > 12 && kickTimer <= 0) {
      const k = 1 - agl / 9;
      kickTimer = 0.05 / (0.3 + k);
      const back = v2.copy(flight.velocity).multiplyScalar(-0.15);
      const spot = v.set(P.x + rnd(-3, 3), surface + 0.3, P.z + rnd(-3, 3));
      if (ground < waterLevel) {
        // spray off the water
        fx.puff(spot, { n: 3, colour: ['#ffffff', '#e8f6f8'], size: 0.3 + k * 0.3, speed: 3, up: 1.5, rise: 2 + k * 3, life: 0.7, vel: back, spread: 2.5 });
      } else if (ground < 160) {
        // grass bits and petals
        fx.flutter(spot, { n: 3, colours: ['#93c25a', '#7fb552', '#bccd6c', '#ffe27a', '#f7a8c4', '#ffffff'], size: 0.45, speed: 5, up: 1.4, life: 2.5, vel: back, gravity: 1.5, spread: 3 });
      }
    }
  }

  // ---- solid landmarks -------------------------------------------------------
  function bonk(p, what) {
    if (solidGrace > 0) return false;
    fx.puff(p, { n: 12, colour: ['#ffffff', '#fff3d6'], size: 2, speed: 8, life: 1.2 });
    solidGrace = 1.5;
    flight.crash('bonk', what);
    return true;
  }

  function checkSolids(P) {
    for (const s of solids) {
      const dx = P.x - s.x;
      const dz = P.z - s.z;
      if (dx * dx + dz * dz < (s.r + 2.2) ** 2 && P.y > s.bottom && P.y < s.top + 1) return bonk(P.clone(), s.name);
    }
    if (sails) {
      v.copy(P).sub(sails.hub);
      const along = v.dot(sails.facing);
      if (Math.abs(along) < 2.4 && v.addScaledVector(sails.facing, -along).length() < sails.r) return bonk(P.clone(), "windmill's sails");
    }
    return false;
  }

  let canopyIn = false;
  return {
    update(dt, time) {
      const P = flight.position;
      solidGrace -= dt;
      const ground = groundHeight(P.x, P.z);
      const rq = RIVER.query(P.x, P.z);
      const waterLevel = rq && rq.d < rq.width ? rq.level : 0;
      propWash(dt, P, ground, waterLevel);

      for (const t of cooling) {
        t.cool -= dt;
        if (t.cool <= 0) cooling.delete(t);
      }
      updateShakes(dt, time);
      for (const b of breakables) if (b.state !== 'whole') rebuild(b, dt);

      if (P.y - ground > 60) return; // nothing to bump into up here
      if (checkSolids(P)) return;
      for (const b of breakables) {
        if (b.state === 'whole' && hits(b, P)) smash(b, P);
      }
      if (P.y - ground < 25) brushTrees(P);

      // the giant tree's canopy: a big leafy whoosh (once per pass)
      canopyCooldown -= dt;
      const inCanopy = canopy && P.distanceTo(canopy.p) < canopy.r;
      if (inCanopy && !canopyIn && canopyCooldown <= 0) {
        canopyCooldown = 1;
        fx.flutter(P, { n: 60, colours: canopy.colours, size: 0.6, speed: 12, spread: 4, life: 6 });
        sound.rustle?.(1.5);
        flight.speed *= 0.92;
        emit('leaves', { big: true });
      }
      canopyIn = inCanopy;
    },

    /** Dev helper: knock down building i (or the nearest one). */
    smash(i) {
      const P = flight.position;
      const dist = (b) => Math.hypot(b.cx - P.x, b.cz - P.z);
      const b = breakables[i] ?? breakables.reduce((a, c) => (dist(c) < dist(a) ? c : a));
      if (b.state === 'whole') smash(b, new THREE.Vector3(b.cx, b.baseY + 2, b.cz + 3));
      return b;
    },
    breakables,
  };
}
