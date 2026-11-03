import * as THREE from 'three';
import { toon, addOutlines } from '../materials.js';

// The plane faces -Z (forward), +Y is up, +X is the right wing.
// Origin is roughly the centre of the fuselage; wheels touch down at y = -GEAR_HEIGHT.
export const GEAR_HEIGHT = 1.75;

const PALETTE = {
  body: '#f6ead2', // cream
  wing: '#e8735c', // soft coral
  trim: '#3f8f8c', // teal
  wood: '#b07a45',
  tyre: '#4a3a3d',
  skin: '#f7d2b4',
  leather: '#8a5a3a',
  scarf: '#e94f4f',
  glass: '#cfeff5',
};

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A soft, pillowy flat panel (wing, fin...) lying in the XZ plane. */
function panel(w, d, thickness, radius) {
  const geo = new THREE.ExtrudeGeometry(roundedRect(w, d, radius), {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.6,
    bevelSize: Math.min(radius * 0.5, thickness * 0.9),
    bevelSegments: 4,
    curveSegments: 10,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function createPlane() {
  const m = Object.fromEntries(
    Object.entries(PALETTE).map(([k, c]) => [k, toon({ color: c, rim: 0.5 })])
  );
  m.glass = new THREE.MeshToonMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.45 });

  const plane = new THREE.Group();
  plane.name = 'plane';
  const parts = {};

  // ---- Fuselage: a chubby lathed teardrop -------------------------------
  const profile = [
    [0.0, 3.05], [0.45, 3.0], [0.78, 2.8], [0.95, 2.4], [1.0, 1.7], [0.98, 0.8],
    [0.88, -0.2], [0.68, -1.4], [0.45, -2.5], [0.24, -3.3], [0.1, -3.6], [0.0, -3.65],
  ].map(([r, y]) => new THREE.Vector2(r, y)).reverse(); // lathe wants bottom→top for outward faces
  const fuseGeo = new THREE.LatheGeometry(profile, 28).rotateX(-Math.PI / 2);
  const fuselage = new THREE.Mesh(fuseGeo, m.body);
  plane.add(fuselage);

  // Cowling ring + spinner
  const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.2, 12, 28), m.trim);
  cowl.position.z = -2.55;
  plane.add(cowl);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.07, 8, 28), m.wing);
  stripe.position.z = -0.9;
  stripe.scale.set(1.28, 1.28, 1);
  plane.add(stripe);

  const prop = new THREE.Group();
  prop.position.z = -3.15;
  const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12).scale(1, 1, 1.4), m.wing);
  prop.add(spinner);
  const bladeGeo = new THREE.SphereGeometry(1, 12, 8).scale(0.16, 1.45, 0.06);
  for (const s of [1, -1]) {
    const blade = new THREE.Mesh(bladeGeo, m.wood);
    blade.position.y = s * 1.3;
    blade.rotation.y = s * 0.25;
    prop.add(blade);
  }
  // motion-blur disc shown at speed
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.75, 32),
    new THREE.MeshLambertMaterial({ color: '#fff7e6', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }) // lit, so it doesn't glow at night
  );
  disc.position.z = -0.05;
  disc.userData.outline = false;
  prop.add(disc);
  plane.add(prop);
  parts.prop = prop;
  parts.disc = disc;

  // ---- Wings (biplane!) -----------------------------------------------
  const wingGeo = panel(10.5, 1.9, 0.18, 0.85);
  const topWing = new THREE.Mesh(wingGeo, m.wing);
  topWing.position.set(0, 1.85, -0.9);
  plane.add(topWing);
  const lowWing = new THREE.Mesh(panel(9.2, 1.75, 0.18, 0.8), m.wing);
  lowWing.position.set(0, -0.55, -0.55);
  plane.add(lowWing);

  // ailerons on the top wing
  parts.ailerons = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 3.6, 1.85, 0.05);
    const flap = new THREE.Mesh(panel(2.4, 0.5, 0.1, 0.2), m.trim);
    flap.position.z = 0.25;
    pivot.add(flap);
    pivot.userData.side = s;
    plane.add(pivot);
    parts.ailerons.push(pivot);
  }

  // interplane struts + cabane struts
  const strutGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8);
  for (const sx of [-3.8, 3.8]) {
    for (const sz of [-1.4, -0.2]) {
      const s = new THREE.Mesh(strutGeo, m.trim);
      s.position.set(sx, 0.65, sz);
      plane.add(s);
    }
  }
  const cabGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8);
  for (const sx of [-0.7, 0.7]) {
    for (const sz of [-1.5, -0.4]) {
      const s = new THREE.Mesh(cabGeo, m.trim);
      s.position.set(sx, 1.3, sz);
      s.rotation.z = sx > 0 ? -0.35 : 0.35;
      plane.add(s);
    }
  }

  // ---- Tail -------------------------------------------------------------
  const stab = new THREE.Mesh(panel(3.8, 1.0, 0.12, 0.45), m.wing);
  stab.position.set(0, 0.15, 3.0);
  plane.add(stab);
  const elevator = new THREE.Group();
  elevator.position.set(0, 0.15, 3.45);
  const elevMesh = new THREE.Mesh(panel(3.4, 0.55, 0.08, 0.25), m.trim);
  elevMesh.position.z = 0.3;
  elevator.add(elevMesh);
  plane.add(elevator);
  parts.elevator = elevator;

  const finGeo = panel(1.5, 1.3, 0.12, 0.55);
  finGeo.rotateZ(Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, m.wing);
  fin.position.set(0, 1.0, 3.05);
  plane.add(fin);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0.95, 3.65);
  const rudMesh = new THREE.Mesh(panel(1.3, 0.55, 0.08, 0.25).rotateZ(Math.PI / 2), m.trim);
  rudMesh.position.z = 0.28;
  rudder.add(rudMesh);
  plane.add(rudder);
  parts.rudder = rudder;

  // ---- Landing gear ----------------------------------------------------
  const tyreGeo = new THREE.TorusGeometry(0.42, 0.2, 12, 20).rotateY(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 14).rotateZ(Math.PI / 2);
  const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8);
  parts.wheels = [];
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(legGeo, m.trim);
    leg.position.set(s * 0.75, -0.95, -1.25);
    leg.rotation.z = s * 0.45;
    plane.add(leg);
    const wheel = new THREE.Group();
    wheel.position.set(s * 1.05, -GEAR_HEIGHT + 0.62, -1.25);
    wheel.add(new THREE.Mesh(tyreGeo, m.tyre));
    wheel.add(new THREE.Mesh(hubGeo, m.body));
    plane.add(wheel);
    parts.wheels.push(wheel);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6).rotateZ(Math.PI / 2), m.trim);
  axle.position.set(0, -GEAR_HEIGHT + 0.62, -1.25);
  plane.add(axle);
  // little tail wheel
  const tailLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), m.trim);
  tailLeg.position.set(0, -0.95, 3.0);
  tailLeg.rotation.x = 0.3;
  plane.add(tailLeg);
  const tailWheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.09, 8, 14).rotateY(Math.PI / 2), m.tyre);
  tailWheel.position.set(0, -GEAR_HEIGHT + 0.26, 3.2);
  plane.add(tailWheel);

  // ---- Pilot ----------------------------------------------------------
  const pilot = new THREE.Group();
  pilot.position.set(0, 1.0, 0.75);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), m.skin);
  pilot.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m.leather);
  cap.position.y = 0.03;
  pilot.add(cap);
  for (const s of [1, -1]) {
    const goggle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 8, 16), m.trim);
    goggle.position.set(s * 0.15, 0.2, -0.36);
    goggle.rotation.x = -0.3;
    pilot.add(goggle);
  }
  // scarf that flutters behind
  const scarf = new THREE.Group();
  scarf.position.set(0.1, -0.35, 0.3);
  const scarfGeo = new THREE.BoxGeometry(0.22, 0.05, 1.3, 1, 1, 6).translate(0, 0, 0.65);
  const scarfMesh = new THREE.Mesh(scarfGeo, m.scarf);
  scarfMesh.userData.outline = false;
  scarf.add(scarfMesh);
  pilot.add(scarf);
  plane.add(pilot);
  parts.scarf = scarf;
  parts.pilot = pilot;

  // windscreen
  const screen = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 16, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.18, Math.PI * 0.3),
    m.glass
  );
  screen.rotation.y = Math.PI;
  screen.position.set(0, 0.55, 0.15);
  screen.userData.outline = false;
  plane.add(screen);

  plane.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  disc.castShadow = false;
  screen.castShadow = false;

  addOutlines(plane, 0.035);

  /** Animate moving parts from the flight state. */
  function animate(dt, t, state) {
    const rpm = 6 + state.throttle * 70;
    prop.rotation.z += rpm * dt;
    disc.material.opacity = THREE.MathUtils.clamp((rpm - 25) / 60, 0, 0.35);
    for (const b of prop.children) if (b !== disc && b !== spinner) b.visible = rpm < 55;

    elevator.rotation.x = -state.pitchIn * 0.45;
    rudder.rotation.y = state.yawIn * 0.5;
    for (const a of parts.ailerons) a.rotation.x = -state.rollIn * 0.4 * a.userData.side;

    const roll = state.onGround ? state.speed * dt / 0.62 : 0;
    for (const w of parts.wheels) w.rotation.x -= roll;

    const flap = Math.min(state.speed / 40, 1.2);
    scarf.rotation.x = -0.15 + Math.sin(t * 14) * 0.12 * flap - flap * 0.1;
    scarf.rotation.y = Math.sin(t * 9 + 1) * 0.25 * flap;
    pilot.rotation.y = -state.rollIn * 0.25;
  }

  plane.userData.animate = animate;
  plane.userData.parts = parts;
  return plane;
}
