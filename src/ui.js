/**
 * Gestiona toda la UI: loading overlay, status bar,
 * botones de animación, controles de audio, panel de temas.
 */
export class UI {
  #statusEl     = document.getElementById('status-text');
  #loadingEl    = document.getElementById('loading');
  #btnContainer = document.getElementById('btn-container');
  #bgmBtn       = document.getElementById('bgm-toggle');
  #customizationBtn = document.getElementById('customization-toggle');
  #themePanel   = null;
  #freqEl = null;
  #freqCanvas = null;
  #freqCtx = null;
  #freqWave = [];
  #freqTheme = 'map';
  #bwIsWhite = false;
  #neonHue = 0.55;
  #waveTime = 0;
  #idlePhaseA = Math.random() * Math.PI * 2;
  #idlePhaseB = Math.random() * Math.PI * 2;

  constructor() {
    this.#buildFrequencyVisualizer();
  }

  setStatus(text) { this.#statusEl.textContent = text; }
  hideLoading()   { this.#loadingEl.classList.add('hidden'); }

  #buildFrequencyVisualizer() {
    document.getElementById('freq-visualizer')?.remove();
    const root = document.createElement('div');
    root.id = 'freq-visualizer';
    root.dataset.theme = this.#freqTheme;
    const canvas = document.createElement('canvas');
    canvas.className = 'freq-wave-canvas';
    root.appendChild(canvas);
    document.body.appendChild(root);
    this.#freqEl = root;
    this.#freqCanvas = canvas;
    this.#freqCtx = canvas.getContext('2d');
    this.#freqWave = Array.from({ length: 60 }, () => 0);
    this.#resizeFrequencyCanvas();
  }

  #resizeFrequencyCanvas() {
    if (!this.#freqCanvas || !this.#freqEl) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const desiredW = Math.max(260, Math.min(720, Math.floor(window.innerWidth / 3)));
    const h = Math.max(10, Math.floor(this.#freqEl.clientHeight));
    this.#freqCanvas.style.width = `${desiredW}px`;
    this.#freqCanvas.style.height = `${h}px`;
    const w = desiredW;
    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);
    if (this.#freqCanvas.width !== targetW || this.#freqCanvas.height !== targetH) {
      this.#freqCanvas.width = targetW;
      this.#freqCanvas.height = targetH;
    }
  }

  #getWaveStyle() {
    if (this.#freqTheme === 'neon') {
      const hueDeg = Math.round(this.#neonHue * 360);
      return {
        line: `hsl(${hueDeg} 100% 62%)`,
        glow: `hsla(${hueDeg} 100% 55% / 0.4)`,
      };
    }
    if (this.#freqTheme === 'bw') {
      if (this.#bwIsWhite) return { line: 'rgba(12,12,12,0.96)', glow: 'rgba(12,12,12,0.22)' };
      return { line: 'rgba(255,255,255,0.96)', glow: 'rgba(255,255,255,0.28)' };
    }
    return { line: 'rgba(232,180,108,0.9)', glow: 'rgba(232,180,108,0.25)' };
  }

  setVisualizerTheme(themeId) {
    this.#freqTheme = String(themeId || 'map');
    if (this.#freqEl) this.#freqEl.dataset.theme = this.#freqTheme;
    if (this.#freqTheme === 'bw') this.#bwIsWhite = false;
  }

  setNeonHue(hue01) {
    if (Number.isFinite(hue01)) this.#neonHue = ((hue01 % 1) + 1) % 1;
  }

  triggerKick(type = 'secondary') {
    if (!this.#freqWave.length) return;
    const isMain = type === 'main';
    const amp = isMain ? 1.0 : 0.52;
    if (this.#freqTheme === 'bw') {
      if (isMain) this.#bwIsWhite = false;
      else this.#bwIsWhite = !this.#bwIsWhite;
    }
    for (let i = 0; i < this.#freqWave.length; i += 1) {
      const phase = (i / Math.max(1, this.#freqWave.length - 1)) * Math.PI * 4.5;
      const shape = 0.22 + 0.78 * Math.abs(Math.sin(phase));
      const noise = 0.82 + Math.random() * 0.42;
      const hit = amp * shape * noise;
      this.#freqWave[i] = Math.max(this.#freqWave[i], Math.min(1, hit));
    }
  }

  update(dt) {
    if (!this.#freqCtx || !this.#freqCanvas || !this.#freqWave.length) return;
    this.#waveTime += dt;
    this.#resizeFrequencyCanvas();
    const decay = 3.6;
    for (let i = 0; i < this.#freqWave.length; i += 1) {
      const prev = this.#freqWave[Math.max(0, i - 1)];
      const next = this.#freqWave[Math.min(this.#freqWave.length - 1, i + 1)];
      const smooth = (prev + this.#freqWave[i] * 2 + next) * 0.25;
      this.#freqWave[i] = Math.max(0, smooth - dt * decay);

      // Movimiento base para evitar línea muerta cuando no hay kicks.
      const p = i / Math.max(1, this.#freqWave.length - 1);
      const idleA = Math.sin(this.#waveTime * 2.1 + p * 6.0 + this.#idlePhaseA) * 0.040;
      const idleB = Math.sin(this.#waveTime * 4.5 + p * 15.0 + this.#idlePhaseB) * 0.024;
      const idle = Math.max(0, 0.055 + idleA + idleB);
      this.#freqWave[i] = Math.max(this.#freqWave[i], idle);
    }

    const ctx = this.#freqCtx;
    const w = this.#freqCanvas.width;
    const h = this.#freqCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const style = this.#getWaveStyle();
    const baseY = h * 0.74;
    const amp = h * 0.30;
    const stepX = w / (this.#freqWave.length - 1);

    ctx.strokeStyle = style.line;
    ctx.shadowBlur = 12;
    ctx.shadowColor = style.glow;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, Math.floor(w * 0.0018));

    // Onda espejada (arriba/abajo) tipo visualizador musical.
    for (let i = 0; i < this.#freqWave.length; i += 1) {
      const x = i * stepX;
      const wobble = 0.86 + 0.14 * Math.sin(this.#waveTime * 8.0 + i * 0.35);
      const a = this.#freqWave[i] * amp * wobble;
      const y0 = baseY - a;
      const y1 = baseY + a;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  buildAnimationButtons(names, onSelect) {
    this.#btnContainer.innerHTML = '';
    for (const name of names) {
      const btn = document.createElement('button');
      btn.className = 'anim-btn';
      btn.innerHTML = `<span class="dot"></span>${name}`;
      btn.dataset.name = name;
      btn.addEventListener('click', () => onSelect(name));
      this.#btnContainer.appendChild(btn);
    }
  }

  setActiveAnimation(name) {
    this.#btnContainer.querySelectorAll('.anim-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.name === name);
    });
  }

  bindBGMToggle(onToggle) {
    this.#bgmBtn?.addEventListener('click', () => {
      const isActive = this.#bgmBtn.classList.toggle('active');
      onToggle(isActive);
    });
  }

  setBGMActive(isActive) {
    this.#bgmBtn?.classList.toggle('active', Boolean(isActive));
  }

  bindCustomizationToggle(onToggle) {
    this.#customizationBtn?.addEventListener('click', () => {
      const nowVisible = document.body.classList.toggle('customization-hidden') === false;
      this.#customizationBtn.classList.toggle('active', nowVisible);
      onToggle?.(nowVisible);
    });
  }

  setCustomizationVisible(isVisible) {
    const visible = Boolean(isVisible);
    document.body.classList.toggle('customization-hidden', !visible);
    this.#customizationBtn?.classList.toggle('active', visible);
  }

  /**
   * Construye el panel de selección de temas con previews de color.
   * @param {Object} themes   – objeto THEMES de theme.js
   * @param {Function} onSelect – callback(id)
   * @param {string} activeId   – tema inicial
   */
  buildThemePanel(themes, onSelect, activeId) {
    // Quitar panel anterior si existe
    document.getElementById('theme-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'theme-panel';

    const title = document.createElement('h3');
    title.textContent = 'Temas';
    panel.appendChild(title);

    for (const [id, theme] of Object.entries(themes)) {
      const card = document.createElement('button');
      card.className = 'theme-card' + (id === activeId ? ' active' : '');
      card.dataset.themeId = id;

      // Preview de 3 swatches
      const swatches = document.createElement('div');
      swatches.className = 'theme-swatches';
      theme.preview.forEach(hex => {
        const s = document.createElement('span');
        s.className = 'swatch';
        s.style.background = hex;
        swatches.appendChild(s);
      });

      const label = document.createElement('span');
      label.className = 'theme-label';
      label.textContent = theme.label;

      card.appendChild(swatches);
      card.appendChild(label);
      card.addEventListener('click', () => {
        onSelect(id);
        panel.querySelectorAll('.theme-card').forEach(c =>
          c.classList.toggle('active', c.dataset.themeId === id)
        );
      });

      panel.appendChild(card);
    }

    document.body.appendChild(panel);
    this.#themePanel = panel;
  }

  setActiveTheme(id) {
    this.#themePanel?.querySelectorAll('.theme-card').forEach(c =>
      c.classList.toggle('active', c.dataset.themeId === id)
    );
  }

  /**
   * Panel de debug de materiales (mantenido por compatibilidad).
   * @param {THREE.Material[]} materials
   */
  buildMaterialDebugPanel(_materials) {
    // No-op en producción con temas activos.
    // Descomenta para debug de materiales originales.
  }
}