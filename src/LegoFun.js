class LegoFun {
  constructor() {
    this.app = null;
    this.legoFactory = null;
    this.gameUI = null;
    this.gameController = null;
    this.raycaster = null;
    this._pointerDownPos = { x: 0, y: 0, time: 0 };
  }

  onResize(width, height) {
    if (!width || !height) {
      const rect = this.canvasContainer ? this.canvasContainer.getBoundingClientRect() : null;
      if (rect) {
        width = rect.width;
        height = rect.height;
      }
    }
    if (this.app && width > 0 && height > 0) {
      if (typeof this.app.resize === 'function') {
        this.app.resize(width, height);
      }
      const isVertical = height > width;
      if (this.gameController && typeof this.gameController.updateLayout === 'function') {
        this.gameController.updateLayout(isVertical);
      }
    }
  }

  onPointerDown(event) {
    this._pointerDownPos.x = event.clientX;
    this._pointerDownPos.y = event.clientY;
    this._pointerDownPos.time = performance.now();
  }

  onPointerUp(event) {
    if (!this.app || !this.app.renderer || !this.app.camera || !this.gameController) return;

    const dx = event.clientX - this._pointerDownPos.x;
    const dy = event.clientY - this._pointerDownPos.y;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - this._pointerDownPos.time;

    // Only pick on direct tap (< 6px drag and < 400ms duration)
    if (dist > 6 || elapsed > 400) {
      return;
    }

    const THREE = this.app.THREE;
    const mouse = new THREE.Vector2();
    const rect = this.app.renderer.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(mouse, this.app.camera);

    const targets = [this.gameController.groupA, this.gameController.groupB].filter(Boolean);
    const intersects = this.raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      this.gameController.handlePick(intersects[0].object);
    }
  }

  async run(env) {
    if (this.rootElement) this.destroy();

    this.env = env;
    const parentElement = env?.container || document.getElementById('app-root') || document.body;

    if (parentElement === document.body) {
      document.documentElement.style.height = '100%';
      document.documentElement.style.width = '100%';
      document.documentElement.style.margin = '0';
      document.body.style.height = '100%';
      document.body.style.width = '100%';
      document.body.style.margin = '0';
    }

    parentElement.style.position = 'relative';
    parentElement.style.width = '100%';
    parentElement.style.height = '100%';
    parentElement.style.margin = '0';
    parentElement.style.padding = '0';
    parentElement.style.overflow = 'hidden';
    parentElement.style.background = '#0d1117';
    parentElement.style.display = 'flex';
    parentElement.style.flexDirection = 'column';

    const canvasId = 'canvas-container-' + Math.random().toString(36).slice(2);
    this.canvasContainer = makeElement('div', {
      id: canvasId,
      style: {
        flex: '1 1 auto',
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '0',
        overflow: 'hidden',
        background: '#0d1117',
      },
    });
    parentElement.appendChild(this.canvasContainer);
    this.rootElement = this.canvasContainer;

    if (
      !this.canvasContainer._appResizeObserver &&
      typeof ResizeObserver !== 'undefined'
    ) {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (typeof this.onResize === 'function') {
            this.onResize(entry.contentRect.width, entry.contentRect.height);
          }
        }
      });
      ro.observe(this.canvasContainer);
      this.canvasContainer._appResizeObserver = ro;
    }

    this.app = new ThreeJSLoader(canvasId, {
      cameraPos: { x: 0, y: 150, z: 250 },
      enableControls: true,
      hdrPath: null
    });

    await this.app.init(this.canvasContainer);

    if (this.app.scene) {
      this.app.scene.background = null;
    }

    // Studio lights for crisp visibility
    const THREE = this.app.THREE;
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.0);
    hemiLight.position.set(0, 500, 0);
    this.app.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(200, 400, 200);
    this.app.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x58a6ff, 0.7);
    fillLight.position.set(-200, 200, -200);
    this.app.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00f2fe, 0.6);
    rimLight.position.set(0, 300, -300);
    this.app.scene.add(rimLight);

    this.legoFactory = new LegoFactory();
    this.raycaster = new this.app.THREE.Raycaster();

    if (this.app.controls) {
      this.app.controls.maxDistance = 5000;
      this.app.controls.minDistance = 5;
    }
    if (this.app.camera) {
      this.app.camera.far = 5000;
      this.app.camera.updateProjectionMatrix();
    }
    if (this.app.renderer) {
      this.app.renderer.toneMappingExposure = 1.0;
    }

    this.gameUI = new GameUI(parentElement, this.env);
    this.gameController = new GameController({
      scene: this.app.scene,
      legoFactory: this.legoFactory,
      ui: this.gameUI,
      app: this.app,
    });

    this.gameController.init();
    this.app.onUpdateCallback = () => this.gameController.update();

    this._onResizeBound = () => this.onResize();
    window.addEventListener('resize', this._onResizeBound, false);

    const initialRect = this.canvasContainer.getBoundingClientRect();
    if (initialRect.width > 0 && initialRect.height > 0) {
      this.onResize(initialRect.width, initialRect.height);
    }

    this._onPointerDownBound = this.onPointerDown.bind(this);
    this._onPointerUpBound = this.onPointerUp.bind(this);

    this.app.renderer.domElement.addEventListener('pointerdown', this._onPointerDownBound, false);
    this.app.renderer.domElement.addEventListener('pointerup', this._onPointerUpBound, false);

    return this;
  }

  destroy() {
    if (this._onResizeBound) {
      window.removeEventListener('resize', this._onResizeBound, false);
      this._onResizeBound = null;
    }
    if (this.app && this.app.renderer && this.app.renderer.domElement) {
      if (this._onPointerDownBound) {
        this.app.renderer.domElement.removeEventListener('pointerdown', this._onPointerDownBound, false);
      }
      if (this._onPointerUpBound) {
        this.app.renderer.domElement.removeEventListener('pointerup', this._onPointerUpBound, false);
      }
    }
    if (this.canvasContainer && this.canvasContainer._appResizeObserver) {
      this.canvasContainer._appResizeObserver.disconnect();
      this.canvasContainer._appResizeObserver = null;
    }
    if (this.app && typeof this.app.destroy === 'function') {
      try { this.app.destroy(); } catch(e) {}
    }
    this.app = null;

    if (this.gameUI) {
      if (this.gameUI.bottomPanel) {
        this.gameUI.bottomPanel.remove();
      }
      if (this.gameUI.feedbackNode) {
        this.gameUI.feedbackNode.remove();
      }
      this.gameUI = null;
    }

    if (this.canvasContainer && this.canvasContainer.parentElement) {
      this.canvasContainer.remove();
    }
    this.canvasContainer = null;
    this.rootElement = null;
    this.gameController = null;
  }
}

globalThis.LegoFun = LegoFun;
if (typeof module !== 'undefined' && module.exports) module.exports = LegoFun;