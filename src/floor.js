import * as THREE from 'three';

/**
 * Crea el plano del suelo (1600×1600) y el GridHelper.
 * El ThemeManager reemplaza el material del plano según el tema activo.
 * El GridHelper se oculta (el grid neon está embebido en el floor shader).
 *
 * @param {THREE.Scene} scene
 * @returns {{ floor: THREE.Mesh, grid: THREE.GridHelper }}
 */
export function initFloor(scene) {
  // Plano grande para que nunca se vea el borde
  const floorGeo = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d0d,
    roughness: 0.9,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid oculto por defecto; ThemeManager lo controla
  const grid = new THREE.GridHelper(1600, 200, 0x1a1a1a, 0x141414);
  grid.visible = false;
  scene.add(grid);

  return { floor, grid };
}