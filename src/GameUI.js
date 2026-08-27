class GameUI {
  constructor(container, env) {
    this.container = container || document.body;
    this.env = env;
    this.isCollapsed = false;
    this._msgFadeTimeout = null;

    this._injectStyles();

    const savedDifficulty = localStorage.getItem('legoDetectiveDifficulty');
    const initialDifficulty = savedDifficulty !== null ? parseFloat(savedDifficulty) : 0.5;

    // Magnifying glass detective SVG icon
    this.detectiveIcon = makeElement('div', { className: 'detective-badge-icon', title: 'Lego Detective' }, [
      makeElement('svg:svg', {
        viewBox: '0 0 24 24',
        width: '18',
        height: '18',
        style: { display: 'block', fill: 'none', stroke: '#58a6ff', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' }
      }, [
        makeElement('svg:circle', { cx: '11', cy: '11', r: '7' }),
        makeElement('svg:line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' }),
        makeElement('svg:circle', { cx: '9', cy: '9', r: '2.2', style: { fill: 'rgba(88,166,255,0.45)', stroke: 'none' } })
      ])
    ]);

    this.titleNode = makeElement('span', { className: 'panel-app-title' }, 'Lego Detective');

    this.scoreNode = makeElement('span', { id: 'score-value' }, '0');
    const scoreContainer = makeElement('div', { className: 'score-container' }, 'Score: ', this.scoreNode);

    this.toggleBtn = makeElement('button', { className: 'panel-toggle-btn', title: 'Toggle Controls Drawer' }, '▼');

    // Swipe grab bar indicator
    const swipeGrabHandle = makeElement('div', { className: 'swipe-grab-handle' });

    // Header bar (always docked at bottom)
    const headerLeft = makeElement('div', { className: 'panel-header-left' }, this.detectiveIcon, this.titleNode);
    const headerRight = makeElement('div', { className: 'panel-header-right' }, scoreContainer, this.toggleBtn);
    this.headerBar = makeElement('div', { className: 'bottom-panel-header' }, swipeGrabHandle, headerLeft, headerRight);

    // Floating semi-transparent message pill (top center)
    this.feedbackNode = makeElement('div', { className: 'subtle-message-pill' }, 'Find and click the one different brick.');

    // Action buttons & controls
    this.spinBtn = makeElement('button', { className: 'btn-action btn-spin' }, 'Stop Spin');
    this.revealBtn = makeElement('button', { className: 'btn-action btn-cheat' }, 'Cheat');
    this.instructionsBtn = makeElement('button', { className: 'btn-action btn-help', title: 'How to Play' }, '?');

    const buttonGroup = makeElement('div', { className: 'button-group' }, this.spinBtn, this.revealBtn, this.instructionsBtn);

    this.difficultyLabel = makeElement('span', { className: 'difficulty-label' }, 'Difficulty: Medium');
    this.difficultySlider = makeElement('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.01',
      value: initialDifficulty,
      className: 'difficulty-slider'
    });

    const difficultyContainer = makeElement('div', { className: 'difficulty-container' }, this.difficultyLabel, this.difficultySlider);

    this.panelBody = makeElement('div', { className: 'bottom-panel-body' }, difficultyContainer, buttonGroup);

    // Main Bottom Panel Element
    this.bottomPanel = makeElement('div', { id: 'bottom-control-panel' }, this.headerBar, this.panelBody);

    this.container.appendChild(this.feedbackNode);
    this.container.appendChild(this.bottomPanel);

    this._bindTouchGestures();
  }

  init(newPairCb, toggleSpinCb, revealCb) {
    this.spinBtn.onclick = () => toggleSpinCb?.();
    this.revealBtn.onclick = () => revealCb?.();
    this.instructionsBtn.onclick = () => this.showInstructions();

    this.headerBar.onclick = (e) => {
      if (e.target !== this.toggleBtn) {
        this.toggleCollapse();
      }
    };
    this.toggleBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    };

    this.updateDifficultyLabel();
    this.difficultySlider.addEventListener('change', () => {
      const value = this.getDifficulty();
      localStorage.setItem('legoDetectiveDifficulty', value);
      newPairCb?.();
    });
    this.difficultySlider.addEventListener('input', () => this.updateDifficultyLabel());

    this.setSpinButtonLabel('Stop Spin');
    this.enableReveal(false);

    // Auto-collapse on small screens to give full canvas space
    if (window.innerWidth < 640 || window.innerHeight < 680) {
      this.setCollapsed(true);
    }
  }

  _bindTouchGestures() {
    let startY = 0;
    let currentY = 0;

    this.headerBar.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        startY = e.touches[0].clientY;
        currentY = startY;
      }
    }, { passive: true });

    this.headerBar.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length === 1) {
        currentY = e.touches[0].clientY;
      }
    }, { passive: true });

    this.headerBar.addEventListener('touchend', () => {
      const deltaY = currentY - startY;
      if (deltaY > 25 && !this.isCollapsed) {
        // Swiped down -> collapse
        this.setCollapsed(true);
      } else if (deltaY < -25 && this.isCollapsed) {
        // Swiped up -> expand
        this.setCollapsed(false);
      }
    }, { passive: true });
  }

  toggleCollapse() {
    this.setCollapsed(!this.isCollapsed);
  }

  setCollapsed(collapsed) {
    this.isCollapsed = collapsed;
    if (this.bottomPanel) {
      this.bottomPanel.classList.toggle('is-collapsed', this.isCollapsed);
      this.toggleBtn.textContent = this.isCollapsed ? '▲' : '▼';
    }

    // Trigger sequential resize frames so Three.js adapts seamlessly with CSS transitions
    let start = performance.now();
    const animateResize = () => {
      window.dispatchEvent(new Event('resize'));
      if (performance.now() - start < 260) {
        requestAnimationFrame(animateResize);
      }
    };
    requestAnimationFrame(animateResize);
  }

  updateDifficultyLabel() {
    const value = parseFloat(this.difficultySlider.value);
    let label = 'Difficulty: ';
    if (value < 0.2) label += 'Easiest';
    else if (value < 0.4) label += 'Easy';
    else if (value < 0.6) label += 'Medium';
    else if (value < 0.8) label += 'Hard';
    else label += 'Expert';
    this.difficultyLabel.textContent = label;
  }

  getDifficulty() {
    return parseFloat(this.difficultySlider.value);
  }

  enableDifficultySlider(flag) {
    if (this.difficultySlider) this.difficultySlider.disabled = !flag;
  }

  setMessage(msg, autoHideMs = 3500) {
    if (this.feedbackNode) {
      clearTimeout(this._msgFadeTimeout);
      this.feedbackNode.textContent = msg;
      this.feedbackNode.style.opacity = '1';
      this.feedbackNode.classList.remove('pulse-feedback');
      void this.feedbackNode.offsetWidth;
      this.feedbackNode.classList.add('pulse-feedback');

      if (autoHideMs > 0) {
        this._msgFadeTimeout = setTimeout(() => {
          if (this.feedbackNode) {
            this.feedbackNode.style.opacity = '0';
          }
        }, autoHideMs);
      }
    }
  }

  setScore(score) {
    if (this.scoreNode) this.scoreNode.textContent = score;
  }

  setSpinButtonLabel(txt) {
    if (this.spinBtn) this.spinBtn.textContent = txt;
  }

  enableReveal(flag) {
    if (this.revealBtn) this.revealBtn.disabled = !flag;
  }

  enableAllButtons(flag) {
    if (this.spinBtn) this.spinBtn.disabled = !flag;
    this.enableDifficultySlider(flag);
  }

  disableAllButtons(flag) {
    if (this.spinBtn) this.spinBtn.disabled = flag;
    if (this.revealBtn) this.revealBtn.disabled = flag;
    this.enableDifficultySlider(!flag);
  }

  flashCheatButtonColor(hexColor, durationMs = 2500) {
    if (!this.revealBtn) return;
    const originalBg = this.revealBtn.style.backgroundColor;
    const originalColor = this.revealBtn.style.color;

    this.revealBtn.style.backgroundColor = hexColor;
    const r = parseInt(hexColor.slice(1, 3), 16) || 0;
    const g = parseInt(hexColor.slice(3, 5), 16) || 0;
    const b = parseInt(hexColor.slice(5, 7), 16) || 0;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    this.revealBtn.style.color = luminance > 0.5 ? '#111' : '#fff';

    setTimeout(() => {
      this.revealBtn.style.backgroundColor = originalBg;
      this.revealBtn.style.color = originalColor;
    }, durationMs);
  }

  showCheatButtonText(text, durationMs = 3000) {
    if (!this.revealBtn) return;
    const originalText = this.revealBtn.textContent;
    this.revealBtn.textContent = text;
    this.revealBtn.style.fontSize = '11px';

    setTimeout(() => {
      this.revealBtn.textContent = originalText;
      this.revealBtn.style.fontSize = '';
    }, durationMs);
  }

  showSplash() {}
  animateSplashToPanel() {}

  showInstructions(onCloseCallback = null) {
    if (this.container.querySelector('.instructions-overlay')) return;

    const content = makeElement('div', { className: 'instructions-panel' },
      makeElement('button', { className: 'instructions-close-btn' }, '×'),
      makeElement('h2', {}, 'How to Play Lego Detective'),
      makeElement('ul', {},
        makeElement('li', {}, makeElement('strong', {}, 'Control the View:'), ' Drag with mouse or finger to rotate the 3D models. Scroll or pinch to zoom.'),
        makeElement('li', {}, makeElement('strong', {}, 'Find the Difference:'), ' Spot the one brick that has been moved, rotated, or removed.'),
        makeElement('li', {}, makeElement('strong', {}, 'Scoring:'), ' Gain points for correct deductions, lose points on wrong guesses.'),
        makeElement('li', {}, makeElement('strong', {}, 'Chain Reactions:'), ' Incorrect clicks can collapse unsupported structures.'),
        makeElement('li', {}, makeElement('strong', {}, 'Slide Drawer:'), ' Tap the bottom bar or swipe up/down to slide the controls.')
      )
    );

    const overlay = makeElement('div', { className: 'instructions-overlay' }, content);

    const closePopup = () => {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => {
        overlay.remove();
        if (onCloseCallback) onCloseCallback();
      }, { once: true });
    };

    const closeBtn = overlay.querySelector('.instructions-close-btn');
    if (closeBtn) closeBtn.onclick = closePopup;
    overlay.onclick = (e) => {
      if (e.target === overlay) closePopup();
    };

    this.container.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  _injectStyles() {
    const css = `
      #bottom-control-panel {
        display: flex;
        flex-direction: column;
        width: 100%;
        background: rgba(18, 22, 28, 0.94);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        color: #c9d1d9;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-sizing: border-box;
        transition: max-height 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
        max-height: 220px;
        flex-shrink: 0;
        z-index: 100;
        user-select: none;
      }
      #bottom-control-panel.is-collapsed {
        max-height: 42px;
      }
      .bottom-panel-header {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 14px 8px 14px;
        min-height: 42px;
        box-sizing: border-box;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.03);
      }
      .bottom-panel-header:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .swipe-grab-handle {
        position: absolute;
        top: 4px;
        left: 50%;
        transform: translateX(-50%);
        width: 32px;
        height: 3px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        pointer-events: none;
      }
      .panel-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .detective-badge-icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .panel-app-title {
        font-size: 12.5px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #e6edf3;
      }
      .panel-header-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .score-container {
        font-size: 13px;
        font-weight: 600;
        color: #8b949e;
      }
      #score-value {
        color: #3fb950;
        font-size: 15px;
        font-weight: 800;
      }
      .panel-toggle-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #c9d1d9;
        border-radius: 4px;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 11px;
        transition: background 0.15s;
      }
      .panel-toggle-btn:hover {
        background: rgba(255, 255, 255, 0.18);
      }
      .bottom-panel-body {
        padding: 8px 14px 14px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: hidden;
      }
      .button-group {
        display: grid;
        grid-template-columns: 1fr 1fr 40px;
        gap: 8px;
      }
      .btn-action {
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        padding: 9px 12px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: #f0f6fc;
        transition: background 0.15s, transform 0.1s;
      }
      .btn-action:hover {
        background: rgba(255, 255, 255, 0.16);
      }
      .btn-action:active {
        transform: scale(0.97);
      }
      .btn-action:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-spin {
        background: #238636;
        border-color: #2ea043;
      }
      .btn-spin:hover {
        background: #2ea043;
      }
      .btn-cheat {
        background: #8957e5;
        border-color: #a371f7;
      }
      .btn-cheat:hover {
        background: #a371f7;
      }
      .btn-help {
        font-weight: 800;
        font-size: 15px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .difficulty-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .difficulty-label {
        font-size: 12px;
        font-weight: 600;
        color: #8b949e;
        white-space: nowrap;
      }
      .difficulty-slider {
        flex: 1;
        cursor: pointer;
        accent-color: #58a6ff;
      }
      /* Subtle transparent floating message pill */
      .subtle-message-pill {
        position: absolute;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(13, 17, 23, 0.76);
        color: #f0f6fc;
        padding: 7px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        pointer-events: none;
        z-index: 90;
        text-align: center;
        max-width: 88%;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        transition: opacity 0.35s ease, transform 0.25s ease;
      }
      .subtle-message-pill.pulse-feedback {
        animation: pill-pulse 0.3s ease-out;
      }
      @keyframes pill-pulse {
        0% { transform: translateX(-50%) scale(0.96); }
        50% { transform: translateX(-50%) scale(1.04); }
        100% { transform: translateX(-50%) scale(1); }
      }
      /* Help modal overlay */
      .instructions-overlay {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.65);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; opacity: 0; transition: opacity 0.2s ease; cursor: pointer;
      }
      .instructions-overlay.visible { opacity: 1; }
      .instructions-panel {
        background: #161b22; color: #c9d1d9; padding: 1.5rem 2rem;
        border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 16px 48px rgba(0,0,0,0.8); max-width: 500px; width: 88%;
        max-height: 85vh; overflow-y: auto; position: relative; cursor: default;
      }
      .instructions-panel h2 { margin-top: 0; color: #58a6ff; font-size: 1.25rem; }
      .instructions-panel ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.85rem; font-size: 13px; }
      .instructions-panel li { line-height: 1.5; }
      .instructions-panel strong { color: #3fb950; }
      .instructions-close-btn {
        position: absolute; top: 12px; right: 12px; background: transparent;
        border: none; color: #8b949e; font-size: 1.5rem; line-height: 1;
        cursor: pointer; padding: 4px;
      }
      .instructions-close-btn:hover { color: #fff; }
    `;
    applyCss(css, 'lego-detective-ui-styles');
  }
}

globalThis.GameUI = GameUI;
if (typeof module !== 'undefined' && module.exports) module.exports = GameUI;