import * as THREE from 'three';

/**
 * Agrega las luces a la escena y las devuelve para que el ThemeManager
 * pueda modificarlas en tiempo real.
 * @param {THREE.Scene} scene
 * @returns {{ ambient, key, fill, rim }}
 */
export function initLights(scene) {
  // AMBIENT
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  // KEY LIGHT
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(5, 10, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near   = 0.5;
  key.shadow.camera.far    = 50;
  key.shadow.camera.left   = -10;
  key.shadow.camera.right  = 10;
  key.shadow.camera.top    = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);

  // FILL LIGHT
  const fill = new THREE.DirectionalLight(0x8888ff, 0.5);
  fill.position.set(-5, 3, -5);
  scene.add(fill);

  // RIM LIGHT
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(0, 5, -8);
  scene.add(rim);

  return { ambient, key, fill, rim };
}