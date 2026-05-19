import * as THREE from 'three';

/**
 * Configura el entorno de la escena: fog, background color.
 * Punto de extensión para HDRI, skybox o environment maps.
 * @param {THREE.Scene} scene
 */
export function initEnvironment(scene) {
  scene.background = new THREE.Color(0x0a0a0a);
  scene.fog = new THREE.Fog(0x0a0a0a, 20, 60);

  // TODO: cargar HDRI con RGBELoader cuando haya un archivo .hdr disponible
  // import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
  // const hdrLoader = new RGBELoader();
  // hdrLoader.load('env.hdr', (texture) => {
  //   texture.mapping = THREE.EquirectangularReflectionMapping;
  //   scene.environment = texture;
  //   scene.background = texture;
  // });
}
