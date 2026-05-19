import * as THREE from 'three';

/**
 * Agrega las luces a la escena.
 * @param {THREE.Scene} scene
 */
export function initLights(scene) {
  // ── AMBIENT ───────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  // ── KEY LIGHT ─────────────────────────────────────
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(5, 10, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 50;
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -10;
  scene.add(keyLight);

  // ── FILL LIGHT ────────────────────────────────────
  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5);
  fillLight.position.set(-5, 3, -5);
  scene.add(fillLight);

  // ── RIM LIGHT ─────────────────────────────────────
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
  rimLight.position.set(0, 5, -8);
  scene.add(rimLight);
}
