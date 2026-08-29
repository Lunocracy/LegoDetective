class AnimationManager {
  constructor({ scene, legoFactory }) {
    this.scene = scene;
    this.legoFactory = legoFactory;

    this._fallQueue = [];
    this._flashQueue = [];
    this._particleQueue = [];
    this._exitQueue = [];
    this._alternatingQueue = [];
  }

  update(dt) {
    if (this._fallQueue.length) this._animateFalls(dt);
    if (this._flashQueue.length) this._animateFlashes(dt);
    if (this._particleQueue.length) this._animateParticles(dt);
    if (this._exitQueue.length) this._animateExits(dt);
    if (this._alternatingQueue.length) this._animateAlternating(dt);
  }

  startFlash(meshes, config = {}) {
    const {
      duration: durationSec = 2.0,
      lift: liftAndScale = false,
      color: flashColor = 'rainbow',
      pulseCount = 6,
    } = config;

    meshes = meshes.filter(Boolean);
    if (meshes.length === 0) return;

    meshes.forEach((m) => {
      m.userData._origY = m.position.y;
      m.userData._origScale = m.scale.clone();
      m.traverse((ch) => {
        if (ch.isMesh) {
          ch.userData._origEm = ch.material.emissive
            ? ch.material.emissive.clone()
            : new THREE.Color(0x000000);
          if (!ch.material.emissive)
            ch.material.emissive = new THREE.Color(0x000000);
        }
      });
    });
    this._flashQueue.push({
      meshes,
      t: 0,
      dur: durationSec,
      lift: liftAndScale,
      color: flashColor,
      pulses: pulseCount,
      lastPlayedPulse: -1,
    });
  }

  // --- Relative Delta-Based Alternating Animation ---
  startAlternatingDiffAnimation({
    meshA,
    meshB,
    diffInfo,
    duration = 2.6,
    cycles = 3,
    onComplete = null,
  }) {
    if (!meshA || !diffInfo) return;

    const deltaPos = diffInfo.deltaPos ? diffInfo.deltaPos.clone() : new THREE.Vector3(0, 0, 0);
    const deltaRot = diffInfo.deltaRot !== undefined ? diffInfo.deltaRot : 0;
    const type = diffInfo.type || 'move';

    // Store resting transforms & original emissive colors
    const prepareMesh = (m) => {
      if (!m) return;
      m.userData._origPos = m.position.clone();
      m.userData._origRotY = m.rotation.y;
      m.userData._origScale = m.scale.clone();
      m.traverse((ch) => {
        if (ch.isMesh) {
          if (!ch.userData._origEm) {
            ch.userData._origEm = ch.material.emissive
              ? ch.material.emissive.clone()
              : new THREE.Color(0x000000);
          }
          if (!ch.material.emissive) ch.material.emissive = new THREE.Color(0x000000);
        }
      });
    };

    prepareMesh(meshA);
    if (meshB) prepareMesh(meshB);

    // Dynamic resting and target endpoints in each model's local coordinate frame
    const startPosA = meshA.position.clone();
    const startRotA = meshA.rotation.y;
    const targetPosA = startPosA.clone().add(deltaPos);
    const targetRotA = startRotA + deltaRot;

    let startPosB = null;
    let startRotB = 0;
    let targetPosB = null;
    let targetRotB = 0;

    let ghostMeshB = null;
    if (type === 'missing' && !meshB) {
      ghostMeshB = meshA.clone(true);
      ghostMeshB.visible = true;
      ghostMeshB.scale.set(0.001, 0.001, 0.001);
      ghostMeshB.position.copy(meshA.position);
      ghostMeshB.rotation.copy(meshA.rotation);
      if (meshA.parent && meshA.parent.parent) {
        const groupB = meshA.parent.parent.children[1]?.children[0];
        if (groupB) groupB.add(ghostMeshB);
      }
      prepareMesh(ghostMeshB);
      startPosB = ghostMeshB.position.clone();
      startRotB = ghostMeshB.rotation.y;
      targetPosB = startPosB.clone();
      targetRotB = startRotB;
    } else if (meshB) {
      startPosB = meshB.position.clone();
      startRotB = meshB.rotation.y;
      // In Model B, target (State A) is startPosB - deltaPos
      targetPosB = startPosB.clone().sub(deltaPos);
      targetRotB = startRotB - deltaRot;
    }

    this._alternatingQueue.push({
      meshA,
      meshB: meshB || ghostMeshB,
      isGhostB: !!ghostMeshB,
      startPosA,
      startRotA,
      targetPosA,
      targetRotA,
      startPosB,
      startRotB,
      targetPosB,
      targetRotB,
      type,
      duration,
      cycles,
      t: 0,
      lastApex: -1,
      onComplete,
    });
  }

  prepareDropAnimation(
    bricks,
    clonesById,
    dropH = 120,
    minDur = 0.45,
    maxDur = 0.7,
    staggerSec = 0.03
  ) {
    const sortedBricks = bricks
      .slice()
      .sort((a, b) => a.baseLayer - b.baseLayer);

    const totalCount = sortedBricks.length * 2;
    if (globalThis.soundFX) {
      const estimatedDuration = maxDur + sortedBricks.length * staggerSec;
      globalThis.soundFX.playDropWhoosh(estimatedDuration);
    }

    let idx = 0;
    const queueOne = (mesh, baseLayer) => {
      if (!mesh) return;
      mesh.visible = false;
      const targetY = mesh.position.y;
      mesh.position.y = targetY + dropH;
      this._fallQueue.push({
        mesh,
        startY: mesh.position.y,
        targetY,
        t: 0,
        dur: minDur + Math.random() * (maxDur - minDur),
        delay: idx * staggerSec,
        layer: baseLayer,
        index: idx,
        total: totalCount,
      });
      idx++;
    };

    for (const rec of sortedBricks) {
      queueOne(rec.mesh, rec.baseLayer);
      const clone = clonesById.get(rec.id);
      if (clone) queueOne(clone, rec.baseLayer);
    }
  }

  createExplosion(mesh, record, options = {}) {
    const { count = 35, sizeMultiplier = 1.0, color = record.color } = options;

    const spacing = this.legoFactory.STUD_SPACING;
    const widthMM = record.width * spacing;
    const lengthMM = record.length * spacing;
    const heightMM = record.isPlate
      ? this.legoFactory.PLATE_THICKNESS
      : this.legoFactory.BRICK_HEIGHT;

    const worldPos = mesh.getWorldPosition(new THREE.Vector3());
    const worldRot = mesh.getWorldQuaternion(new THREE.Quaternion());

    let singleMaterial = null;
    if (color !== 'rainbow') {
      singleMaterial = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.1,
        roughness: 0.4,
      });
    }

    const geoTypes = ['box', 'sphere', 'cone'];

    for (let i = 0; i < count; i++) {
      const baseSize = (1.5 + Math.random() * 2.5) * sizeMultiplier;
      let chunkGeo;

      const type = geoTypes[Math.floor(Math.random() * geoTypes.length)];
      switch (type) {
        case 'sphere':
          chunkGeo = new THREE.SphereGeometry(baseSize * 0.7, 8, 6);
          break;
        case 'cone':
          chunkGeo = new THREE.ConeGeometry(baseSize * 0.6, baseSize * 1.2, 16);
          break;
        default:
          const w = baseSize;
          const h = baseSize * (1 + Math.random());
          const d = baseSize * (1 + Math.random());
          chunkGeo = new THREE.BoxGeometry(w, h, d);
          break;
      }

      let chunkMat;
      if (singleMaterial) {
        chunkMat = singleMaterial;
      } else {
        chunkMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(Math.random(), 0.85, 0.6),
          metalness: 0.1,
          roughness: 0.4,
        });
      }

      const chunk = new THREE.Mesh(chunkGeo, chunkMat);

      const localOffset = new THREE.Vector3(
        (Math.random() - 0.5) * widthMM,
        (Math.random() - 0.5) * heightMM,
        (Math.random() - 0.5) * lengthMM
      );
      localOffset.applyQuaternion(worldRot);
      chunk.position.copy(worldPos).add(localOffset);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 60 * sizeMultiplier,
        (Math.random() * 0.7 + 0.3) * 70 * sizeMultiplier,
        (Math.random() - 0.5) * 60 * sizeMultiplier
      );

      const rotationSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      );

      const life = (Math.random() * 1.2 + 0.6) * (1 + sizeMultiplier * 0.4);

      this.scene.add(chunk);
      this._particleQueue.push({
        mesh: chunk,
        velocity: velocity,
        rotationSpeed: rotationSpeed,
        lifespan: life,
        initialLifespan: life,
      });
    }
  }

  startExitAnimation(pivot, speed, isVertical) {
    if (!pivot) return;

    const lifespan = 0.5;
    this._exitQueue.push({
      pivot,
      speed,
      lifespan: lifespan,
      initialLifespan: lifespan,
      wasVertical: isVertical,
    });
  }

  // --- Private Animation Implementations ---

  _animateAlternating(dt) {
    for (let i = this._alternatingQueue.length - 1; i >= 0; i--) {
      const item = this._alternatingQueue[i];
      item.t += dt;
      const p = Math.min(1.0, item.t / item.duration);

      // Anti-phase harmonic interpolation weights
      // kA moves: 0 (State A) -> 1 (State B) -> 0 -> 1 -> 0
      // kB moves: 1 (State B) -> 0 (State A) -> 1 -> 0 -> 1
      const angle = p * item.cycles * Math.PI * 2;
      const kA = 0.5 - 0.5 * Math.cos(angle);
      const kB = 1.0 - kA;

      const currentApex = Math.floor(p * item.cycles * 2);
      if (currentApex !== item.lastApex && currentApex < item.cycles * 2) {
        item.lastApex = currentApex;
        if (globalThis.soundFX) {
          globalThis.soundFX.playSolvePulse(currentApex, item.cycles * 2);
        }
      }

      // 1. Mesh A interpolation (from startPosA to targetPosA)
      if (item.meshA) {
        item.meshA.position.lerpVectors(item.startPosA, item.targetPosA, kA);
        item.meshA.rotation.y = THREE.MathUtils.lerp(item.startRotA, item.targetRotA, kA);

        const glowColor = new THREE.Color(0x3fb950);
        const glowPulse = Math.sin(angle) * 0.4 + 0.6;
        item.meshA.traverse((ch) => {
          if (ch.isMesh && ch.material && ch.material.emissive) {
            ch.material.emissive.copy(ch.userData._origEm || new THREE.Color(0)).lerp(glowColor, glowPulse);
          }
        });
      }

      // 2. Mesh B interpolation in anti-phase (from startPosB to targetPosB)
      if (item.meshB) {
        if (item.type === 'missing') {
          const s = Math.max(0.001, kB);
          item.meshB.scale.set(s, s, s);
          item.meshB.visible = s > 0.05;
        } else {
          // When kB = 1 (start), meshB is at startPosB; when kB = 0, meshB is at targetPosB
          item.meshB.position.lerpVectors(item.targetPosB, item.startPosB, kB);
          item.meshB.rotation.y = THREE.MathUtils.lerp(item.targetRotB, item.startRotB, kB);
        }

        const glowColor = new THREE.Color(0x58a6ff);
        const glowPulse = Math.sin(angle + Math.PI) * 0.4 + 0.6;
        item.meshB.traverse((ch) => {
          if (ch.isMesh && ch.material && ch.material.emissive) {
            ch.material.emissive.copy(ch.userData._origEm || new THREE.Color(0)).lerp(glowColor, glowPulse);
          }
        });
      }

      // 3. Clean wrap-up
      if (p >= 1.0) {
        const restoreMesh = (m) => {
          if (!m) return;
          if (m.userData._origPos) m.position.copy(m.userData._origPos);
          if (m.userData._origRotY !== undefined) m.rotation.y = m.userData._origRotY;
          if (m.userData._origScale) m.scale.copy(m.userData._origScale);
          m.traverse((ch) => {
            if (ch.isMesh && ch.userData._origEm) {
              ch.material.emissive.copy(ch.userData._origEm);
              delete ch.userData._origEm;
            }
          });
          delete m.userData._origPos;
          delete m.userData._origRotY;
          delete m.userData._origScale;
        };

        restoreMesh(item.meshA);
        if (item.isGhostB && item.meshB) {
          if (item.meshB.parent) item.meshB.parent.remove(item.meshB);
        } else if (item.meshB) {
          restoreMesh(item.meshB);
        }

        if (typeof item.onComplete === 'function') {
          item.onComplete();
        }

        this._alternatingQueue.splice(i, 1);
      }
    }
  }

  _animateFalls(dt) {
    for (let i = this._fallQueue.length - 1; i >= 0; i--) {
      const a = this._fallQueue[i];
      if (a.delay > 0) {
        a.delay -= dt;
        continue;
      }
      if (!a.mesh.visible) {
        a.mesh.visible = true;
      }
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      const eased = 1 - Math.pow(1 - k, 3);
      a.mesh.position.y = a.startY + (a.targetY - a.startY) * eased;
      if (k === 1) {
        if (globalThis.soundFX) {
          globalThis.soundFX.playDropLock(a.layer || 1, a.index || 0, a.total || 20);
        }
        this._fallQueue.splice(i, 1);
      }
    }
  }

  _animateFlashes(dt) {
    for (let i = this._flashQueue.length - 1; i >= 0; i--) {
      const f = this._flashQueue[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);

      const cycle = f.t / (f.dur / f.pulses);
      const currentPulseIdx = Math.floor(cycle);
      if (f.lift && currentPulseIdx !== f.lastPlayedPulse && currentPulseIdx < f.pulses) {
        f.lastPlayedPulse = currentPulseIdx;
        if (globalThis.soundFX) {
          globalThis.soundFX.playSolvePulse(currentPulseIdx, f.pulses);
        }
      }

      const pulse = Math.sin(k * Math.PI * f.pulses) * 0.5 + 0.5;

      let col;
      if (f.color === 'rainbow') {
        col = new THREE.Color().setHSL((f.t * 0.5) % 1, 1, 0.5);
      } else {
        col = new THREE.Color(f.color);
      }

      f.meshes.forEach((m) => {
        if (f.lift) {
          m.position.y = m.userData._origY + 12 * pulse;
          const s = 1 + 0.18 * pulse;
          m.scale.set(
            m.userData._origScale.x * s,
            m.userData._origScale.y * s,
            m.userData._origScale.z * s
          );
        }
        m.traverse((ch) => {
          if (ch.isMesh && ch.material.emissive) {
            ch.material.emissive.copy(ch.userData._origEm).lerp(col, pulse);
          }
        });
      });

      if (k >= 1) {
        f.meshes.forEach((m) => {
          m.position.y = m.userData._origY;
          m.scale.copy(m.userData._origScale);
          delete m.userData._origY;
          delete m.userData._origScale;
          m.traverse((ch) => {
            if (ch.isMesh && ch.userData._origEm) {
              ch.material.emissive.copy(ch.userData._origEm);
              delete ch.userData._origEm;
            }
          });
        });
        this._flashQueue.splice(i, 1);
      }
    }
  }

  _animateParticles(dt) {
    const gravity = new THREE.Vector3(0, -35.0, 0);
    for (let i = this._particleQueue.length - 1; i >= 0; i--) {
      const p = this._particleQueue[i];
      p.lifespan -= dt;

      if (p.lifespan <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        const material = p.mesh.material;
        const isLastUser = !this._particleQueue.some(
          (other, index) => index !== i && other.mesh.material === material
        );
        if (isLastUser) {
          material.dispose();
        }
        this._particleQueue.splice(i, 1);
      } else {
        p.velocity.add(gravity.clone().multiplyScalar(dt));
        p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

        p.mesh.rotation.x += p.rotationSpeed.x * dt;
        p.mesh.rotation.y += p.rotationSpeed.y * dt;
        p.mesh.rotation.z += p.rotationSpeed.z * dt;

        if (p.mesh.material.transparent === false) {
          p.mesh.material.transparent = true;
        }
        p.mesh.material.opacity = Math.max(0, p.lifespan / p.initialLifespan);
      }
    }
  }

  _animateExits(dt) {
    for (let i = this._exitQueue.length - 1; i >= 0; i--) {
      const item = this._exitQueue[i];
      item.lifespan -= dt;

      if (item.lifespan <= 0) {
        this.scene.remove(item.pivot);
        item.pivot.traverse((o) => {
          o.geometry?.dispose?.();
          if (o.material) {
            Array.isArray(o.material)
              ? o.material.forEach((m) => m.dispose())
              : o.material.dispose();
          }
        });
        this._exitQueue.splice(i, 1);
      } else {
        const k = 1.0 - item.lifespan / item.initialLifespan;
        const easedK = k * k;

        const moveDelta = item.speed * dt;
        if (item.wasVertical) {
          item.pivot.position.y += moveDelta;
        } else {
          item.pivot.position.x += moveDelta;
        }

        const scale = 1.0 - easedK;
        item.pivot.scale.set(scale, scale, scale);
      }
    }
  }
}

globalThis.AnimationManager = AnimationManager;
if (typeof module !== 'undefined' && module.exports) module.exports = AnimationManager;