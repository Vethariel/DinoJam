/**
 * Gestiona toda la UI: loading overlay, status bar,
 * botones de animación, controles de audio y debug de materiales.
 */
export class UI {
  #statusEl    = document.getElementById('status-text');
  #loadingEl   = document.getElementById('loading');
  #btnContainer = document.getElementById('btn-container');
  #bgmBtn      = document.getElementById('bgm-toggle');

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
   * Construye un panel para togglear cada map del material en tiempo real.
   * @param {THREE.Material | THREE.Material[]} materials
   */
  buildMaterialDebugPanel(materials) {
    const mats = Array.isArray(materials) ? materials : [materials];

    // Quitar panel anterior si existe
    document.getElementById('mat-debug')?.remove();

    const panel = document.createElement('div');
    panel.id = 'mat-debug';
    panel.style.cssText = `
      position: fixed; bottom: 40px; right: 16px;
      background: rgba(0,0,0,0.82); border: 1px solid #2a2a2a;
      border-radius: 8px; padding: 14px 16px; min-width: 200px;
      backdrop-filter: blur(8px); z-index: 10; font-family: 'Courier New', monospace;
    `;
    panel.innerHTML = `<h3 style="font-size:10px;letter-spacing:2px;color:#555;
      text-transform:uppercase;margin-bottom:10px;">Material maps</h3>`;

    // Maps a inspeccionar
    const MAPS = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap',
      'aoMap', 'emissiveMap', 'specularMap', 'alphaMap',
    ];

    // Usar el primer material como referencia (todos son el mismo aquí)
    const mat = mats[0];

    // Guardar referencias originales
    const originals = {};
    for (const key of MAPS) originals[key] = mat[key] ?? null;

    // Mostrar solo los maps que existen
    const activeMaps = MAPS.filter(k => originals[k] !== null);

    if (activeMaps.length === 0) {
      panel.innerHTML += `<p style="color:#555;font-size:11px;">sin maps activos</p>`;
    }

    for (const key of activeMaps) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

      const toggle = document.createElement('button');
      toggle.className = 'anim-btn active';
      toggle.style.cssText = 'width:100%;margin:0;font-size:11px;padding:6px 10px;';
      toggle.innerHTML = `<span class="dot"></span>${key}`;
      toggle.dataset.active = 'true';

      toggle.addEventListener('click', () => {
        const isActive = toggle.dataset.active === 'true';
        const next = !isActive;
        toggle.dataset.active = String(next);
        toggle.classList.toggle('active', next);

        // Aplicar a todos los materiales
        for (const m of mats) {
          m[key] = next ? originals[key] : null;
          m.needsUpdate = true;
        }
      });

      row.appendChild(toggle);
      panel.appendChild(row);
    }

    // Botón reset
    const reset = document.createElement('button');
    reset.className = 'anim-btn';
    reset.style.cssText = 'width:100%;margin-top:4px;font-size:11px;';
    reset.textContent = 'reset todos';
    reset.addEventListener('click', () => {
      for (const m of mats) {
        for (const key of MAPS) { m[key] = originals[key]; m.needsUpdate = true; }
      }
      panel.querySelectorAll('[data-active]').forEach(btn => {
        btn.dataset.active = 'true';
        btn.classList.add('active');
      });
    });
    panel.appendChild(reset);

    document.body.appendChild(panel);
  }
}