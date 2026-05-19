import * as THREE from 'three';

/**
 * Gestiona el AnimationMixer y las acciones del T-Rex.
 */
export class Animator {
  /** @type {THREE.AnimationMixer} */
  mixer = null;

  /** @type {Map<string, THREE.AnimationAction>} */
  actions = new Map();

  /** @type {THREE.AnimationAction | null} */
  currentAction = null;

  /** Duración del crossfade en segundos */
  crossfadeDuration = 0.4;

  /**
   * Offset Y aplicado durante la animación "run" para compensar el flote.
   * Ajusta este valor hasta que los pies toquen el suelo.
   */
  runYOffset = -0.18;

  /** @type {THREE.Object3D} */
  #model = null;

  /** Y base del modelo (posición calculada por el loader) */
  #baseY = 0;

  /**
   * @param {THREE.Object3D} model
   * @param {THREE.AnimationClip[]} clips
   */
  constructor(model, clips) {
    this.mixer  = new THREE.AnimationMixer(model);
    this.#model = model;
    this.#baseY = model.position.y;

    for (const clip of clips) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }

  /**
   * Nombres de todas las animaciones disponibles.
   * @returns {string[]}
   */
  get animationNames() {
    return [...this.actions.keys()];
  }

  /**
   * Devuelve true si el nombre de animación corresponde a "run".
   * Compara en minúsculas para cubrir "Run", "RUN", "run_cycle", etc.
   * @param {string} name
   */
  #isRun(name) {
    return name.toLowerCase().includes('run');
  }

  /**
   * Reproduce una animación con crossfade desde la actual.
   * Si la animación es "run", baja el modelo `runYOffset` unidades en Y
   * para compensar el flote; al salir de run se restaura la Y base.
   * @param {string} name
   */
  play(name) {
    const next = this.actions.get(name);
    if (!next) {
      console.warn(`[Animator] Animación no encontrada: "${name}"`);
      return;
    }

    if (this.currentAction && this.currentAction !== next) {
      next.reset().play();
      this.currentAction.crossFadeTo(next, this.crossfadeDuration, true);
    } else {
      next.reset().play();
    }

    // Ajuste de Y: aplica offset solo en run, restaura en el resto
    if (this.#model) {
      this.#model.position.y = this.#isRun(name)
        ? this.#baseY + this.runYOffset
        : this.#baseY;
    }

    this.currentAction = next;
  }

  /**
   * Debe llamarse en el render loop con el delta de tiempo.
   * @param {number} dt
   */
  update(dt) {
    this.mixer?.update(dt);
  }
}