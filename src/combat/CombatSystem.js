import * as THREE from 'three';
import { BLAST_ZONES, FIGHTER_STATE, SPECIALS, areTeammates } from '../utils/constants.js';
import { audio } from '../audio/AudioManager.js';

/** Full-chroma team color for floating damage text (no white wash). */
function vividDamageCss(hex) {
  const c = new THREE.Color(hex >>> 0);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Keep hue, force high saturation, mid luminance so it never reads as white
  c.setHSL(hsl.h, 1, Math.min(0.55, Math.max(0.4, hsl.l)));
  return `#${c.getHexString()}`;
}

/** World-space damage % pop (CSS2D-free canvas sprite). */
function createDamageNumberSprite(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  const css = vividDamageCss(colorHex);
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Dark outline for contrast
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(text, 128, 64);
  // Solid team-color fill (no white overlay)
  ctx.shadowColor = css;
  ctx.shadowBlur = 22;
  ctx.fillStyle = css;
  ctx.fillText(text, 128, 64);
  ctx.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.0, 1.0, 1);
  sprite.renderOrder = 20;
  sprite.userData._tex = tex;
  return sprite;
}

function boxesOverlap(a, b) {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY &&
    a.minZ <= b.maxZ && a.maxZ >= b.minZ
  );
}

export class CombatSystem {
  constructor(scene, game, characters) {
    this.scene = scene;
    this.game = game;
    this.characters = characters;

    this.hitEffects = [];
    this.particleGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    this.projectiles = [];
    this.shockwaves = [];
    this.puddles = [];
    this.flames = [];
    this._flameSpawnAcc = 0;
  }

  checkHitboxCollision(attacker, defender) {
    if (!attacker.isHitboxActive()) return null;
    if (defender.isInvincible) return null;
    if (attacker.hasHit(defender)) return null;

    const hitbox = attacker.getActiveHitboxWorld();
    const hurtbox = defender.getHurtboxWorld();
    if (!hitbox || !hurtbox) return null;

    if (!boxesOverlap(hitbox, hurtbox)) return null;

    return this.calculateHit(attacker, defender, hitbox);
  }

  calculateHit(attacker, defender, hitbox) {
    const move = attacker.currentMove;
    const facing = attacker.facing >= 0 ? 1 : -1;

    const angle = move.angle;
    const dir = new THREE.Vector3(facing, angle, 0).normalize();
    const knockback = dir.multiplyScalar(move.baseKnockback);

    return {
      damage: move.damage,
      knockback,
      hitstun: move.hitstun,
      hitlag: move.hitlag,
      hitPosition: new THREE.Vector3(hitbox.centerX, hitbox.centerY, 0),
      bypassShield: move.bypassShield ?? false
    };
  }

  /** Su Timer: only resets when attacker deals real % damage (not shield block). */
  _noteDamageDealt(attacker, result) {
    if (!attacker || !result || result.ignored || result.blocked) return;
    attacker.noteOffense?.();
  }

  applyHit(attacker, defender, hit) {
    if (attacker.hasHit(defender)) return;
    attacker.markHit(defender);

    // Counter reflection: defender in counter window absorbs and reflects a stronger hit.
    if (defender.isCountering && defender.counterTimer > 0) {
      const cdef = SPECIALS.COUNTER;
      const reflectDamage = hit.damage * cdef.reflectDamageMult;
      const reflectKb = hit.knockback.clone().multiplyScalar(-cdef.reflectKnockbackMult);
      const reflectStun = hit.hitstun * cdef.reflectStunMult;
      const reflectHitPosition = hit.hitPosition.clone();

      defender.endCounter();
      // Consume the incoming attack so it doesn't re-trigger on the same frame.
      attacker.markHit(defender);

      const reflectResult = attacker.takeHit(
        reflectDamage,
        reflectKb,
        reflectStun,
        hit.hitlag,
        reflectHitPosition,
        false,
        this._charColor(defender),
        defender
      );
      defender.applyHitlag(hit.hitlag);
      if (reflectResult.ignored) return;
      // Counterist dealt the reflect damage
      this._noteDamageDealt(defender, reflectResult);

      defender.flashCounterSuccess?.();
      this.spawnCounterSuccessEffect(reflectHitPosition, defender);
      audio.playCounter();
      audio.playHit({ heavy: true });
      if (this.game?.addCameraShake) {
        const kb = reflectKb.length();
        this.game.addCameraShake(Math.min(0.35 + kb * 0.05, 1.4));
      }
      return;
    }

    const result = defender.takeHit(
      hit.damage,
      hit.knockback,
      hit.hitstun,
      hit.hitlag,
      hit.hitPosition,
      hit.bypassShield,
      this._charColor(attacker),
      attacker
    );
    if (result.ignored) return;
    this._noteDamageDealt(attacker, result);

    attacker.applyHitlag(hit.hitlag);
    const effectColor = result.blocked
      ? this._charColor(defender)
      : this._charColor(attacker);
    const heavy = (hit.damage ?? 0) >= 12;
    this.spawnImpactVFX(hit.hitPosition, effectColor, {
      heavy,
      blocked: !!result.blocked,
      damage: hit.damage ?? 0,
      facing: attacker.facing >= 0 ? 1 : -1,
      angle: hit.knockback
    });

    audio.playHit({
      heavy,
      blocked: !!result.blocked,
      shieldBreak: !!result.shieldBreak
    });

    // Camera shake scales with effective knockback
    if (this.game?.addCameraShake) {
      const kb = hit.knockback?.length?.() ?? 0;
      const scale = result.knockbackScale ?? (result.blocked ? 0.25 : 1);
      let intensity = kb * scale * 0.045;
      if (result.blocked) intensity = Math.max(intensity, 0.08);
      if (result.shieldBreak) intensity = Math.max(intensity, 0.55);
      if (!result.blocked) intensity = Math.max(intensity, 0.12);
      this.game.addCameraShake(Math.min(intensity, 1.2));
    }

    if (!result.blocked && this.game?.postFX) {
      this.game.postFX.punchBloom(heavy ? 0.55 : 0.25);
    }
  }

  _charColor(char, fallback = 0xff2222) {
    return char?.teamColor ?? fallback;
  }

  /** Lighter/darker variants of a hex color for particle variety. */
  _colorVariants(hex) {
    const c = new THREE.Color(hex);
    const light = c.clone().lerp(new THREE.Color(0xffffff), 0.35);
    const dark = c.clone().multiplyScalar(0.65);
    return [c.getHex(), light.getHex(), dark.getHex()];
  }

  spawnHitEffect(position, color = 0xff2222) {
    this.spawnImpactVFX(position, color, { heavy: false, damage: 5 });
  }

  /**
   * Full hit juice: flash, ring, slash arc, stars, crumbs, damage number.
   */
  spawnImpactVFX(position, color = 0xff2222, opts = {}) {
    const {
      heavy = false,
      blocked = false,
      damage = 0,
      facing = 1
    } = opts;
    const origin = position.clone();
    const [base, light, dark] = this._colorVariants(color);
    const variants = blocked ? [0xaaccff, 0xffffff, light] : [base, light, dark, 0xffffff];

    // Slash arc (thin torus segment facing impact)
    if (!blocked) {
      const arcMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(heavy ? 0.55 : 0.38, 0.04, 6, 16, Math.PI * 0.85),
        arcMat
      );
      arc.position.copy(origin);
      arc.rotation.y = facing >= 0 ? 0 : Math.PI;
      arc.rotation.z = (Math.random() - 0.5) * 0.6;
      this.scene.add(arc);
      this.hitEffects.push({
        mesh: arc,
        lifetime: 0.18,
        velocity: new THREE.Vector3(facing * 2, 1, 0),
        expand: 4,
        fade: true
      });
    }

    // Star bursts
    const starCount = heavy ? 6 : 3;
    for (let i = 0; i < starCount; i++) {
      const starMat = new THREE.MeshBasicMaterial({
        color: variants[i % variants.length],
        transparent: true,
        opacity: 1,
        depthWrite: false
      });
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 + Math.random() * 0.08, 0), starMat);
      star.position.copy(origin);
      this.scene.add(star);
      const ang = (i / starCount) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (heavy ? 10 : 7) + Math.random() * 6;
      this.hitEffects.push({
        mesh: star,
        lifetime: 0.3 + Math.random() * 0.15,
        velocity: new THREE.Vector3(
          Math.cos(ang) * speed,
          Math.sin(ang) * speed * 0.75 + 3,
          (Math.random() - 0.5) * 4
        ),
        fade: true,
        spin: true
      });
    }

    // Spark flecks
    const sparkN = heavy ? 16 : 10;
    for (let i = 0; i < sparkN; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: variants[i % variants.length],
        transparent: true,
        opacity: 1,
        depthWrite: false
      });
      const size = 0.06 + Math.random() * (heavy ? 0.14 : 0.1);
      const spark = new THREE.Mesh(new THREE.SphereGeometry(size, 5, 4), mat);
      spark.position.copy(origin);
      this.scene.add(spark);
      const ang = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * (heavy ? 14 : 10);
      this.hitEffects.push({
        mesh: spark,
        lifetime: 0.25 + Math.random() * 0.2,
        velocity: new THREE.Vector3(
          Math.cos(ang) * speed * (0.6 + Math.random()),
          Math.sin(ang) * speed * 0.7 + 2,
          (Math.random() - 0.5) * 6
        )
      });
    }

    // Food crumbs via particle system
    if (!blocked && this.game?.particles) {
      this.game.particles.spawnCrumbs(origin, color);
      if (heavy) this.game.particles.spawnGlowSparks(origin, light, 8);
    }

    // Floating damage number (attacker team color)
    if (damage > 0 && !blocked) {
      const label = `${Math.round(damage)}%`;
      const sprite = createDamageNumberSprite(label, color);
      sprite.position.copy(origin).add(new THREE.Vector3(0, 0.4, 0.2));
      this.scene.add(sprite);
      this.hitEffects.push({
        mesh: sprite,
        lifetime: 0.7,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, 3.5, 0),
        fade: true,
        isSprite: true,
        noGravity: true
      });
    }
  }

  /** Flash + ring + spark burst when California's counter lands. */
  spawnCounterSuccessEffect(position, defender) {
    const color = this._charColor(defender);
    const [base, light, dark] = this._colorVariants(color);
    const origin = position.clone();
    if (defender?.position) {
      origin.x = defender.position.x;
      origin.y = defender.position.y + 0.35;
    }

    // Expanding ring
    const ringGeo = new THREE.RingGeometry(0.15, 0.35, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: light,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(origin);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    this.hitEffects.push({
      mesh: ring,
      lifetime: 0.45,
      velocity: new THREE.Vector3(0, 0, 0),
      expand: 18,
      fade: true
    });

    // Outer glow sphere flash
    const flashMat = new THREE.MeshBasicMaterial({
      color: base,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), flashMat);
    flash.position.copy(origin);
    this.scene.add(flash);
    this.hitEffects.push({
      mesh: flash,
      lifetime: 0.28,
      velocity: new THREE.Vector3(0, 0.4, 0),
      expand: 6,
      fade: true
    });

    // Spark burst
    const variants = [base, light, dark];
    for (let i = 0; i < 14; i++) {
      const size = 0.08 + Math.random() * 0.12;
      const mat = new THREE.MeshBasicMaterial({
        color: variants[i % variants.length],
        transparent: true,
        opacity: 1,
        depthWrite: false
      });
      const spark = new THREE.Mesh(new THREE.SphereGeometry(size, 5, 4), mat);
      spark.position.copy(origin);
      this.scene.add(spark);
      const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 8 + Math.random() * 10;
      this.hitEffects.push({
        mesh: spark,
        lifetime: 0.28 + Math.random() * 0.2,
        velocity: new THREE.Vector3(
          Math.cos(ang) * speed,
          Math.sin(ang) * speed * 0.7 + 4,
          (Math.random() - 0.5) * 6
        )
      });
    }

    this.spawnHitEffect(origin.clone(), light);
    this.spawnHitEffect(origin.clone().add(new THREE.Vector3(0.2, 0.15, 0)), base);
  }

  spawnProjectile(opts) {
    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({
      color: opts.coreColor,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: opts.glowColor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(opts.visualRadius, 10, 8),
      coreMat
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(opts.visualRadius * 1.7, 12, 10),
      glowMat
    );
    group.add(core);
    group.add(halo);
    // Outer bloom-friendly shell
    const bloomMat = new THREE.MeshBasicMaterial({
      color: opts.glowColor ?? opts.coreColor,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const bloomShell = new THREE.Mesh(
      new THREE.SphereGeometry(opts.visualRadius * 2.4, 10, 8),
      bloomMat
    );
    group.add(bloomShell);
    group.position.copy(opts.position);
    this.scene.add(group);

    this.projectiles.push({
      mesh: group,
      position: opts.position.clone(),
      velocity: opts.velocity.clone(),
      collisionRadius: opts.collisionRadius,
      coreColor: opts.coreColor,
      glowColor: opts.glowColor,
      lifetime: opts.lifetime,
      age: 0,
      owner: opts.owner,
      damage: opts.damage,
      baseKnockback: opts.baseKnockback,
      angle: opts.angle,
      hitstun: opts.hitstun,
      hitlag: opts.hitlag,
      bypassShield: opts.bypassShield ?? false,
      hitTargets: opts.hitTargets ?? new Set(),
      leavesPuddle: opts.leavesPuddle ?? false,
      arcing: opts.arcing ?? false,
      gravity: opts.gravity ?? 0,
      groundY: opts.groundY ?? 0.5,
      puddleRadius: opts.puddleRadius,
      puddleLifetime: opts.puddleLifetime,
      puddleDamage: opts.puddleDamage,
      puddleTick: opts.puddleTick,
      puddleKnockback: opts.puddleKnockback
    });
  }

  destroyProjectile(projectile) {
    this.scene.remove(projectile.mesh);
    projectile.mesh.children.forEach((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
  }

  applyGroundPoundAoe(attacker) {
    const def = SPECIALS.GROUND_POUND;
    const radiusSq = def.aoeRadius * def.aoeRadius;

    const atkColor = this._charColor(attacker);
    this.spawnShockwave(attacker.position.clone(), def.aoeRadius, atkColor);
    this.game?.addCameraShake?.(Math.min(def.baseKnockback * 0.08, 0.7));

    for (const target of this.characters) {
      if (target === attacker || target.isDead) continue;
      if (areTeammates(attacker, target)) continue;
      if (attacker.hitTargets.has(target)) continue;

      const dx = target.position.x - attacker.position.x;
      const dy = target.position.y - attacker.position.y;
      if (dx * dx + dy * dy > radiusSq) continue;

      attacker.hitTargets.add(target);

      // Knockback direction: outward horizontal + upward.
      const facing = dx >= 0 ? 1 : -1;
      const angle = def.angle;
      const kbDir = new THREE.Vector3(facing, angle, 0).normalize();
      const knockback = kbDir.multiplyScalar(def.baseKnockback);

      const hitPosition = new THREE.Vector3(attacker.position.x, attacker.position.y, 0);

      const result = target.takeHit(
        def.damage,
        knockback,
        def.hitstun,
        def.hitlag,
        hitPosition,
        def.bypassShield,
        atkColor,
        attacker
      );
      if (result.ignored) continue;
      this._noteDamageDealt(attacker, result);

      attacker.applyHitlag(def.hitlag);
      this.spawnHitEffect(hitPosition, atkColor);
      audio.playHit({ heavy: true, blocked: !!result.blocked, shieldBreak: !!result.shieldBreak });
    }
  }

  spawnShockwave(position, radius, color) {
    const ringGeo = new THREE.RingGeometry(radius * 0.6, radius * 0.85, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    // Sit clearly above stone tiles / platform surface (was y=0.1 under ground)
    const surfaceY = this._groundSurfaceYAt(position.x, position.y + 1) ?? 0.64;
    ring.position.set(position.x, surfaceY + 0.12, position.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    this.shockwaves.push({
      mesh: ring,
      mat: ringMat,
      age: 0,
      lifetime: 0.6,
      radius
    });
  }

  update(deltaTime) {
    for (let i = this.hitEffects.length - 1; i >= 0; i--) {
      const effect = this.hitEffects[i];
      effect.lifetime -= deltaTime;

      if (effect.velocity) {
        effect.mesh.position.add(effect.velocity.clone().multiplyScalar(deltaTime));
        if (!effect.expand && !effect.noGravity) {
          effect.velocity.y -= 30 * deltaTime;
        }
      }

      if (effect.spin && effect.mesh.rotation) {
        effect.mesh.rotation.x += deltaTime * 12;
        effect.mesh.rotation.z += deltaTime * 9;
      }

      if (effect.expand) {
        const grow = 1 + effect.expand * deltaTime;
        effect.mesh.scale.multiplyScalar(grow);
      } else if (!effect.isSprite) {
        effect.mesh.scale.multiplyScalar(0.94);
      } else {
        // Damage numbers drift up and shrink slightly
        effect.mesh.scale.multiplyScalar(1 + deltaTime * 0.35);
      }

      if (effect.fade && effect.mesh.material) {
        const mats = Array.isArray(effect.mesh.material)
          ? effect.mesh.material
          : [effect.mesh.material];
        for (const m of mats) {
          if (m.opacity != null) {
            m.opacity = Math.max(0, m.opacity - deltaTime * (effect.isSprite ? 1.4 : 2.4));
          }
        }
      }

      if (effect.lifetime <= 0) {
        this.scene.remove(effect.mesh);
        if (effect.isSprite) {
          effect.mesh.material?.map?.dispose?.();
          effect.mesh.material?.dispose?.();
        } else {
          effect.mesh.geometry?.dispose?.();
          const mat = effect.mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
          else mat?.dispose?.();
        }
        this.hitEffects.splice(i, 1);
      }
    }

    this._updateFlames(deltaTime);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += deltaTime;

      if (p.arcing && p.gravity) {
        p.velocity.y -= p.gravity * deltaTime;
      }
      p.position.addScaledVector(p.velocity, deltaTime);
      p.mesh.position.copy(p.position);
      if (p.arcing) {
        p.mesh.rotation.z = Math.atan2(p.velocity.y, p.velocity.x);
      }

      const halo = p.mesh.children[1];
      if (halo) {
        const pulse = 1 + Math.sin(p.age * 14) * 0.06;
        halo.scale.set(pulse, pulse, pulse);
      }

      let consumed = false;
      let hitGround = false;

      // Arc projectiles land on solid ground/platform tops under the blob
      if (p.arcing) {
        const surfaceY = this._groundSurfaceYAt(p.position.x, p.position.y);
        if (surfaceY != null && p.position.y <= surfaceY + 0.05) {
          p.position.y = surfaceY;
          hitGround = true;
          consumed = true;
        }
      }

      if (!consumed) {
        for (const target of this.characters) {
          if (target === p.owner || target.isDead) continue;
          if (areTeammates(p.owner, target)) continue;
          if (p.hitTargets.has(target)) continue;
          if (target.isInvincible) continue;

          // Counter nullifies the projectile without damage.
          if (target.isCountering && target.counterTimer > 0) {
            target.endCounter();
            target.flashCounterSuccess?.();
            p.hitTargets.add(target);
            this.spawnCounterSuccessEffect(p.position.clone(), target);
            audio.playCounter();
            this.game?.addCameraShake?.(0.28);
            consumed = true;
            break;
          }

          const hurt = target.getHurtboxWorld();
          const cx = THREE.MathUtils.clamp(p.position.x, hurt.minX, hurt.maxX);
          const cy = THREE.MathUtils.clamp(p.position.y, hurt.minY, hurt.maxY);
          const dx = p.position.x - cx;
          const dy = p.position.y - cy;
          if (dx * dx + dy * dy <= p.collisionRadius * p.collisionRadius) {
            p.hitTargets.add(target);
            this._applyProjectileHit(p, target);
            consumed = true;
            break;
          }
        }
      }

      if (consumed || p.age >= p.lifetime) {
        // Puddle only when the blob hits solid ground (stone floor / platform top)
        if (p.leavesPuddle && hitGround) {
          this.spawnWasabiPuddle(p.position.clone(), p);
        }
        this.destroyProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }

    this._updatePuddles(deltaTime);

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      w.age += deltaTime;
      const t = Math.min(1, w.age / w.lifetime);
      const scale = 0.5 + 1.6 * t;
      w.mesh.scale.set(scale, scale, scale);
      w.mat.opacity = Math.max(0, 0.85 * (1 - t));
      if (w.age >= w.lifetime) {
        this.scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mat.dispose();
        this.shockwaves.splice(i, 1);
      }
    }
  }

  /**
   * Highest solid surface top under (x, y) from stage platforms.
   * Stone ground has raised tiles above the collider slab (~+0.12 visual).
   */
  _groundSurfaceYAt(x, y) {
    const platforms = this.game?.stage?.platforms;
    let best = null;
    if (platforms?.length) {
      for (const p of platforms) {
        const w = p.bounds?.width ?? 0;
        const h = p.bounds?.height ?? 0;
        const meshY = p.mesh?.position?.y ?? 0;
        const meshX = p.mesh?.position?.x ?? 0;
        const halfW = w / 2;
        if (x < meshX - halfW - 0.15 || x > meshX + halfW + 0.15) continue;
        // Collider top
        let top = meshY + h / 2;
        // Solid stone ground: mortar + tile layer sits above the slab
        if (!p.oneWay && h >= 0.8) {
          top += 0.14;
        } else {
          // Thin wood platforms: slight lift above planks
          top += 0.05;
        }
        // Only surfaces at or below the projectile (falling onto them)
        if (top > y + 0.35) continue;
        if (best == null || top > best) best = top;
      }
    }
    // Fallback: main stone ground visual top (slab 0.5 + tiles ~0.14)
    if (best == null) best = 0.64;
    return best;
  }

  spawnWasabiPuddle(position, source) {
    const radius = source.puddleRadius ?? 1.1;
    // Sit clearly on top of stone tiles / platform surface
    const surfaceY = this._groundSurfaceYAt(position.x, position.y + 1) ?? 0.64;
    const y = surfaceY + 0.06;
    const puddleColor = this._charColor(source.owner, source.coreColor ?? 0x6dff4a);

    const mat = new THREE.MeshBasicMaterial({
      color: puddleColor,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, y, 0);
    mesh.renderOrder = 10;
    this.scene.add(mesh);

    // Soft glow ring for wasabi puddle readability
    const glowMat = new THREE.MeshBasicMaterial({
      color: puddleColor,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(new THREE.RingGeometry(radius * 0.7, radius * 1.15, 28), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(position.x, y + 0.02, 0);
    glow.renderOrder = 11;
    this.scene.add(glow);

    this.game?.particles?.spawnGlowSparks?.(
      new THREE.Vector3(position.x, y + 0.2, 0),
      puddleColor,
      10
    );

    this.puddles.push({
      mesh,
      mat,
      glow,
      glowMat,
      position: new THREE.Vector3(position.x, y, 0),
      radius,
      age: 0,
      lifetime: source.puddleLifetime ?? 2.2,
      damage: source.puddleDamage ?? 2,
      tick: source.puddleTick ?? 0.35,
      tickTimer: 0,
      knockback: source.puddleKnockback ?? 1.5,
      owner: source.owner,
      hitCooldown: new Map()
    });
  }

  _updatePuddles(deltaTime) {
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const puddle = this.puddles[i];
      puddle.age += deltaTime;
      puddle.tickTimer -= deltaTime;
      const lifeT = Math.min(1, puddle.age / puddle.lifetime);
      puddle.mat.opacity = Math.max(0, 0.7 * (1 - lifeT * 0.85));
      const pulse = 1 + Math.sin(puddle.age * 8) * 0.04;
      puddle.mesh.scale.set(pulse, pulse, 1);
      if (puddle.glow) {
        puddle.glow.scale.set(pulse * 1.05, pulse * 1.05, 1);
        puddle.glowMat.opacity = Math.max(0, 0.35 * (1 - lifeT) * (0.7 + 0.3 * Math.sin(puddle.age * 10)));
      }

      // Burn anyone standing in the puddle (direct % damage, no full launch hitstun)
      if (puddle.tickTimer <= 0) {
        puddle.tickTimer = puddle.tick;
        for (const target of this.characters) {
          if (!target || target === puddle.owner || target.isDead) continue;
          if (areTeammates(puddle.owner, target)) continue;
          // Allow burn during short hitstun; only skip full respawn i-frames / dodge
          if (target.isDodging) continue;
          if (target.invincibleTimer > 0) continue;

          const dx = target.position.x - puddle.position.x;
          if (Math.abs(dx) > puddle.radius) continue;

          // Body center near ground / standing on or slightly above puddle
          const bodyY = target.position.y;
          const halfH = target._halfHeight ?? 0.5;
          const feetY = bodyY - halfH;
          // Standing on main floor: body ~1.0, feet ~0.5, puddle ~0.7
          if (feetY > puddle.position.y + 1.2) continue;
          if (bodyY < puddle.position.y - 0.5) continue;

          const last = puddle.hitCooldown.get(target) ?? -999;
          if (puddle.age - last < puddle.tick * 0.8) continue;
          puddle.hitCooldown.set(target, puddle.age);

          // Direct burn: adds damage without full knockback/hitstun pipeline
          target.damage += puddle.damage;
          target.damageColor = this._charColor(puddle.owner, puddle.mat?.color?.getHex?.());
          puddle.owner?.noteOffense?.();
          // Tiny flinch nudge so it reads as a hit
          if (target.body && target.fighterState !== 'hitstun') {
            const v = target.body.linvel();
            const push = Math.sign(dx || 1) * (puddle.knockback ?? 1.2) * 0.35;
            target.body.setLinvel({ x: v.x * 0.7 + push, y: v.y, z: 0 }, true);
          }
          this.spawnHitEffect(
            new THREE.Vector3(target.position.x, Math.max(puddle.position.y + 0.25, bodyY - 0.1), 0),
            puddle.mat.color.getHex()
          );
          audio.playHit({ heavy: false });
        }
      }

      if (puddle.age >= puddle.lifetime) {
        this.scene.remove(puddle.mesh);
        puddle.mesh.geometry.dispose();
        puddle.mat.dispose();
        if (puddle.glow) {
          this.scene.remove(puddle.glow);
          puddle.glow.geometry?.dispose?.();
          puddle.glowMat?.dispose?.();
        }
        this.puddles.splice(i, 1);
      }
    }
  }

  /** Burst of spark flecks when Onigiri grab activates. */
  spawnGrabSpark(attacker) {
    if (!attacker) return;
    const facing = attacker.facing >= 0 ? 1 : -1;
    const base = attacker.position;
    const colors = this._colorVariants(this._charColor(attacker));

    for (let i = 0; i < 14; i++) {
      const color = colors[(Math.random() * colors.length) | 0];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false
      });
      const size = 0.06 + Math.random() * 0.1;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 5, 4), mat);
      mesh.position.set(
        base.x + facing * (0.25 + Math.random() * 0.35),
        base.y + (Math.random() - 0.35) * 0.55,
        (Math.random() - 0.5) * 0.2
      );
      this.scene.add(mesh);

      const speed = 6 + Math.random() * 10;
      const ang = (Math.random() - 0.5) * 1.8;
      this.hitEffects.push({
        mesh,
        lifetime: 0.22 + Math.random() * 0.18,
        velocity: new THREE.Vector3(
          facing * Math.cos(ang) * speed,
          Math.sin(ang) * speed * 0.85 + 3,
          (Math.random() - 0.5) * 4
        )
      });
    }

    this.spawnHitEffect(
      new THREE.Vector3(base.x + facing * 0.4, base.y + 0.1, 0),
      colors[1]
    );
    this.game?.addCameraShake?.(0.12);
  }

  /** Spawn trail particles behind a rolling Gyoza (team color). */
  spawnRollFlame(attacker) {
    if (!attacker) return;
    const dir = attacker.rollDir >= 0 ? 1 : -1;
    const base = attacker.position;
    const colors = this._colorVariants(this._charColor(attacker));
    const fadeTarget = new THREE.Color(colors[1]);

    for (let i = 0; i < 3; i++) {
      const color = colors[(Math.random() * colors.length) | 0];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      });
      const size = 0.12 + Math.random() * 0.18;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), mat);
      mesh.position.set(
        base.x - dir * (0.35 + Math.random() * 0.45),
        base.y - 0.15 + Math.random() * 0.45,
        (Math.random() - 0.5) * 0.25
      );
      mesh.scale.set(0.7, 1.3, 0.7);
      this.scene.add(mesh);

      this.flames.push({
        mesh,
        mat,
        age: 0,
        lifetime: 0.28 + Math.random() * 0.2,
        fadeTarget,
        velocity: new THREE.Vector3(
          -dir * (1.5 + Math.random() * 2.5),
          3 + Math.random() * 4,
          (Math.random() - 0.5) * 1.5
        )
      });
    }
  }

  _updateFlames(deltaTime) {
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.age += deltaTime;
      const t = Math.min(1, f.age / f.lifetime);
      f.mesh.position.addScaledVector(f.velocity, deltaTime);
      f.velocity.y += 6 * deltaTime;
      f.velocity.x *= 0.96;
      f.mesh.scale.x = 0.7 * (1 - t * 0.7);
      f.mesh.scale.y = 1.3 + t * 1.4;
      f.mesh.scale.z = 0.7 * (1 - t * 0.7);
      f.mat.opacity = Math.max(0, 0.9 * (1 - t));
      if (t > 0.4 && f.fadeTarget) {
        f.mat.color.lerp(f.fadeTarget, deltaTime * 4);
      }
      if (f.age >= f.lifetime) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mat.dispose();
        this.flames.splice(i, 1);
      }
    }
  }

  applyRollHit(attacker, def) {
    if (!attacker?.isRolling) return;
    const facing = attacker.rollDir >= 0 ? 1 : -1;
    const hb = def.hitbox;
    const cx = attacker.position.x + hb.offsetX * facing;
    const cy = attacker.position.y + hb.offsetY;
    const hitbox = {
      minX: cx - hb.width / 2,
      maxX: cx + hb.width / 2,
      minY: cy - hb.height / 2,
      maxY: cy + hb.height / 2,
      minZ: -hb.depth / 2,
      maxZ: hb.depth / 2,
      centerX: cx,
      centerY: cy
    };

    for (const target of this.characters) {
      if (target === attacker || target.isDead || target.isInvincible) continue;
      if (areTeammates(attacker, target)) continue;
      if (attacker.rollHitTargets.has(target)) continue;
      const hurt = target.getHurtboxWorld();
      if (!boxesOverlap(hitbox, hurt)) continue;

      attacker.rollHitTargets.add(target);
      const knockback = new THREE.Vector3(facing, def.angle, 0).normalize().multiplyScalar(def.baseKnockback);
      const result = target.takeHit(
        def.damage,
        knockback,
        def.hitstun,
        def.hitlag,
        new THREE.Vector3(cx, cy, 0),
        false,
        this._charColor(attacker),
        attacker
      );
      if (result.ignored) continue;
      this._noteDamageDealt(attacker, result);
      attacker.applyHitlag(def.hitlag);
      this.spawnHitEffect(new THREE.Vector3(cx, cy, 0), this._charColor(attacker));
      audio.playHit({ heavy: true, blocked: !!result.blocked, shieldBreak: !!result.shieldBreak });
      this.game?.addCameraShake?.(Math.min(def.baseKnockback * 0.06, 0.8));
    }
  }

  /** Onigiri command grab: forward box → pick up (hold) → throw behind. */
  applyGrabHit(attacker, def) {
    if (!attacker?.isGrabbing || attacker.grabPhase !== 'active') return;
    if (attacker.grabHeldTarget) return;

    const facing = attacker.facing >= 0 ? 1 : -1;
    const range = def.range ?? 1.5;
    const height = def.height ?? 1.15;
    const cx = attacker.position.x + (range * 0.45) * facing;
    const cy = attacker.position.y + (def.holdOffsetY ?? 0.35);
    const hitbox = {
      minX: Math.min(attacker.position.x, attacker.position.x + range * facing),
      maxX: Math.max(attacker.position.x, attacker.position.x + range * facing),
      minY: cy - height / 2,
      maxY: cy + height / 2,
      minZ: -0.6,
      maxZ: 0.6,
      centerX: cx,
      centerY: cy
    };

    for (const target of this.characters) {
      if (target === attacker || target.isDead || target.isInvincible) continue;
      if (areTeammates(attacker, target)) continue;
      if (attacker.grabHitTargets.has(target)) continue;
      const hurt = target.getHurtboxWorld();
      if (!boxesOverlap(hitbox, hurt)) continue;

      attacker.grabHitTargets.add(target);

      // Shield blocks the grab (no shield-break through)
      if (target.isShielding && !target.shieldBroken) {
        this.spawnHitEffect(new THREE.Vector3(hurt.centerX, hurt.centerY, 0), this._charColor(attacker));
        audio.playHit({ heavy: false, blocked: true, shieldBreak: false });
        target.shieldStunTimer = Math.max(target.shieldStunTimer ?? 0, 0.12);
        target.shieldHp = Math.max(0, (target.shieldHp ?? 0) - (def.damage ?? 13) * 0.35);
        if (target.shieldHp <= 0) target.breakShield?.();
        // Small pushback on both so the grab doesn't feel free
        if (attacker.body) {
          attacker.body.setLinvel({ x: -facing * 3.5, y: attacker.body.linvel().y * 0.4, z: 0 }, true);
        }
        if (target.body) {
          target.body.setLinvel({ x: facing * 2.5, y: target.body.linvel().y * 0.5, z: 0 }, true);
        }
        break;
      }

      attacker.grabHeldTarget = target;
      attacker.grabPhase = 'hold';
      attacker.grabTimer = def.hold ?? 0.12;

      // Freeze target in front for the hold beat
      target.cancelHeavyCharge?.();
      target.endAttack?.();
      target.isShielding = false;
      if (target.isDodging) target.endDodge?.();
      if (target.isRolling) target.endTakoyakiRoll?.();
      if (target.isCountering) target.endCounter?.();
      if (target.isGroundPounding) target.endGroundPound?.();
      if (target.isGrabbing) target.endOnigiriGrab?.();
      if (target.isLassoing) target.endNoodleLasso?.();
      target.fighterState = FIGHTER_STATE.HITSTUN;
      target.hitstunTimer = (def.hold ?? 0.12) + 0.05;
      target.hitlagTimer = 0;

      const holdX = attacker.position.x + (def.holdOffsetX ?? 0.55) * facing;
      const holdY = attacker.position.y + (def.holdOffsetY ?? 0.35);
      if (target.body) {
        target.body.setTranslation({ x: holdX, y: holdY, z: 0 }, true);
        target.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      target.position.set(holdX, holdY, 0);

      this.spawnHitEffect(new THREE.Vector3(holdX, holdY, 0), this._charColor(attacker));
      audio.playHit({ heavy: false, blocked: false, shieldBreak: false });
      break;
    }
  }

  /** Tamago stink-cloud armor — soft cloud-swirl puffs (not orbit rings). */
  ensureStinkCloudVisual(owner) {
    if (!owner || owner.stinkCloudMesh) {
      if (owner?.stinkCloudMesh) owner.stinkCloudMesh.visible = true;
      return;
    }
    const color = this._charColor(owner);
    const group = new THREE.Group();
    const hazeMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const haze = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), hazeMat);
    haze.scale.set(1.2, 0.9, 0.75);
    group.add(haze);

    const swirls = [];
    // Layered cloud blobs that drift and billow like smoke swirls
    for (let i = 0; i < 12; i++) {
      const puffMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28 + (i % 3) * 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const r = 0.22 + (i % 4) * 0.08;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), puffMat);
      puff.scale.set(1.1 + (i % 3) * 0.25, 0.75 + (i % 2) * 0.2, 0.9 + (i % 4) * 0.1);
      group.add(puff);
      const layer = i < 5 ? 0.35 : i < 9 ? 0.65 : 0.95;
      swirls.push({
        mesh: puff,
        mat: puffMat,
        speed: 0.55 + (i % 5) * 0.18,
        bob: 0.7 + (i % 4) * 0.22,
        phase: (i / 12) * Math.PI * 2 + i * 0.4,
        baseR: layer,
        rise: 0.15 + (i % 3) * 0.12,
        drift: 0.7 + (i % 3) * 0.15,
        size: 0.85 + (i % 4) * 0.2
      });
    }

    group.visible = true;
    this.scene.add(group);
    owner.stinkCloudMesh = group;
    owner.stinkSwirls = swirls;
    owner._stinkHaze = haze;
    owner._stinkHazeMat = hazeMat;
    owner._stinkAge = 0;
  }

  hideStinkCloudVisual(owner) {
    if (!owner?.stinkCloudMesh) return;
    owner.stinkCloudMesh.visible = false;
  }

  updateStinkCloudVisual(owner, deltaTime) {
    if (!owner?.stinkCloudMesh || !owner.isStinkCloud) return;
    const def = SPECIALS.STINK_CLOUD;
    const color = this._charColor(owner);
    owner._stinkAge = (owner._stinkAge ?? 0) + deltaTime;
    const t = owner._stinkAge;
    const life = Math.max(0, owner.stinkCloudTimer ?? 0);
    const fade = Math.min(1, life / 0.45);
    const radius = def.radius ?? 1.85;

    owner.stinkCloudMesh.visible = true;
    owner.stinkCloudMesh.position.set(
      owner.position.x,
      owner.position.y + 0.15,
      0
    );

    if (owner._stinkHaze) {
      const pulse = 1 + Math.sin(t * 2.4) * 0.08;
      owner._stinkHaze.scale.set(
        radius * 0.78 * pulse,
        radius * 0.58 * pulse,
        radius * 0.48 * pulse
      );
      if (owner._stinkHazeMat) {
        owner._stinkHazeMat.color.setHex(color);
        owner._stinkHazeMat.opacity = 0.14 * fade * (0.8 + 0.2 * Math.sin(t * 2.8));
      }
    }

    for (const s of owner.stinkSwirls || []) {
      s.phase += s.speed * deltaTime;
      // Slow curling drift — cloud swirls, not circular orbits
      const curl = s.phase * 0.65;
      const wobble = Math.sin(t * s.bob + s.phase) * 0.22;
      const r = s.baseR * radius * (0.75 + 0.2 * Math.sin(t * s.drift + s.phase * 0.5));
      const ang = curl + wobble;
      const yOff =
        Math.sin(t * s.bob * 0.85 + s.phase) * s.rise +
        Math.cos(t * 1.1 + s.phase) * 0.08;
      s.mesh.position.set(
        Math.cos(ang) * r * 0.7 + Math.sin(t * 0.9 + s.phase) * 0.12,
        yOff,
        Math.sin(ang * 0.7) * r * 0.35 + Math.cos(t * 0.7 + s.phase) * 0.08
      );
      const breathe = s.size * (0.85 + 0.25 * Math.sin(t * 1.6 + s.phase));
      s.mesh.scale.set(
        breathe * 1.15,
        breathe * 0.8,
        breathe
      );
      s.mesh.rotation.y = t * 0.4 + s.phase;
      s.mesh.rotation.z = Math.sin(t * 0.6 + s.phase) * 0.35;
      if (s.mat) {
        s.mat.color.setHex(color);
        s.mat.opacity =
          (0.22 + s.baseR * 0.2) * fade * (0.65 + 0.35 * Math.sin(t * 2.2 + s.phase));
      }
    }
  }

  applyStinkCloudTick(owner, def) {
    if (!owner?.isStinkCloud || owner.isDead) return;
    const radius = def.radius ?? 1.85;
    const rSq = radius * radius;
    const ox = owner.position.x;
    const oy = owner.position.y;
    const dmg = def.damage ?? 2;
    const kb = def.baseKnockback ?? 0.35;

    for (const target of this.characters) {
      if (!target || target === owner || target.isDead) continue;
      if (areTeammates(owner, target)) continue;
      if (target.isDodging) continue;
      if (target.invincibleTimer > 0) continue;
      // Pass through shields entirely — no chip, no stun
      if (target.isShielding && !target.shieldBroken) continue;

      const dx = target.position.x - ox;
      const dy = target.position.y - oy;
      if (dx * dx + dy * dy > rSq) continue;

      // Light burn: % only, tiny nudge — no full hitstun pipeline
      target.damage += dmg;
      target.damageColor = this._charColor(owner);
      owner.noteOffense?.();
      if (target.body) {
        const v = target.body.linvel();
        const push = Math.sign(dx || 1) * kb * 0.4;
        target.body.setLinvel({ x: v.x * 0.92 + push, y: v.y + kb * 0.15, z: 0 }, true);
      }
      this.spawnHitEffect(
        new THREE.Vector3(target.position.x, target.position.y + 0.2, 0),
        this._charColor(owner)
      );
    }
  }

  /** Ramen noodle rope visual (cylinder + tip). */
  ensureLassoVisual(attacker) {
    if (!attacker || attacker.lassoMesh) return;
    const group = new THREE.Group();
    const noodleMat = new THREE.MeshBasicMaterial({
      color: 0xf5d78a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffe8a8,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 1, 8),
      noodleMat
    );
    rope.rotation.z = Math.PI / 2;
    rope.position.y = 0;
    group.add(rope);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.1, 1, 8),
      glowMat
    );
    glow.rotation.z = Math.PI / 2;
    group.add(glow);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c0,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    group.add(tip);
    group.visible = false;
    this.scene.add(group);
    attacker.lassoMesh = group;
    attacker._lassoRope = rope;
    attacker._lassoGlow = glow;
    attacker._lassoTip = tip;
  }

  hideLassoVisual(attacker) {
    if (attacker?.lassoMesh) attacker.lassoMesh.visible = false;
  }

  updateLassoVisual(attacker, def) {
    if (!attacker?.lassoMesh) return;
    const facing = attacker.facing >= 0 ? 1 : -1;
    const y = attacker.position.y + (def.ropeY ?? 0.35);
    const ox = attacker.position.x;
    let length = 0.2;
    let tipX = ox + facing * 0.35;

    if (attacker.lassoPhase === 'startup') {
      length = 0.35;
      tipX = ox + facing * length;
      attacker.lassoMesh.visible = true;
    } else if (attacker.lassoPhase === 'extend') {
      const t = attacker.lassoExtendT ?? 0;
      length = Math.max(0.4, (def.range ?? 5.2) * t);
      tipX = ox + facing * length;
      attacker.lassoMesh.visible = true;
    } else if (attacker.lassoPhase === 'pull' && attacker.lassoHeldTarget) {
      const tx = attacker.lassoHeldTarget.position.x;
      const ty = attacker.lassoHeldTarget.position.y;
      length = Math.max(0.35, Math.abs(tx - ox));
      tipX = tx;
      const midY = (y + ty) * 0.5;
      attacker.lassoMesh.visible = true;
      attacker.lassoMesh.position.set((ox + tipX) * 0.5, midY, 0);
      const rope = attacker._lassoRope;
      const glow = attacker._lassoGlow;
      if (rope) {
        rope.scale.set(1, length, 1);
        rope.rotation.z = Math.PI / 2;
      }
      if (glow) {
        glow.scale.set(1, length, 1);
        glow.rotation.z = Math.PI / 2;
      }
      if (attacker._lassoTip) {
        attacker._lassoTip.position.set(tipX - (ox + tipX) * 0.5, ty - midY, 0);
      }
      return;
    } else {
      attacker.lassoMesh.visible = false;
      return;
    }

    const midX = ox + facing * (length * 0.5);
    attacker.lassoMesh.position.set(midX, y, 0);
    const rope = attacker._lassoRope;
    const glow = attacker._lassoGlow;
    if (rope) {
      rope.scale.set(1, length, 1);
      rope.rotation.z = Math.PI / 2;
    }
    if (glow) {
      glow.scale.set(1, length, 1);
      glow.rotation.z = Math.PI / 2;
    }
    if (attacker._lassoTip) {
      attacker._lassoTip.position.set(facing * (length * 0.5), 0, 0);
    }
  }

  /** Active rope tip / beam hit — ignores shields, starts pull. */
  applyLassoHit(attacker, def) {
    if (!attacker?.isLassoing || attacker.lassoPhase !== 'extend') return;
    if (attacker.lassoHeldTarget) return;

    const facing = attacker.facing >= 0 ? 1 : -1;
    const range = (def.range ?? 5.2) * Math.max(0.25, attacker.lassoExtendT ?? 0);
    const height = def.height ?? 1.25;
    const tipR = def.tipRadius ?? 0.42;
    const ropeY = def.ropeY ?? 0.35;
    const baseX = attacker.position.x;
    const tipX = baseX + facing * range;
    const cy = attacker.position.y + ropeY;

    const hitbox = {
      minX: Math.min(baseX + facing * 0.4, tipX) - tipR * 0.35,
      maxX: Math.max(baseX + facing * 0.4, tipX) + tipR * 0.35,
      minY: cy - height / 2,
      maxY: cy + height / 2,
      minZ: -0.7,
      maxZ: 0.7,
      centerX: tipX,
      centerY: cy
    };

    for (const target of this.characters) {
      if (target === attacker || target.isDead || target.isInvincible) continue;
      if (areTeammates(attacker, target)) continue;
      if (attacker.lassoHitTargets.has(target)) continue;
      const hurt = target.getHurtboxWorld();
      if (!boxesOverlap(hitbox, hurt)) continue;

      attacker.lassoHitTargets.add(target);
      attacker.lassoHeldTarget = target;
      attacker.lassoPhase = 'pull';
      attacker.lassoTimer = def.pull ?? 0.28;

      target.cancelHeavyCharge?.();
      target.endAttack?.();
      target.isShielding = false;
      if (target.isDodging) target.endDodge?.();
      if (target.isRolling) target.endTakoyakiRoll?.();
      if (target.isCountering) target.endCounter?.();
      if (target.isGroundPounding) target.endGroundPound?.();
      if (target.isGrabbing) target.endOnigiriGrab?.();
      if (target.isLassoing) target.endNoodleLasso?.();
      target.fighterState = FIGHTER_STATE.HITSTUN;
      target.hitstunTimer = (def.pull ?? 0.28) + 0.08;
      target.hitlagTimer = 0;
      if (target.body) target.body.setLinvel({ x: 0, y: 0, z: 0 }, true);

      this.spawnHitEffect(new THREE.Vector3(hurt.centerX, hurt.centerY, 0), this._charColor(attacker));
      audio.playHit({ heavy: false, blocked: false, shieldBreak: false });
      attacker.applyHitlag?.(def.hitlag ?? 0.05);
      break;
    }
  }

  updateLassoPull(attacker, def, deltaTime) {
    const target = attacker?.lassoHeldTarget;
    if (!target?.body || target.isDead) {
      if (attacker) {
        attacker.lassoHeldTarget = null;
        attacker.lassoPhase = 'endlag';
        attacker.lassoTimer = def.endlag ?? 0.3;
      }
      return;
    }

    const facing = attacker.facing >= 0 ? 1 : -1;
    const goalX = attacker.position.x + (def.pullOffsetX ?? 0.85) * facing;
    const goalY = attacker.position.y + (def.pullOffsetY ?? 0.2);
    const tx = target.position.x;
    const ty = target.position.y;
    const blend = Math.min(1, 14 * (deltaTime || 0.016));
    const nx = tx + (goalX - tx) * blend;
    const ny = ty + (goalY - ty) * blend;
    target.body.setTranslation({ x: nx, y: ny, z: 0 }, true);
    target.body.setLinvel({ x: (goalX - nx) * 8, y: (goalY - ny) * 6, z: 0 }, true);
    target.position.set(nx, ny, 0);
    target.fighterState = FIGHTER_STATE.HITSTUN;
    target.hitstunTimer = Math.max(target.hitstunTimer, 0.06);
  }

  finishLassoPull(attacker, def) {
    const target = attacker?.lassoHeldTarget;
    if (!target || target.isDead) {
      if (attacker) attacker.lassoHeldTarget = null;
      return;
    }

    const facing = attacker.facing >= 0 ? 1 : -1;
    const hitPos = new THREE.Vector3(
      attacker.position.x + (def.pullOffsetX ?? 0.85) * facing,
      attacker.position.y + (def.pullOffsetY ?? 0.2),
      0
    );
    if (target.body) {
      target.body.setTranslation({ x: hitPos.x, y: hitPos.y, z: 0 }, true);
      target.position.copy(hitPos);
    }

    const knockback = new THREE.Vector3(facing, def.angle ?? 0.55, 0)
      .normalize()
      .multiplyScalar(def.baseKnockback ?? 5.5);

    const result = target.takeHit(
      def.damage ?? 11,
      knockback,
      def.hitstun ?? 0.26,
      def.hitlag ?? 0.05,
      hitPos,
      true,
      this._charColor(attacker),
      attacker
    );

    attacker.lassoHeldTarget = null;
    if (result.ignored) return;
    this._noteDamageDealt(attacker, result);

    attacker.applyHitlag?.(def.hitlag ?? 0.05);
    this.spawnHitEffect(hitPos, this._charColor(attacker));
    audio.playHit({ heavy: true, blocked: false, shieldBreak: false });
    this.game?.addCameraShake?.(Math.min((def.baseKnockback ?? 5.5) * 0.07, 0.9));
  }

  /** Release held target behind Onigiri with reverse launch. */
  throwGrabTarget(attacker, def) {
    const target = attacker?.grabHeldTarget;
    if (!target || target.isDead) {
      if (attacker) attacker.grabHeldTarget = null;
      return;
    }

    const facing = attacker.facing >= 0 ? 1 : -1;
    const behind = -facing;
    const releaseX = attacker.position.x + (def.throwOffsetX ?? 0.45) * behind;
    const releaseY = attacker.position.y + (def.throwOffsetY ?? 0.25);

    if (target.body) {
      target.body.setTranslation({ x: releaseX, y: releaseY, z: 0 }, true);
      target.position.set(releaseX, releaseY, 0);
    }

    // Launch opposite Onigiri's facing (throw behind)
    const knockback = new THREE.Vector3(behind, def.angle ?? 0.65, 0)
      .normalize()
      .multiplyScalar(def.baseKnockback ?? 9.5);

    const result = target.takeHit(
      def.damage,
      knockback,
      def.hitstun,
      def.hitlag,
      new THREE.Vector3(releaseX, releaseY, 0),
      true,
      this._charColor(attacker),
      attacker
    );

    attacker.grabHeldTarget = null;
    if (result.ignored) return;
    this._noteDamageDealt(attacker, result);

    attacker.applyHitlag(def.hitlag);
    this.spawnHitEffect(new THREE.Vector3(releaseX, releaseY, 0), this._charColor(attacker));
    audio.playHit({ heavy: true, blocked: false, shieldBreak: false });
    this.game?.addCameraShake?.(Math.min((def.baseKnockback ?? 9) * 0.08, 1.1));
  }

  _applyProjectileHit(projectile, target) {
    const facing = projectile.velocity.x >= 0 ? 1 : -1;
    const angle = projectile.angle;
    const knockback = new THREE.Vector3(facing, angle, 0).normalize().multiplyScalar(projectile.baseKnockback);

    const result = target.takeHit(
      projectile.damage,
      knockback,
      projectile.hitstun,
      projectile.hitlag,
      projectile.position.clone(),
      projectile.bypassShield,
      this._charColor(projectile.owner, projectile.coreColor),
      projectile
    );
    if (result.ignored) return;
    this._noteDamageDealt(projectile.owner, result);

    projectile.owner.applyHitlag(projectile.hitlag);
    this.spawnHitEffect(
      projectile.position.clone(),
      this._charColor(projectile.owner, projectile.coreColor)
    );
    audio.playHit({
      heavy: (projectile.damage ?? 0) >= 12,
      blocked: !!result.blocked,
      shieldBreak: !!result.shieldBreak
    });
    // Puddle is spawned when projectile is destroyed (hit or ground land)
    if (this.game?.addCameraShake) {
      const kb = knockback.length();
      this.game.addCameraShake(Math.min(kb * 0.055, 1.0));
    }
  }

  checkBlastZones(character) {
    const pos = character.position;

    if (
      Math.abs(pos.x) > BLAST_ZONES.HORIZONTAL ||
      pos.y > BLAST_ZONES.VERTICAL_UP ||
      pos.y < BLAST_ZONES.VERTICAL_DOWN
    ) {
      return true;
    }
    return false;
  }

  checkAllCollisions() {
    const hits = [];

    for (let i = 0; i < this.characters.length; i++) {
      for (let j = 0; j < this.characters.length; j++) {
        if (i === j) continue;
        const attacker = this.characters[i];
        const defender = this.characters[j];

        if (attacker.isDead || defender.isDead) continue;
        if (areTeammates(attacker, defender)) continue;

        const hit = this.checkHitboxCollision(attacker, defender);
        if (hit) {
          hits.push({ attacker, defender, hit });
        }
      }
    }

    return hits;
  }
}
