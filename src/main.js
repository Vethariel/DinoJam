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

const CAMERA_PRESETS = {
  reveal_slow_orbit:   { pos: [11.8, 5.8, 14.2], target: [0, 1.4, 0] },
  orbit_push_in:       { pos: [10.2, 5.2, 11.4], target: [0, 1.35, 0] },
  side_tracking_fast:  { pos: [15.5, 4.4, 2.4], target: [0, 1.2, 0] },
  hero_arc_medium:     { pos: [10.3, 5.3, -12.6], target: [0, 1.35, 0] },
  wide_breathing_hold: { pos: [19.0, 7.4, 18.5], target: [0, 1.1, 0] },
  low_angle_dolly_in:  { pos: [8.4, 3.8, 13.2], target: [0, 1.0, 0] },
  climax_orbit_fast:   { pos: [11.2, 4.7, -10.3], target: [0, 1.35, 0] },
  counter_orbit_fast:  { pos: [-10.5, 4.8, 11.1], target: [0, 1.35, 0] },
  front_full:          { pos: [0.0, 4.8, 17.0], target: [0, 1.3, 0] },
  bite_front_far:      { pos: [0.0, 5.6, 23.5], target: [0, 1.25, 0] },
  back_full:           { pos: [0.0, 4.8, -17.0], target: [0, 1.3, 0] },
  aerial_orbit:        { pos: [12.8, 10.2, 12.8], target: [0, 1.2, 0] },
  top_down:            { pos: [0.0, 17.1, 0.001], target: [0, 0.9, 0], up: [1, 0, 0] },
  outro_pullback:      { pos: [22.0, 8.4, 22.8], target: [0, 1.2, 0] },
};
const CAMERA_TARGET_Y_OFFSET = 0.9;

let musicCues = null;
try {
  const cueURL = new URL('./music-cues.json', import.meta.url);
  const cueRes = await fetch(cueURL);
  if (cueRes.ok) musicCues = await cueRes.json();
} catch {
  // Si no hay cues todavía, la app sigue funcionando.
}

const { renderer, scene, camera } = initScene();
initEnvironment(scene);
const lights   = initLights(scene);
const { floor, grid } = initFloor(scene);

const controls = initControls(camera, renderer.domElement);
const audio    = new AudioManager();
const ui       = new UI();
ui.setCustomizationVisible(false);
ui.bindCustomizationToggle((isVisible) => {
  ui.setStatus(isVisible ? 'personalizacion: visible' : 'personalizacion: oculta');
});

// Arranca la cámara en el mismo plano inicial del video (primer cue de cámara).
{
  const firstCameraCue = musicCues?.tracks?.camera?.[0];
  const initialPreset = firstCameraCue
    ? CAMERA_PRESETS[firstCameraCue.preset]
    : CAMERA_PRESETS.reveal_slow_orbit;
  if (initialPreset) {
    if (initialPreset.up) camera.up.set(...initialPreset.up);
    camera.position.set(...initialPreset.pos);
    controls.target.set(
      initialPreset.target[0],
      initialPreset.target[1] + CAMERA_TARGET_Y_OFFSET,
      initialPreset.target[2]
    );
    controls.update();
  }
}

ui.setStatus('cargando T-Rex.glb...');

let animator     = null;
const rdSim      = new RDSimulation(renderer);
const themeMgr   = new ThemeManager();
let cueRuntime   = null;
let cueLoopDurationSec = 0;

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
    themeMgr.setAnimationState(name);
    ui.setActiveAnimation(name);
    ui.setStatus(`playing: ${name}`);
  });

  const first = animator.animationNames[0];
  if (first) {
    animator.play(first);
    themeMgr.setAnimationState(first);
    ui.setActiveAnimation(first);
    ui.setStatus(`${clips.length} animaciones cargadas`);
  }

  // Panel de temas
  ui.buildThemePanel(THEMES, (id) => {
    themeMgr.apply(id);
    ui.setActiveTheme(id);
    ui.setStatus(`tema: ${THEMES[id].label}`);
  }, 'neon');

  if (musicCues?.tracks) {
    cueLoopDurationSec = Object.values(musicCues.tracks)
      .flatMap(track => (Array.isArray(track) ? track.map(c => c.t ?? 0) : []))
      .reduce((maxT, t) => Math.max(maxT, t), 0);
    const cueIndices = { theme: 0, camera: 0, animation: 0, fx: 0 };
    let lastCueTime = 0;
    let cameraTween = null;

    const findClipName = (wanted) => {
      const lowerWanted = wanted.toLowerCase();
      return (
        animator.animationNames.find(n => n.toLowerCase() === lowerWanted) ??
        animator.animationNames.find(n => n.toLowerCase().includes(lowerWanted)) ??
        animator.animationNames[0]
      );
    };

    const triggerThemeCue = (cue) => {
      if (!THEMES[cue.theme]) return;
      themeMgr.apply(cue.theme);
      ui.setActiveTheme(cue.theme);
      ui.setStatus(`cue theme: ${THEMES[cue.theme].label}`);
    };

    const triggerAnimCue = (cue) => {
      const clip = findClipName(cue.clip || '');
      if (!clip) return;
      animator.play(clip, cue.speed ?? 1.0);
      themeMgr.setAnimationState(clip);
      ui.setActiveAnimation(clip);
    };

    const triggerCameraCue = (cue) => {
      const preset = CAMERA_PRESETS[cue.preset];
      if (!preset) return;
      const toTarget = new THREE.Vector3(
        preset.target[0],
        preset.target[1] + CAMERA_TARGET_Y_OFFSET,
        preset.target[2]
      );
      if (cue.teleport) {
        cameraTween = null;
        if (preset.up) camera.up.set(...preset.up);
        camera.position.set(...preset.pos);
        controls.target.copy(toTarget);
        controls.update();
        return;
      }
      cameraTween = {
        fromPos: camera.position.clone(),
        fromTarget: controls.target.clone(),
        fromUp: camera.up.clone(),
        toPos: new THREE.Vector3(...preset.pos),
        toTarget,
        toUp: new THREE.Vector3(...(preset.up ?? [0, 1, 0])),
        dur: Math.max(0.4, Math.min(cue.durationSec ?? 1.6, 8.0)),
        elapsed: 0,
      };
    };


    const processTrack = (name, currentTime, callback) => {
      const track = musicCues.tracks?.[name];
      if (!Array.isArray(track)) return;
      let idx = cueIndices[name] ?? 0;
      while (idx < track.length && currentTime + 1e-4 >= track[idx].t) {
        callback(track[idx]);
        idx += 1;
      }
      cueIndices[name] = idx;
    };

    cueRuntime = {
      update(currentMusicTime, dt) {
        if (currentMusicTime + 0.15 < lastCueTime) {
          cueIndices.theme = 0;
          cueIndices.camera = 0;
          cueIndices.animation = 0;
          cueIndices.fx = 0;
        }
        lastCueTime = currentMusicTime;

        processTrack('theme', currentMusicTime, triggerThemeCue);
        processTrack('animation', currentMusicTime, triggerAnimCue);
        processTrack('camera', currentMusicTime, triggerCameraCue);

        if (cameraTween) {
          cameraTween.elapsed += dt;
          const a = THREE.MathUtils.smoothstep(cameraTween.elapsed / cameraTween.dur, 0, 1);
          camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, a);
          controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, a);
          camera.up.lerpVectors(cameraTween.fromUp, cameraTween.toUp, a).normalize();
          if (a >= 0.999) cameraTween = null;
        }
      },
    };
  }

  // Audio: intenta iniciar en cuanto carga; si el navegador bloquea autoplay,
  // se reintenta en el primer gesto del usuario.
  let audioBootstrapped = false;
  const startAudio = () => {
    if (audioBootstrapped) return;
    audioBootstrapped = true;
    audio.init(camera);
    audio.loadBGM('music.mp3', 0.5);
    audio.playBGM();
    ui.setBGMActive(true);
  };
  startAudio();

  const resumeAudioOnGesture = () => {
    audio.playBGM();
    const ctx = audio.listener?.context;
    if (ctx?.state === 'suspended') ctx.resume();
    ui.setBGMActive(true);
    window.removeEventListener('pointerdown', resumeAudioOnGesture);
    window.removeEventListener('keydown', resumeAudioOnGesture);
    window.removeEventListener('touchstart', resumeAudioOnGesture);
  };
  window.addEventListener('pointerdown', resumeAudioOnGesture, { passive: true });
  window.addEventListener('keydown', resumeAudioOnGesture);
  window.addEventListener('touchstart', resumeAudioOnGesture, { passive: true });

  ui.bindBGMToggle((isActive) => {
    if (isActive) audio.playBGM();
    else audio.pauseBGM();
  });
  ui.hideLoading();

} catch (err) {
  ui.setStatus(`error: ${err.message}`);
  console.error('[main] Error cargando el modelo:', err);
}

const clock = new THREE.Clock();
let fallbackCueClockSec = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  fallbackCueClockSec += dt;
  animator?.update(dt);
  if (cueRuntime) {
    const hasBGMBuffer = Boolean(audio.bgm?.buffer);
    const cueTime = hasBGMBuffer
      ? audio.getBGMTimeSec()
      : (cueLoopDurationSec > 0 ? (fallbackCueClockSec % cueLoopDurationSec) : fallbackCueClockSec);
    cueRuntime.update(cueTime, dt);
  }
  themeMgr.update(dt);
  controls.update();
  renderer.render(scene, camera);
}

animate();