// Paints roads, cobbled streets and patchwork fields into a big canvas that the
// terrain shader lays over the ground. Hand-drawn feel > precision.
import * as THREE from 'three';
import { LAYOUT, REGION } from './layout.js';
import { RIVER } from './terrain.js';
import { mulberry32 } from '../noise.js';

export const CROP_COLOURS = {
  wheat: ['#ead27a', '#dcbc5c'],
  green: ['#9ccb5e', '#86b850'],
  pasture: ['#b4d670', '#a6cc66'],
  lavender: ['#a48ad8', '#8a74c4'],
  ploughed: ['#b08358', '#97704a'],
  rapeseed: ['#f4e04a', '#e6cd3a'],
  orchard: ['#a9d06a', '#9cc561'],
  sunflower: ['#f2c43a', '#7d9a3e'],
  meadow: ['#c4dc7c', '#b0d070'],
};

export function paintFeatures(res = 4096) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const g = canvas.getContext('2d');
  const k = res / REGION.size; // pixels per metre
  const X = (x) => (x - REGION.minX) * k;
  const Z = (z) => (z - REGION.minZ) * k;
  const rand = mulberry32(4242);

  // a small companion mask: how much each painted feature sways in the wind
  // (crops ripple, roads and cobbles don't)
  const SR = 1024;
  const sway = document.createElement('canvas');
  sway.width = sway.height = SR;
  const sg = sway.getContext('2d');
  const sk = SR / REGION.size;
  sg.fillStyle = '#000';
  sg.fillRect(0, 0, SR, SR);
  const SWAY = { wheat: 1, green: 0.8, pasture: 0.9, lavender: 0.8, ploughed: 0, rapeseed: 1, orchard: 0.4, sunflower: 0.6, meadow: 1 };

  // ---- fields ----------------------------------------------------------------
  for (const f of LAYOUT.fields) {
    const [base, stripe] = CROP_COLOURS[f.crop];
    sg.save();
    sg.translate((f.x - REGION.minX) * sk, (f.z - REGION.minZ) * sk);
    sg.rotate(f.angle);
    const sv = Math.round(SWAY[f.crop] * 255);
    sg.fillStyle = `rgb(${sv},${sv},${sv})`;
    sg.fillRect((-f.w / 2) * sk, (-f.d / 2) * sk, f.w * sk, f.d * sk);
    sg.restore();
    g.save();
    g.translate(X(f.x), Z(f.z));
    g.rotate(f.angle);
    const w = f.w * k;
    const d = f.d * k;
    // soft wobbly edge: slightly rounded rect
    g.beginPath();
    g.roundRect(-w / 2, -d / 2, w, d, 3 * k);
    g.fillStyle = base;
    g.fill();
    g.clip();
    // furrows / rows
    const spacing = (f.crop === 'pasture' || f.crop === 'meadow' ? 7 : f.crop === 'orchard' ? 9 : 3.2) * k;
    g.strokeStyle = stripe;
    g.globalAlpha = f.crop === 'pasture' ? 0.35 : f.crop === 'meadow' ? 0 : 0.75;
    g.lineWidth = spacing * (f.crop === 'lavender' ? 0.55 : 0.4);
    g.beginPath();
    if (f.stripe === 0) {
      for (let x = -w / 2; x < w / 2; x += spacing) {
        g.moveTo(x, -d / 2);
        g.lineTo(x, d / 2);
      }
    } else {
      for (let y = -d / 2; y < d / 2; y += spacing) {
        g.moveTo(-w / 2, y);
        g.lineTo(w / 2, y);
      }
    }
    g.stroke();
    g.globalAlpha = 1;
    // sunflower heads: dots of yellow on green
    if (f.crop === 'sunflower') {
      g.fillStyle = '#ffd23f';
      for (let i = 0; i < (f.w * f.d) / 6; i++) {
        g.beginPath();
        g.arc((rand() - 0.5) * w, (rand() - 0.5) * d, 0.7 * k, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (f.crop === 'meadow') {
      const cols = ['#ffffff', '#ffe27a', '#f7a8c4', '#c9a8f0'];
      for (let i = 0; i < (f.w * f.d) / 4; i++) {
        g.fillStyle = cols[Math.floor(rand() * cols.length)];
        g.fillRect((rand() - 0.5) * w, (rand() - 0.5) * d, 0.8 * k, 0.8 * k);
      }
    }
    // painterly blotches so fields aren't flat
    for (let i = 0; i < 14; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,250,220,0.10)' : 'rgba(90,70,40,0.07)';
      g.beginPath();
      g.ellipse((rand() - 0.5) * w, (rand() - 0.5) * d, (8 + rand() * 20) * k, (5 + rand() * 12) * k, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // darker trodden margin
    g.strokeStyle = 'rgba(110,90,50,0.35)';
    g.lineWidth = 1.6 * k;
    g.strokeRect(-w / 2, -d / 2, w, d);
    g.restore();
  }

  // ---- roads & streets -------------------------------------------------------
  const strokePath = (pts, width, colour, alpha = 1, dash = null) => {
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = colour;
    g.lineWidth = width * k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (dash) g.setLineDash(dash.map((v) => v * k));
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))));
    g.stroke();
    g.restore();
  };
  const offsetPath = (pts, off) =>
    pts.map((p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)];
      const o = pts[Math.max(i - 1, 0)];
      const dx = q.x - o.x;
      const dz = q.z - o.z;
      const l = Math.hypot(dx, dz) || 1;
      return { x: p.x - (dz / l) * off, z: p.z + (dx / l) * off };
    });

  // ---- riverbanks: damp grass, then pale gravel at the water's edge ----------
  const R = RIVER.points;
  const riverBand = (extra, colour, alpha) => {
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = colour;
    g.lineCap = 'round';
    for (let i = 0; i < R.length - 1; i++) {
      g.lineWidth = (RIVER.width[i] + extra) * 2 * k;
      g.beginPath();
      g.moveTo(X(R[i].x), Z(R[i].z));
      g.lineTo(X(R[i + 1].x), Z(R[i + 1].z));
      g.stroke();
    }
    g.restore();
  };
  riverBand(12, '#5f9550', 0.3);
  riverBand(5, '#a9ae84', 0.55);
  riverBand(2.5, '#d2c6a0', 0.85);
  sg.strokeStyle = '#000';
  for (let i = 0; i < R.length - 1; i++) {
    sg.lineWidth = (RIVER.width[i] + 10) * 2 * sk;
    sg.beginPath();
    sg.moveTo((R[i].x - REGION.minX) * sk, (R[i].z - REGION.minZ) * sk);
    sg.lineTo((R[i + 1].x - REGION.minX) * sk, (R[i + 1].z - REGION.minZ) * sk);
    sg.stroke();
  }

  for (const r of LAYOUT.roads) {
    strokePath(r.points, r.width + 2.5, '#9fb565', 0.45); // grassy verge
    strokePath(r.points, r.width + 0.8, '#b99e6a', 0.9); // edge
    strokePath(r.points, r.width, '#dcc493'); // packed earth
    if (r.width >= 4) {
      for (const s of [-1, 1]) strokePath(offsetPath(r.points, s * r.width * 0.22), 0.7, '#b8996a', 0.55); // wheel ruts
      strokePath(r.points, 0.9, '#a8be6a', 0.5, [3, 2]); // grass strip down the middle
    }
  }

  const cobbles = (pts, width) => {
    strokePath(pts, width + 1, '#a8937a');
    strokePath(pts, width, '#d8cbb4');
    strokePath(pts, width * 0.8, '#c9b89d', 0.6, [0.6, 0.9]);
  };
  for (const s of LAYOUT.streets) cobbles(s.points, s.width);

  // plaza: round cobbled square with a ring pattern
  const P = LAYOUT.plaza;
  g.fillStyle = '#a8937a';
  g.beginPath();
  g.arc(X(P.x), Z(P.z), (P.r + 1) * k, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ddd0b8';
  g.beginPath();
  g.arc(X(P.x), Z(P.z), P.r * k, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(160,140,115,0.6)';
  g.lineWidth = 0.5 * k;
  for (let r = 3; r < P.r; r += 2.2) {
    g.beginPath();
    g.arc(X(P.x), Z(P.z), r * k, 0, Math.PI * 2);
    g.stroke();
  }

  // little yards in front of each house
  for (const h of LAYOUT.houses) {
    g.fillStyle = 'rgba(214,200,170,0.55)';
    g.beginPath();
    g.arc(X(h.x + Math.sin(h.rot) * 5), Z(h.z + Math.cos(h.rot) * 5), 3.2 * k, 0, Math.PI * 2);
    g.fill();
  }

  // bare earth around landmarks
  for (const s of [LAYOUT.windmill, LAYOUT.lighthouse, ...LAYOUT.farms]) {
    g.fillStyle = 'rgba(212,190,140,0.8)';
    g.beginPath();
    g.arc(X(s.x), Z(s.z), 9 * k, 0, Math.PI * 2);
    g.fill();
  }

  // roads, streets and the plaza are still
  sg.strokeStyle = '#000';
  sg.lineCap = sg.lineJoin = 'round';
  for (const r of [...LAYOUT.roads, ...LAYOUT.streets]) {
    sg.lineWidth = (r.width + 3) * sk;
    sg.beginPath();
    r.points.forEach((p, i) => (i ? sg.lineTo : sg.moveTo).call(sg, (p.x - REGION.minX) * sk, (p.z - REGION.minZ) * sk));
    sg.stroke();
  }
  const swayTex = new THREE.CanvasTexture(sway);
  swayTex.flipY = false;
  swayTex.wrapS = swayTex.wrapT = THREE.ClampToEdgeWrapping;

  const tex = new THREE.CanvasTexture(canvas);
  tex.userData.sway = swayTex;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
