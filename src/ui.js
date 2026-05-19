/**
 * Gestiona toda la UI: loading overlay, status bar,
 * botones de animación, controles de audio, panel de temas.
 */
export class UI {
  #statusEl     = document.getElementById('status-text');
  #loadingEl    = document.getElementById('loading');
  #btnContainer = document.getElementById('btn-container');
  #bgmBtn       = document.getElementById('bgm-toggle');
  #themePanel   = null;

  setStatus(text) { this.#statusEl.textContent = text; }
  hideLoading()   { this.#loadingEl.classList.add('hidden'); }

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