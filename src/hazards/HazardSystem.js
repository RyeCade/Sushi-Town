import * as THREE from 'three';
import { HAZARDS, HAZARD_KINDS } from '../utils/constants.js';
import { audio } from '../audio/AudioManager.js';

/**
 * Optional stage hazards. When enabled, each match randomly picks a kind
 * (steam vents or falling comets) and randomizes positions.
 */
export class HazardSystem {
  constructor(scene, game, stageId) {
    this.scene = scene;
    this.game = game;
    this.stageId = stageId;
    this.kind = this._pickKind();
    this.vents = [];
    this.comets = [];
    this._cometSpawnTimer = 0;
    this._hitCooldown = new WeakMap();
    this._particleGeo = new THREE.SphereGeometry(0.08, 6, 6);
    this._surfaces = this._collectSurfaces();
    this._stageBounds = this._computeStageBounds();

    if (this.kind === HAZARD_KINDS.STEAM_VENT) {
      const spots = this._randomVentSpots(2);
      for (const spot of spots) {
        this.vents.push(this._createSteamVent(spot));
      }
    } else {
      // First comet soon after match start
      this._cometSpawnTimer = 1.2 + Math.random() * 1.5;
    }
  }

  _pickKind() {
    const kinds = [HAZARD_KINDS.STEAM_VENT, HAZARD_KINDS.FALLING_COMET];
    return kinds[Math.floor(Math.random() * kinds.length)];
  }

  _collectSurfaces() {
    const platforms = this.game?.stage?.platforms || [];
    const surfaces = [];
    for (const p of platforms) {
      const w = p.bounds?.width ?? 4;
      const h = p.bounds?.height ?? 1;
      const meshX = p.mesh?.position?.x ?? 0;
      const meshY = p.mesh?.position?.y ?? 0;
      const top = meshY + h / 2 + (p.oneWay ? 0.05 : 0.14);
      surfaces.push({
        x: meshX,
        top,
        halfW: Math.max(0.4, w / 2 - 0.35),
        oneWay: !!p.oneWay
      });
    }
    if (!surfaces.length) {
      surfaces.push({ x: 0, top: 0.64, halfW: 8, oneWay: false });
    }
    return surfaces;
  }

  _computeStageBounds() {
    let minX = -9;
    let maxX = 9;
    for (const s of this._surfaces) {
      minX = Math.min(minX, s.x - s.halfW);
      maxX = Math.max(maxX, s.x + s.halfW);
    }
    return { minX: minX + 0.5, maxX: maxX - 0.5 };
  }

  _randomVentSpots(count) {
    const spots = [];
    const minSep = 2.8;
    const tries = 40;
    for (let n = 0; n < count; n++) {
      let placed = false;
      for (let t = 0; t < tries; t++) {
        const surface = this._surfaces[Math.floor(Math.random() * this._surfaces.length)];
        const x = surface.x + (Math.random() * 2 - 1) * surface.halfW;
        const y = surface.top;
        if (spots.every((s) => Math.abs(s.x - x) >= minSep || Math.abs(s.y - y) >= 1.2)) {
          spots.push({
            x,
            y,
            phase: Math.random() * HAZARDS.STEAM_VENT.period
          });
          placed = true;
          break;
        }
      }
      if (!placed && this._surfaces.length) {
        const surface = this._surfaces[n % this._surfaces.length];
        spots.push({
          x: surface.x + (n % 2 === 0 ? -0.5 : 0.5) * Math.min(1.5, surface.halfW),
          y: surface.top,
          phase: Math.random() * HAZARDS.STEAM_VENT.period
        });
      }
    }
    return spots;
  }

  _createSteamVent(def) {
    const cfg = HAZARDS.STEAM_VENT;
    const group = new THREE.Group();
    group.position.set(def.x, def.y, 0);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a52,
      roughness: 0.9,
      metalness: 0.15,
      emissive: 0x1a3020,
      emissiveIntensity: 0.15
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 12), baseMat);
    base.position.y = 0.09;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const grateMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a30,
      roughness: 0.7,
      metalness: 0.4,
      emissive: 0x44ff88,
      emissiveIntensity: 0.05
    });
    const grate = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 10), grateMat);
    grate.position.y = 0.2;
    group.add(grate);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x66ffaa,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.22;
    group.add(glow);

    this.scene.add(group);

    return {
      type: 'steam_vent',
      x: def.x,
      y: def.y,
      radius: cfg.radius,
      height: cfg.height,
      period: cfg.period,
      warnDuration: cfg.warnDuration,
      activeDuration: cfg.activeDuration,
      timer: def.phase ?? Math.random() * cfg.period,
      phase: 'idle',
      group,
      baseMat,
      grateMat,
      glowMat,
      particles: [],
      warnedSfx: false,
      burstSfx: false
    };
  }

  _surfaceTopNearX(x) {
    let best = null;
    for (const s of this._surfaces) {
      if (x < s.x - s.halfW - 0.4 || x > s.x + s.halfW + 0.4) continue;
      if (best == null || s.top > best) best = s.top;
    }
    return best ?? 0.64;
  }

  _spawnComet() {
    const cfg = HAZARDS.FALLING_COMET;
    const { minX, maxX } = this._stageBounds;
    const targetX = minX + Math.random() * Math.max(0.5, maxX - minX);
    const impactY = this._surfaceTopNearX(targetX);
    const startY = impactY + cfg.spawnHeight;

    // Ground telegraph ring
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.85, 24), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(targetX, impactY + 0.05, 0);
    this.scene.add(shadow);

    // Comet body (starts invisible until fall phase; keep at start)
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xff8844,
      emissive: 0xff4400,
      emissiveIntensity: 0.8,
      roughness: 0.45,
      metalness: 0.2
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), coreMat);
    core.position.set(targetX, startY, 0);
    core.visible = false;
    this.scene.add(core);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), glowMat);
    glow.position.copy(core.position);
    glow.visible = false;
    this.scene.add(glow);

    this.comets.push({
      type: 'falling_comet',
      targetX,
      impactY,
      startY,
      y: startY,
      radius: cfg.radius,
      warnDuration: cfg.warnDuration,
      fallSpeed: cfg.fallSpeed,
      timer: 0,
      phase: 'warn',
      shadow,
      shadowMat,
      core,
      coreMat,
      glow,
      glowMat,
      particles: [],
      hitDone: false,
      warnedSfx: false,
      impactSfx: false
    });
  }

  update(deltaTime, characters) {
    for (const char of characters || []) {
      const left = this._hitCooldown.get(char);
      if (left != null) {
        const next = left - deltaTime;
        if (next <= 0) this._hitCooldown.delete(char);
        else this._hitCooldown.set(char, next);
      }
    }

    if (this.kind === HAZARD_KINDS.STEAM_VENT) {
      this._updateVents(deltaTime, characters);
    } else {
      this._updateComets(deltaTime, characters);
    }
  }

  _updateVents(deltaTime, characters) {
    for (const vent of this.vents) {
      vent.timer += deltaTime;
      if (vent.timer >= vent.period) {
        vent.timer -= vent.period;
        vent.warnedSfx = false;
        vent.burstSfx = false;
      }

      const t = vent.timer;
      const warnBegin = vent.period - vent.activeDuration - vent.warnDuration;
      const activeBegin = vent.period - vent.activeDuration;

      let phase = 'idle';
      if (t >= activeBegin) phase = 'active';
      else if (t >= warnBegin) phase = 'warn';
      vent.phase = phase;

      this._updateVentVisual(vent, deltaTime);
      if (phase === 'active') {
        this._tryHitVent(vent, characters);
      }
    }
  }

  _updateComets(deltaTime, characters) {
    const cfg = HAZARDS.FALLING_COMET;
    this._cometSpawnTimer -= deltaTime;
    if (this._cometSpawnTimer <= 0 && this.comets.length < cfg.maxActive) {
      this._spawnComet();
      this._cometSpawnTimer = cfg.spawnIntervalMin
        + Math.random() * (cfg.spawnIntervalMax - cfg.spawnIntervalMin);
    }

    for (let i = this.comets.length - 1; i >= 0; i--) {
      const comet = this.comets[i];
      comet.timer += deltaTime;

      if (comet.phase === 'warn') {
        const u = Math.min(1, comet.timer / comet.warnDuration);
        const pulse = 0.2 + 0.8 * Math.abs(Math.sin(u * Math.PI * 8));
        comet.shadowMat.opacity = 0.15 + pulse * 0.55;
        const scale = 0.7 + u * 0.5 + pulse * 0.15;
        comet.shadow.scale.set(scale, scale, 1);
        if (!comet.warnedSfx && u > 0.12) {
          comet.warnedSfx = true;
          audio.playHazardWarn?.();
        }
        if (comet.timer >= comet.warnDuration) {
          comet.phase = 'fall';
          comet.core.visible = true;
          comet.glow.visible = true;
          comet.y = comet.startY;
        }
      } else if (comet.phase === 'fall') {
        comet.y -= comet.fallSpeed * deltaTime;
        comet.core.position.set(comet.targetX, comet.y, 0);
        comet.glow.position.set(comet.targetX, comet.y, 0);
        comet.core.rotation.x += deltaTime * 4;
        comet.core.rotation.z += deltaTime * 3;
        this._spawnCometTrail(comet);

        // Hit while falling through fighters
        if (!comet.hitDone) {
          this._tryHitComet(comet, characters);
        }

        if (comet.y <= comet.impactY + 0.2) {
          comet.phase = 'impact';
          comet.timer = 0;
          comet.core.position.y = comet.impactY + 0.25;
          comet.glow.position.y = comet.impactY + 0.25;
          if (!comet.impactSfx) {
            comet.impactSfx = true;
            audio.playHazardBurst?.();
            if (this.game?.addCameraShake) this.game.addCameraShake(0.35);
          }
          if (!comet.hitDone) {
            this._tryHitComet(comet, characters, true);
          }
          this._spawnImpactBurst(comet);
        }
      } else if (comet.phase === 'impact') {
        comet.shadowMat.opacity *= Math.pow(0.02, deltaTime);
        comet.coreMat.emissiveIntensity = Math.max(0, 1.2 - comet.timer * 3);
        comet.glowMat.opacity = Math.max(0, 0.5 - comet.timer * 1.5);
        const s = Math.max(0.01, 1 - comet.timer * 2.2);
        comet.core.scale.setScalar(s);
        comet.glow.scale.setScalar(s * 1.2);
        if (comet.timer > 0.55 && comet.particles.length === 0) {
          this._disposeComet(comet);
          this.comets.splice(i, 1);
          continue;
        }
      }

      this._updateParticles(comet.particles, deltaTime);
    }
  }

  _updateVentVisual(vent, dt) {
    const t = vent.timer;
    const warnBegin = vent.period - vent.activeDuration - vent.warnDuration;

    if (vent.phase === 'warn') {
      const u = (t - warnBegin) / Math.max(vent.warnDuration, 0.001);
      const pulse = 0.25 + 0.75 * Math.abs(Math.sin(u * Math.PI * 6));
      vent.grateMat.emissiveIntensity = 0.2 + pulse * 1.4;
      vent.glowMat.opacity = 0.15 + pulse * 0.45;
      vent.baseMat.emissiveIntensity = 0.2 + pulse * 0.5;
      if (!vent.warnedSfx && u > 0.15) {
        vent.warnedSfx = true;
        audio.playHazardWarn?.();
      }
    } else if (vent.phase === 'active') {
      vent.grateMat.emissiveIntensity = 1.8;
      vent.glowMat.opacity = 0.55;
      vent.baseMat.emissiveIntensity = 0.9;
      if (!vent.burstSfx) {
        vent.burstSfx = true;
        audio.playHazardBurst?.();
        if (this.game?.addCameraShake) this.game.addCameraShake(0.18);
      }
      this._spawnSteamParticles(vent);
    } else {
      vent.grateMat.emissiveIntensity = 0.05 + Math.sin(t * 2) * 0.03;
      vent.glowMat.opacity = 0.08;
      vent.baseMat.emissiveIntensity = 0.12;
    }

    this._updateParticles(vent.particles, dt);
  }

  _updateParticles(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.wobble) {
        p.mesh.position.x += Math.sin(p.life * 12 + p.seed) * 0.4 * dt;
      }
      const scale = Math.max(0.12, p.life / p.maxLife) * (p.baseScale ?? 1);
      p.mesh.scale.setScalar(scale);
      if (p.mesh.material?.opacity != null) {
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife) * (p.maxOpacity ?? 0.7);
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry?.dispose?.();
        p.mesh.material?.dispose?.();
        list.splice(i, 1);
      }
    }
  }

  _spawnSteamParticles(vent) {
    if (vent.particles.length > 18) return;
    if (Math.random() > 0.55) return;

    // Shared particle system for softer steam wisps
    this.game?.particles?.spawnSteam?.(
      new THREE.Vector3(vent.x, vent.y + 0.3, 0),
      0.7
    );

    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.5 ? 0xb8ffe0 : 0xe8fff4,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this._particleGeo, mat);
    mesh.position.set(
      vent.x + (Math.random() - 0.5) * 0.35,
      vent.y + 0.25,
      (Math.random() - 0.5) * 0.2
    );
    this.scene.add(mesh);
    vent.particles.push({
      mesh,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        4 + Math.random() * 3.5,
        (Math.random() - 0.5) * 0.5
      ),
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.7,
      seed: Math.random() * 10,
      wobble: true
    });
  }

  _spawnCometTrail(comet) {
    if (comet.particles.length > 22) return;
    if (Math.random() > 0.5) return;
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.4 ? 0xff6622 : 0xffcc66,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this._particleGeo, mat);
    mesh.position.set(
      comet.targetX + (Math.random() - 0.5) * 0.25,
      comet.y + 0.1,
      (Math.random() - 0.5) * 0.15
    );
    this.scene.add(mesh);
    comet.particles.push({
      mesh,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * 0.8
      ),
      life: 0.25 + Math.random() * 0.2,
      maxLife: 0.4,
      seed: Math.random() * 10,
      maxOpacity: 0.75
    });
  }

  _spawnImpactBurst(comet) {
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff5522 : 0xffcc44,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(this._particleGeo, mat);
      mesh.position.set(comet.targetX, comet.impactY + 0.3, 0);
      this.scene.add(mesh);
      const ang = (i / 14) * Math.PI * 2;
      comet.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(ang) * (4 + Math.random() * 5),
          3 + Math.random() * 6,
          Math.sin(ang) * 0.4
        ),
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.55,
        seed: i,
        baseScale: 1.2,
        maxOpacity: 0.9
      });
    }
  }

  _tryHitVent(vent, characters) {
    const cfg = HAZARDS.STEAM_VENT;
    const r = vent.radius;
    const top = vent.y + vent.height;
    const bot = vent.y;

    for (const char of characters || []) {
      if (!char?.body || char.isDead || char.isInvincible) continue;
      const cd = this._hitCooldown.get(char);
      if (cd != null && cd > 0) continue;

      const pos = char.body.translation();
      const dx = pos.x - vent.x;
      if (Math.abs(dx) > r) continue;
      const feet = pos.y - (char._halfHeight ?? 0.75);
      const head = pos.y + (char._halfHeight ?? 0.75);
      if (head < bot || feet > top) continue;

      const knockback = new THREE.Vector3(0, cfg.baseKnockback, 0);
      if (Math.abs(dx) > 0.05) {
        knockback.x = Math.sign(dx) * cfg.baseKnockback * 0.12;
      }

      const hitPos = new THREE.Vector3(pos.x, pos.y, 0);
      const result = char.takeHit(cfg.damage, knockback, cfg.hitstun, cfg.hitlag, hitPos, false, 0x66ffaa);
      if (result?.ignored) continue;

      this._hitCooldown.set(char, cfg.hitCooldown);
      audio.playHit({ heavy: false });
      this.game?.combatSystem?.spawnHitEffect?.(hitPos, 0x66ffaa);
      this.game?.addCameraShake?.(0.22);
    }
  }

  _tryHitComet(comet, characters, impact = false) {
    const cfg = HAZARDS.FALLING_COMET;
    const r = impact ? cfg.impactRadius : cfg.radius;
    const cy = impact ? comet.impactY + 0.4 : comet.y;

    for (const char of characters || []) {
      if (!char?.body || char.isDead || char.isInvincible) continue;
      const cd = this._hitCooldown.get(char);
      if (cd != null && cd > 0) continue;

      const pos = char.body.translation();
      const dx = pos.x - comet.targetX;
      const dy = pos.y - cy;
      if (Math.abs(dx) > r || Math.abs(dy) > r * 1.4) continue;

      const knockback = new THREE.Vector3(
        (Math.abs(dx) > 0.05 ? Math.sign(dx) : (Math.random() > 0.5 ? 1 : -1)) * cfg.baseKnockback * 0.55,
        cfg.baseKnockback * (impact ? 0.75 : 0.45),
        0
      );

      const hitPos = new THREE.Vector3(pos.x, pos.y, 0);
      const result = char.takeHit(cfg.damage, knockback, cfg.hitstun, cfg.hitlag, hitPos, false, 0xff6622);
      if (result?.ignored) continue;

      comet.hitDone = true;
      this._hitCooldown.set(char, cfg.hitCooldown);
      audio.playHit({ heavy: true });
      this.game?.combatSystem?.spawnHitEffect?.(hitPos, 0xff6622);
      this.game?.addCameraShake?.(0.28);
    }
  }

  _disposeComet(comet) {
    for (const p of comet.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry?.dispose?.();
      p.mesh.material?.dispose?.();
    }
    comet.particles = [];
    for (const mesh of [comet.shadow, comet.core, comet.glow]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
  }

  dispose() {
    for (const vent of this.vents) {
      for (const p of vent.particles) {
        this.scene.remove(p.mesh);
        p.mesh.geometry?.dispose?.();
        p.mesh.material?.dispose?.();
      }
      vent.particles = [];
      this.scene.remove(vent.group);
      vent.group.traverse((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
        else child.material?.dispose?.();
      });
    }
    this.vents = [];

    for (const comet of this.comets) {
      this._disposeComet(comet);
    }
    this.comets = [];

    this._particleGeo?.dispose?.();
    this._particleGeo = null;
  }
}
