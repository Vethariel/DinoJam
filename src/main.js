import * as THREE from 'three';

import { initScene }       from './scene.js';
import { initEnvironment } from './environment.js';
import { initLights }      from './lights.js';
import { initControls }    from './controls.js';
import { initFloor }       from './floor.js';
import { loadTRex }        from './loader.js';
import { Animator }        from './animator.js';
import { AudioManager }    from './audio.js';
import { UI }              from './ui.js';

const { renderer, scene, camera } = initScene();
initEnvironment(scene);
initLights(scene);
initFloor(scene);

const controls = initControls(camera, renderer.domElement);
const audio    = new AudioManager();
const ui       = new UI();

ui.setStatus('cargando T-Rex.glb...');

let animator = null;

try {
  const { model, clips } = await loadTRex(scene, controls, camera, {
    onProgress: (pct) => ui.setStatus(`cargando... ${pct}%`),
  });

  animator = new Animator(model, clips);

  ui.buildAnimationButtons(animator.animationNames, (name) => {
    animator.play(name);
    ui.setActiveAnimation(name);
    ui.setStatus(`playing: ${name}`);
  });

  const first = animator.animationNames[0];
  if (first) {
    animator.play(first);
    ui.setActiveAnimation(first);
    ui.setStatus(`${clips.length} animaciones cargadas`);
  }

  // ── Debug panel de materiales ──────────────────────────────
  // Recolectar todos los materiales únicos del modelo
  const matSet = new Set();
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => { if (m) matSet.add(m); });
  });
  ui.buildMaterialDebugPanel([...matSet]);

  // ── Audio ──────────────────────────────────────────────────
  const initAudioOnce = () => {
    audio.init(camera);
    // audio.loadBGM('audio/bgm.mp3');
    // audio.loadRoar('audio/roar.mp3');
    document.removeEventListener('click', initAudioOnce);
  };
  document.addEventListener('click', initAudioOnce);

  ui.bindBGMToggle(() => audio.toggleBGM());
  ui.hideLoading();

} catch (err) {
  ui.setStatus(`error: ${err.message}`);
  console.error('[main] Error cargando el modelo:', err);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  animator?.update(dt);
  controls.update();
  renderer.render(scene, camera);
}

animate();