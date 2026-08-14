import * as THREE from 'three';

/**
 * Lightweight pooled particle bursts: steam, crumbs, KO confetti, dust.
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this._sphereGeo = new THREE.SphereGeometry(1, 6, 5);
    this._boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this._planeGeo = new THREE.PlaneGeometry(1, 1);
  }

  spawn({
    position,
    count = 8,
    color = 0xffffff,
    colors = null,
    lifetime = 0.6,
    speed = 4,
    gravity = 12,
    size = 0.08,
    sizeVariance = 0.06,
    shape = 'sphere',
    fade = true,
    upwardBias = 0.4,
    spread = 1,
    drag = 0.98,
    expand = 0,
    emissiveBoost = false
  }) {
    const origin = position.clone ? position.clone() : new THREE.Vector3().copy(position);
    const palette = colors ?? [color];

    for (let i = 0; i < count; i++) {
      const c = palette[(Math.random() * palette.length) | 0];
      const mat = new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: emissiveBoost ? 1 : 0.9,
        depthWrite: false
      });
      const geo = shape === 'box' ? this._boxGeo : shape === 'plane' ? this._planeGeo : this._sphereGeo;
      const mesh = new THREE.Mesh(geo, mat);
      const s = size + Math.random() * sizeVariance;
      mesh.scale.setScalar(s);
      mesh.position.copy(origin);
      if (shape === 'plane') {
        mesh.rotation.x = -Math.PI / 2;
      }
      this.scene.add(mesh);

      const ang = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.3) * Math.PI * 0.5 * spread;
      const spd = speed * (0.5 + Math.random());
      const velocity = new THREE.Vector3(
        Math.cos(ang) * Math.cos(elev) * spd * spread,
        Math.sin(elev) * spd + upwardBias * speed,
        Math.sin(ang) * Math.cos(elev) * spd * 0.35 * spread
      );

      this.particles.push({
        mesh,
        mat,
        velocity,
        lifetime: lifetime * (0.7 + Math.random() * 0.5),
        age: 0,
        gravity,
        drag,
        fade,
        expand,
        baseScale: s
      });
    }
  }

  /** Soft white steam wisps (tempura / vents). */
  spawnSteam(position, intensity = 1) {
    this.spawn({
      position,
      count: Math.floor(4 * intensity),
      color: 0xf0f4ff,
      colors: [0xf0f4ff, 0xdde8f5, 0xffffff],
      lifetime: 0.9,
      speed: 1.2,
      gravity: -2,
      size: 0.1,
      sizeVariance: 0.12,
      upwardBias: 1.2,
      spread: 0.5,
      drag: 0.96,
      expand: 2.5
    });
  }

  /** Food crumbs on hit. */
  spawnCrumbs(position, color = 0xe8b84a) {
    this.spawn({
      position,
      count: 10,
      color,
      colors: [color, 0xf5d078, 0xc9942e, 0xfff0c0],
      lifetime: 0.55,
      speed: 7,
      gravity: 22,
      size: 0.04,
      sizeVariance: 0.05,
      shape: 'box',
      upwardBias: 0.6,
      spread: 1.1
    });
  }

  /** Landing dust puff. */
  spawnDust(position) {
    this.spawn({
      position: new THREE.Vector3(position.x, position.y, position.z ?? 0),
      count: 8,
      colors: [0xc4b8a0, 0xa89880, 0xd8cfc0],
      lifetime: 0.4,
      speed: 2.5,
      gravity: 4,
      size: 0.08,
      sizeVariance: 0.1,
      shape: 'plane',
      upwardBias: 0.15,
      spread: 1.4,
      expand: 3
    });
  }

  /** Victory / KO confetti burst. */
  spawnConfetti(position, teamColor = 0xffcc00) {
    const c = new THREE.Color(teamColor);
    const light = c.clone().lerp(new THREE.Color(0xffffff), 0.4).getHex();
    const dark = c.clone().multiplyScalar(0.7).getHex();
    this.spawn({
      position,
      count: 36,
      colors: [teamColor, light, dark, 0xffcc00, 0xffffff, 0xff6688],
      lifetime: 1.4,
      speed: 10,
      gravity: 14,
      size: 0.06,
      sizeVariance: 0.08,
      shape: 'box',
      upwardBias: 0.9,
      spread: 1.3,
      drag: 0.99,
      emissiveBoost: true
    });
  }

  /** Wasabi / special glow flecks. */
  spawnGlowSparks(position, color = 0x6dff4a, count = 12) {
    this.spawn({
      position,
      count,
      color,
      colors: [color, 0xffffff],
      lifetime: 0.35,
      speed: 8,
      gravity: 6,
      size: 0.05,
      sizeVariance: 0.04,
      upwardBias: 0.3,
      spread: 1,
      emissiveBoost: true
    });
  }

  update(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += deltaTime;
      const t = Math.min(1, p.age / p.lifetime);

      p.velocity.y -= p.gravity * deltaTime;
      p.velocity.multiplyScalar(p.drag);
      p.mesh.position.addScaledVector(p.velocity, deltaTime);

      if (p.expand) {
        const s = p.baseScale * (1 + p.expand * t);
        p.mesh.scale.setScalar(s);
      }

      if (p.fade) {
        p.mat.opacity = Math.max(0, 0.95 * (1 - t));
      }

      // Spin crumbs
      if (p.mesh.geometry?.type === 'BoxGeometry') {
        p.mesh.rotation.x += deltaTime * 8;
        p.mesh.rotation.z += deltaTime * 6;
      }

      if (p.age >= p.lifetime) {
        this.scene.remove(p.mesh);
        p.mat.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    this.particles.length = 0;
  }

  dispose() {
    this.clear();
    this._sphereGeo.dispose();
    this._boxGeo.dispose();
    this._planeGeo.dispose();
  }
}
