import * as THREE from 'three';

/**
 * Setup mínimo de escena.
 * El fondo y fog reales los aplica ThemeManager al activar cada tema.
 * @param {THREE.Scene} scene
 */
export function initEnvironment(scene) {
  scene.background = new THREE.Color(0x000000);
  // Sin fog aquí – lo gestiona ThemeManager
}