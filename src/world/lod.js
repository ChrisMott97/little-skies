// Distance detail for instanced scenery: each tile of trees / bushes gets a low-poly stand-in that
// takes over once the whole tile is far from the camera. The stand-in shares the original's
// instance matrices and colours (same GPU buffers), so anything that moves an instance — a tree
// shaken by the prop wash — moves both.
import * as THREE from 'three';

// `simpleShadows` (phones): shadows come from the simple shapes everywhere, via a copy that only
// the sun's shadow camera can see (main.js enables SHADOW_ONLY_LAYER on it).
export const LOD = { distance: 1400, simpleShadows: false };
export const SHADOW_ONLY_LAYER = 2;
const tiles = [];

function twin(mesh, geo) {
  const m = new THREE.InstancedMesh(geo, mesh.material, 1);
  m.instanceMatrix = mesh.instanceMatrix;
  m.instanceColor = mesh.instanceColor;
  m.count = mesh.count;
  m.receiveShadow = mesh.receiveShadow;
  if (!mesh.boundingSphere) mesh.computeBoundingSphere();
  m.boundingSphere = mesh.boundingSphere.clone();
  return m;
}

/** Pair `mesh` with `farGeo`, drawn instead of it beyond LOD.distance. Returns the meshes to add. */
export function withFarLod(mesh, farGeo) {
  const far = twin(mesh, farGeo);
  far.visible = false;
  tiles.push({ near: mesh, far, sphere: mesh.boundingSphere });
  if (!LOD.simpleShadows || !mesh.castShadow) {
    far.castShadow = mesh.castShadow;
    return [far];
  }
  const caster = twin(mesh, farGeo);
  caster.castShadow = true;
  caster.layers.set(SHADOW_ONLY_LAYER);
  mesh.castShadow = false;
  far.castShadow = false;
  return [far, caster];
}

/** Call once a frame after the camera has moved. */
export function updateLod(camPos) {
  for (const t of tiles) {
    const near = t.sphere.center.distanceTo(camPos) - t.sphere.radius < LOD.distance;
    t.near.visible = near;
    t.far.visible = !near;
  }
}
