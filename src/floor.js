import * as THREE from 'three';

/**
 * Agrega el piso y el grid helper a la escena.
 * @param {THREE.Scene} scene
 */
export function initFloor(scene) {
  // ── FLOOR MESH ────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(40, 40);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d0d,
    roughness: 0.9,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── GRID ──────────────────────────────────────────
  const grid = new THREE.GridHelper(40, 40, 0x1a1a1a, 0x141414);
  scene.add(grid);
}
