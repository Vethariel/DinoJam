import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Crea y configura los OrbitControls.
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @returns {OrbitControls}
 */
export function initControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 40;
  controls.target.set(0, 1.5, 0);
  controls.update();

  return controls;
}
