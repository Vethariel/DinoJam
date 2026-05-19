import * as THREE from 'three';

/**
 * Gestiona todas las capas de audio del T-Rex:
 *  - BGM:    música ambient en loop (THREE.Audio global)
 *  - Rugido: sonido puntual triggered por animación (THREE.Audio global)
 *  - Pasos:  audio posicional 3D ligado al modelo (THREE.PositionalAudio)
 *
 * IMPORTANTE: el AudioContext se crea en respuesta a un gesto del usuario
 * (click) para cumplir con la política de autoplay del navegador.
 */
export class AudioManager {
  /** @type {THREE.AudioListener} */
  listener = null;

  /** @type {THREE.Audio} */
  bgm = null;

  /** @type {THREE.Audio} */
  roar = null;

  /** @type {THREE.PositionalAudio} */
  footsteps = null;

  /** @type {THREE.AudioLoader} */
  #loader = new THREE.AudioLoader();

  /** @type {boolean} */
  #initialized = false;
  #bgmClockStart = 0;
  #bgmElapsed = 0;
  #bgmDuration = 0;
  #bgmWantsPlay = false;

  /**
   * Crea el AudioListener y lo adjunta a la cámara.
   * Debe llamarse una sola vez, idealmente tras el primer gesto del usuario.
   * @param {THREE.Camera} camera
   */
  init(camera) {
    if (this.#initialized) return;
    this.#initialized = true;

    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
  }

  /**
   * Carga y configura la música de fondo.
   * @param {string} url  Ruta al archivo de audio (mp3 / ogg)
   * @param {number} [volume=0.4]
   */
  loadBGM(url, volume = 0.4) {
    if (!this.listener) {
      console.warn('[AudioManager] init() debe llamarse antes de cargar audio.');
      return;
    }

    this.bgm = new THREE.Audio(this.listener);
    this.#loader.load(url, (buffer) => {
      this.bgm.setBuffer(buffer);
      this.bgm.setLoop(true);
      this.bgm.setVolume(volume);
      this.#bgmDuration = buffer.duration || 0;
      if (this.#bgmWantsPlay && !this.bgm.isPlaying) this.playBGM();
      // No auto-play: usar playBGM() explícitamente
    });
  }

  /**
   * Carga un sonido de rugido (one-shot, no loop).
   * @param {string} url
   * @param {number} [volume=0.8]
   */
  loadRoar(url, volume = 0.8) {
    if (!this.listener) return;

    this.roar = new THREE.Audio(this.listener);
    this.#loader.load(url, (buffer) => {
      this.roar.setBuffer(buffer);
      this.roar.setLoop(false);
      this.roar.setVolume(volume);
    });
  }

  /**
   * Carga pasos como audio posicional y los adjunta a un objeto 3D del modelo.
   * @param {string} url
   * @param {THREE.Object3D} attachTo  Hueso o mesh del T-Rex (ej: pie)
   * @param {number} [volume=1.0]
   */
  loadFootsteps(url, attachTo, volume = 1.0) {
    if (!this.listener) return;

    this.footsteps = new THREE.PositionalAudio(this.listener);
    this.#loader.load(url, (buffer) => {
      this.footsteps.setBuffer(buffer);
      this.footsteps.setLoop(true);
      this.footsteps.setVolume(volume);
      this.footsteps.setRefDistance(3);   // distancia a la que el volumen es máximo
      this.footsteps.setRolloffFactor(2); // qué tan rápido cae el volumen
      attachTo.add(this.footsteps);
    });
  }

  // ── CONTROLES ─────────────────────────────────────

  toggleBGM() {
    if (!this.bgm?.buffer) return;
    this.bgm.isPlaying ? this.pauseBGM() : this.playBGM();
  }

  playBGM() {
    this.#bgmWantsPlay = true;
    const ctx = this.listener?.context;
    if (ctx?.state === 'suspended') {
      ctx.resume()
        .then(() => {
          if (this.#bgmWantsPlay && this.bgm?.buffer && !this.bgm.isPlaying) {
            this.bgm.play();
            this.#bgmClockStart = performance.now() / 1000;
          }
        })
        .catch(() => {
          // El navegador puede bloquear hasta un gesto válido; se reintentará.
        });
    }
    if (this.bgm?.buffer && !this.bgm.isPlaying) {
      try {
        this.bgm.play();
        this.#bgmClockStart = performance.now() / 1000;
      } catch {
        // Si falla por autoplay policy, #bgmWantsPlay queda activo para reintento.
      }
    }
  }

  pauseBGM() {
    this.#bgmWantsPlay = false;
    if (this.bgm?.isPlaying) {
      this.#bgmElapsed += performance.now() / 1000 - this.#bgmClockStart;
      this.bgm.pause();
    }
  }

  resetBGMClock() {
    this.#bgmElapsed = 0;
    this.#bgmClockStart = performance.now() / 1000;
  }

  getBGMTimeSec() {
    let t = this.#bgmElapsed;
    if (this.bgm?.isPlaying) {
      t += performance.now() / 1000 - this.#bgmClockStart;
    }
    if (this.#bgmDuration > 0) t %= this.#bgmDuration;
    return t;
  }

  /** Dispara el rugido una vez (ideal: llamar desde Animator al cambiar animación) */
  triggerRoar() {
    if (!this.roar?.buffer) return;
    if (this.roar.isPlaying) this.roar.stop();
    this.roar.play();
  }

  playFootsteps() {
    if (this.footsteps?.buffer && !this.footsteps.isPlaying) this.footsteps.play();
  }

  stopFootsteps() {
    if (this.footsteps?.isPlaying) this.footsteps.stop();
  }
}
