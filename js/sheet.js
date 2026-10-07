/**
 * RunLoop — Gerenciador de Bottom Sheet Móvel com PointerEvents e Snaps
 * 
 * Alturas de snap: 'hidden' | 'compact' (~140px) | 'half' (50vh) | 'full' (88vh).
 * Arrastável exclusivamente pelo handle/cabeçalho, usando transform: translateY()
 * para máxima performance sem reflow da página.
 */

export const SHEET_SNAPS = {
  HIDDEN: 'hidden',
  COMPACT: 'compact',
  HALF: 'half',
  FULL: 'full'
};

export class BottomSheet {
  /**
   * @param {HTMLElement} element - Elemento do painel sheet
   * @param {object} [options]
   * @param {HTMLElement} [options.handle] - Elemento de arraste
   * @param {function(string): void} [options.onSnapChange] - Callback ao mudar snap
   */
  constructor(element, options = {}) {
    this.el = element;
    this.handle = options.handle || this.el.querySelector('.sheet-handle-zone') || this.el;
    this.onSnapChange = options.onSnapChange || (() => {});

    this.currentSnap = SHEET_SNAPS.HIDDEN;
    this.isDragging = false;
    this.startY = 0;
    this.startTranslateY = 0;
    this.currentTranslateY = 0;
    this.sheetHeight = 0;

    this._bindEvents();
    this._setupVisualViewport();
  }

  /**
   * Define o modo de snap desejado
   * @param {'hidden'|'compact'|'half'|'full'} snap 
   * @param {boolean} [animate=true]
   */
  setSnap(snap, animate = true) {
    this.currentSnap = snap;
    this.el.dataset.snap = snap;

    if (animate) {
      this.el.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    } else {
      this.el.style.transition = 'none';
    }

    const targetY = this._calcSnapTranslateY(snap);
    this.currentTranslateY = targetY;
    this.el.style.transform = `translateY(${targetY}px)`;

    this.el.setAttribute('aria-expanded', snap !== SHEET_SNAPS.HIDDEN ? 'true' : 'false');
    this.onSnapChange(snap);
  }

  getSnap() {
    return this.currentSnap;
  }

  /**
   * Retorna a altura visível em pixels que o sheet ocupa a partir do rodapé
   * @returns {number}
   */
  getVisibleHeight() {
    const windowH = window.innerHeight;
    const snap = this.currentSnap;
    if (snap === SHEET_SNAPS.HIDDEN) return 0;
    if (snap === SHEET_SNAPS.COMPACT) return 140;
    if (snap === SHEET_SNAPS.HALF) return Math.round(windowH * 0.5);
    if (snap === SHEET_SNAPS.FULL) return Math.round(Math.min(windowH * 0.88, 680));
    return 140;
  }

  _calcSnapTranslateY(snap) {
    const windowH = window.innerHeight;
    this.sheetHeight = this.el.offsetHeight || Math.min(windowH * 0.88, 680);

    // No desktop (>= 900px), o sheet vira um card flutuante lateral
    if (window.innerWidth >= 900) {
      if (snap === SHEET_SNAPS.HIDDEN) {
        return windowH + 100;
      }
      return 0; // fica no topo flutuante
    }

    switch (snap) {
      case SHEET_SNAPS.HIDDEN:
        return this.sheetHeight + 80;
      case SHEET_SNAPS.COMPACT:
        return Math.max(0, this.sheetHeight - 140);
      case SHEET_SNAPS.HALF:
        return Math.max(0, this.sheetHeight - Math.round(windowH * 0.5));
      case SHEET_SNAPS.FULL:
        return 0;
      default:
        return this.sheetHeight + 80;
    }
  }

  _bindEvents() {
    // Touch/pointer events no handle e no cabeçalho
    this.handle.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    const header = this.el.querySelector('.sheet-header');
    if (header) {
      header.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    }

    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));

    // Recalcula posições ao redimensionar a janela
    window.addEventListener('resize', () => {
      this.setSnap(this.currentSnap, false);
    });
  }

  _onPointerDown(e) {
    if (e.button !== 0) return; // apenas clique/toque primário
    // Não arrastar se o clique foi em um botão dentro do cabeçalho
    if (e.target.closest('button, input, a')) return;

    this.isDragging = true;
    this.startSnap = this.currentSnap;
    this.startY = e.clientY;
    this.startTranslateY = this.currentTranslateY;
    this.sheetHeight = this.el.offsetHeight;

    this.el.style.transition = 'none';
    const targetCapture = e.currentTarget || this.handle;
    if (targetCapture.setPointerCapture) {
      try {
        targetCapture.setPointerCapture(e.pointerId);
        this._activeCaptureElement = targetCapture;
      } catch {}
    }
  }

  _onPointerMove(e) {
    if (!this.isDragging) return;

    const deltaY = e.clientY - this.startY;
    let newTranslate = this.startTranslateY + deltaY;

    // Resistência acima do topo
    if (newTranslate < 0) {
      newTranslate = newTranslate * 0.3;
    }

    this.currentTranslateY = newTranslate;
    this.el.style.transform = `translateY(${newTranslate}px)`;
  }

  _onPointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this._activeCaptureElement && this._activeCaptureElement.releasePointerCapture) {
      try {
        this._activeCaptureElement.releasePointerCapture(e.pointerId);
      } catch {}
      this._activeCaptureElement = null;
    }

    const deltaY = e.clientY - this.startY;
    const windowH = window.innerHeight;

    // Regra explícita: arrastar o handle/cabeçalho para baixo a partir do estado compacto vai para oculto
    if (this.startSnap === SHEET_SNAPS.COMPACT && deltaY > 20) {
      this.setSnap(SHEET_SNAPS.HIDDEN);
      return;
    }

    // Decisão do snap mais próximo com base na posição e sentido do arraste
    const compactY = Math.max(0, this.sheetHeight - 140);
    const halfY = Math.max(0, this.sheetHeight - Math.round(windowH * 0.5));
    const fullY = 0;

    const current = this.currentTranslateY;

    // Se houve gesto rápido para baixo
    if (deltaY > 50) {
      if (this.startSnap === SHEET_SNAPS.FULL) {
        this.setSnap(SHEET_SNAPS.HALF);
      } else if (this.startSnap === SHEET_SNAPS.HALF) {
        this.setSnap(deltaY > 100 ? SHEET_SNAPS.HIDDEN : SHEET_SNAPS.COMPACT);
      } else {
        this.setSnap(SHEET_SNAPS.HIDDEN);
      }
      return;
    }

    // Se houve gesto rápido para cima
    if (deltaY < -60) {
      if (current > halfY) {
        this.setSnap(SHEET_SNAPS.HALF);
      } else {
        this.setSnap(SHEET_SNAPS.FULL);
      }
      return;
    }

    // Caso contrário, calcula o snap mais próximo em distância
    const snaps = [
      { name: SHEET_SNAPS.FULL, y: fullY },
      { name: SHEET_SNAPS.HALF, y: halfY },
      { name: SHEET_SNAPS.COMPACT, y: compactY },
      { name: SHEET_SNAPS.HIDDEN, y: this.sheetHeight + 40 }
    ];

    snaps.sort((a, b) => Math.abs(a.y - current) - Math.abs(b.y - current));
    this.setSnap(snaps[0].name);
  }

  _setupVisualViewport() {
    if (!window.visualViewport) return;

    // Ao abrir teclado virtual no celular, ajusta o sheet para o input não ficar oculto
    window.visualViewport.addEventListener('resize', () => {
      const activeEl = document.activeElement;
      if (activeEl && this.el.contains(activeEl)) {
        // Se um campo dentro do sheet estiver focado, garanta visualização
        if (this.currentSnap !== SHEET_SNAPS.FULL) {
          this.setSnap(SHEET_SNAPS.FULL, true);
        }
        setTimeout(() => {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    });
  }
}
