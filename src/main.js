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
import { RDSimulation }    from './rd.js';
import { ThemeManager, THEMES } from './theme.js';

const { renderer, scene, camera } = initScene();
initEnvironment(scene);
const lights   = initLights(scene);
const { floor, grid } = initFloor(scene);

const controls = initControls(camera, renderer.domElement);
const audio    = new AudioManager();
const ui       = new UI();

ui.setStatus('cargando T-Rex.glb...');

let animator     = null;
const rdSim      = new RDSimulation(renderer);
const themeMgr   = new ThemeManager();

try {
  const { model, clips } = await loadTRex(scene, controls, camera, {
    onProgress: (pct) => ui.setStatus(`cargando... ${pct}%`),
  });

  animator = new Animator(model, clips);

  // Inicializar sistema de temas
  themeMgr.init(scene, model, floor, grid, lights, rdSim, camera);

  // Aplicar tema inicial
  themeMgr.apply('neon');

  // Botones de animación
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

  // Panel de temas
  ui.buildThemePanel(THEMES, (id) => {
    themeMgr.apply(id);
    ui.setActiveTheme(id);
    ui.setStatus(`tema: ${THEMES[id].label}`);
  }, 'neon');

  // Audio
  const initAudioOnce = () => {
    audio.init(camera);
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
  themeMgr.update(dt);
  controls.update();
  renderer.render(scene, camera);
}

animate();