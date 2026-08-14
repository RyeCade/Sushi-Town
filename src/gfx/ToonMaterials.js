import * as THREE from 'three';

/** Shared 4-step cel gradient (dark → mid → light → highlight). */
let _gradientMap = null;

export function getToonGradientMap() {
  if (_gradientMap) return _gradientMap;
  const data = new Uint8Array([
    80, 80, 80, 255,
    140, 140, 140, 255,
    200, 200, 200, 255,
    255, 255, 255, 255
  ]);
  _gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  _gradientMap.minFilter = THREE.NearestFilter;
  _gradientMap.magFilter = THREE.NearestFilter;
  _gradientMap.generateMipmaps = false;
  _gradientMap.needsUpdate = true;
  return _gradientMap;
}

/**
 * Create a MeshToonMaterial with optional map / emissive.
 * @param {object} opts
 */
export function createToonMaterial(opts = {}) {
  const {
    color = 0xffffff,
    map = null,
    emissive = 0x000000,
    emissiveIntensity = 0,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    depthWrite = true
  } = opts;

  return new THREE.MeshToonMaterial({
    color,
    map,
    gradientMap: getToonGradientMap(),
    emissive,
    emissiveIntensity,
    transparent,
    opacity,
    side,
    depthWrite
  });
}

/**
 * Inverted-hull outline mesh parented to `sourceMesh`.
 * Call on leaf meshes that should read as cel-shaded.
 */
export function addOutline(sourceMesh, {
  color = 0x1a1210,
  scale = 1.07
} = {}) {
  if (!sourceMesh?.geometry) return null;

  const outlineMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    depthWrite: true
  });

  const outline = new THREE.Mesh(sourceMesh.geometry, outlineMat);
  outline.scale.set(scale, scale, scale);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = -1;
  outline.userData.isOutline = true;
  sourceMesh.add(outline);
  return outline;
}

/** Walk a group and add outlines to mesh children (skip already outlined / transparent). */
export function addOutlinesToGroup(root, opts = {}) {
  const outlines = [];
  root.traverse((child) => {
    if (!child.isMesh || child.userData?.isOutline) return;
    if (child.material?.transparent && (child.material.opacity ?? 1) < 0.95) return;
    const o = addOutline(child, opts);
    if (o) outlines.push(o);
  });
  return outlines;
}

/** Soft blob contact shadow under a fighter (parented to character mesh). */
export function createFootShadow() {
  const geo = new THREE.CircleGeometry(0.45, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.55;
  mesh.renderOrder = 1;
  mesh.userData.isFootShadow = true;
  return mesh;
}
