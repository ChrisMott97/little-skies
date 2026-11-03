import * as THREE from 'three';
import { toon, celRamp, addOutlines, shared } from '../materials.js';
import { WORLD, groundHeight } from './terrain.js';

function runwayTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 1024;
  const g = c.getContext('2d');
  // packed earth strip with soft grassy edges
  g.fillStyle = '#d9c38e';
  g.fillRect(0, 0, 128, 1024);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(170,140,90,0.18)' : 'rgba(255,245,210,0.18)';
    const r = 1 + Math.random() * 3;
    g.beginPath();
    g.arc(Math.random() * 128, Math.random() * 1024, r, 0, Math.PI * 2);
    g.fill();
  }
  // grass creeping in at the edges
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(140,190,90,1)');
  grad.addColorStop(0.12, 'rgba(140,190,90,0)');
  grad.addColorStop(0.88, 'rgba(140,190,90,0)');
  grad.addColorStop(1, 'rgba(140,190,90,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 1024);
  // dashed centre line
  g.fillStyle = 'rgba(255,252,240,0.9)';
  for (let y = 60; y < 964; y += 56) g.fillRect(61, y, 6, 28);
  // threshold stripes
  for (const y of [14, 990]) for (let x = 22; x < 110; x += 16) g.fillRect(x, y, 8, 22);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function hangar(m) {
  const g = new THREE.Group();
  // Quonset-style rounded roof
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 22, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2),
    m.roof
  );
  roof.material = roof.material.clone();
  roof.material.side = THREE.DoubleSide;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  const front = new THREE.Mesh(new THREE.CircleGeometry(8.9, 24, 0, Math.PI), m.cream);
  front.position.set(11, 0, 0);
  front.rotation.y = Math.PI / 2;
  g.add(front);
  const back = front.clone();
  back.position.x = -11;
  back.rotation.y = -Math.PI / 2;
  g.add(back);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.5), m.wood);
  door.position.set(11.05, 3.25, 0);
  door.rotation.y = Math.PI / 2;
  g.add(door);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 6), m.teal);
  sign.position.set(11.1, 7.4, 0);
  g.add(sign);
  return g;
}

function cottage(m) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), m.cream);
  body.position.y = 2.5;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-4.8, 0);
  roofShape.lineTo(0, 3.6);
  roofShape.lineTo(4.8, 0);
  roofShape.lineTo(-4.8, 0);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 7, bevelEnabled: false }).translate(0, 0, -3.5);
  const roof = new THREE.Mesh(roofGeo, m.roofTeal);
  roof.position.y = 5;
  roof.castShadow = true;
  g.add(roof);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), m.brick);
  chimney.position.set(2, 7.6, 1.2);
  chimney.castShadow = true;
  g.add(chimney);
  for (const x of [-2.2, 2.2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), m.window);
    win.position.set(x, 2.8, 3.01);
    g.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), m.wood);
  door.position.set(0, 1.2, 3.01);
  g.add(door);
  return g;
}

function windsock(m) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 8, 8), m.cream);
  pole.position.y = 4;
  pole.castShadow = true;
  g.add(pole);
  const sock = new THREE.Group();
  sock.position.y = 7.6;
  const stripes = 4;
  for (let i = 0; i < stripes; i++) {
    const r0 = 0.6 - i * 0.09;
    const r1 = 0.6 - (i + 1) * 0.09;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 0.9, 12, 1, true), i % 2 ? m.cream : m.orange);
    seg.rotation.z = Math.PI / 2;
    seg.position.x = 0.45 + i * 0.9;
    seg.userData.outline = false;
    sock.add(seg);
  }
  g.add(sock);
  g.userData.sock = sock;
  return g;
}

export function createAirfield() {
  const af = WORLD.airfield;
  const group = new THREE.Group();
  group.name = 'airfield';

  const m = {
    roof: toon({ color: '#d9644f' }),
    roofTeal: toon({ color: '#4c9a96' }),
    cream: toon({ color: '#f5ead2' }),
    wood: toon({ color: '#9a6a44' }),
    teal: toon({ color: '#3f8f8c' }),
    brick: toon({ color: '#b5654d' }),
    orange: toon({ color: '#f08a4b', side: THREE.DoubleSide }),
    window: toon({ color: '#ffe9a8', emissive: '#6b5420' }),
    white: toon({ color: '#ffffff' }),
  };

  // Runway strip, laid just above the flattened ground
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(af.runwayWidth, af.runwayLength).rotateX(-Math.PI / 2),
    new THREE.MeshToonMaterial({
      map: runwayTexture(),
      gradientMap: celRamp,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  runway.position.set(af.x, af.height + 0.03, af.z);
  runway.receiveShadow = true;
  runway.userData.outline = false;
  group.add(runway);

  // Little white edge markers
  const markerGeo = new THREE.ConeGeometry(0.35, 0.7, 6);
  const markers = new THREE.InstancedMesh(markerGeo, m.white, 44);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 22; i++) {
    const z = af.z - af.runwayLength / 2 + 10 + i * ((af.runwayLength - 20) / 21);
    for (const side of [-1, 1]) {
      m4.makeTranslation(af.x + side * (af.runwayWidth / 2 + 1.5), af.height + 0.35, z);
      markers.setMatrixAt(n++, m4);
    }
  }
  group.add(markers);

  const place = (obj, x, z, rotY = 0) => {
    obj.position.set(af.x + x, groundHeight(af.x + x, af.z + z), af.z + z);
    obj.rotation.y = rotY;
    obj.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    group.add(obj);
    return obj;
  };

  place(hangar(m), -42, 140, 0);
  place(cottage(m), -48, 70, Math.PI / 2);
  const sock = place(windsock(m), 22, 110, 0);

  // Fuel barrels
  const barrelGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 12);
  for (const [x, z, c] of [[-28, 128, m.roof], [-27, 130, m.teal], [-29.5, 131, m.roof]]) {
    const b = new THREE.Mesh(barrelGeo, c);
    b.position.y = 0.7;
    place(b, x, z);
  }

  // Fence along the cottage garden
  const postGeo = new THREE.BoxGeometry(0.2, 1.2, 0.2);
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(postGeo, m.cream);
    p.position.y = 0.6;
    place(p, -34, 50 + i * 3.5);
  }

  addOutlines(group, 0.06);

  group.userData.update = (dt, t) => {
    // wind sock lazily swinging
    const s = sock.userData.sock;
    s.rotation.y = Math.sin(t * 0.4) * 0.5 + 0.6;
    s.rotation.z = -0.15 + Math.sin(t * 1.7) * 0.05;
  };

  return group;
}
