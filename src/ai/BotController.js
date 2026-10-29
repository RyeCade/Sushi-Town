import * as THREE from 'three';
import {
  FIGHTER_STATE,
  AI_DIFFICULTY,
  AI_DIFFICULTY_SETTINGS,
  CHARACTER_TYPES,
  areTeammates
} from '../utils/constants.js';

const EDGE_MARGIN = 0.55;
const GAP_LOOKAHEAD = 1.35;
const RECOVER_Y = 0.8;
const FALLING_Y = -1.5;

export class BotController {
  constructor(player, allCharacters, difficulty = AI_DIFFICULTY.MID, game = null) {
    this.player = player;
    this.allCharacters = allCharacters;
    this.difficulty = difficulty;
    this.game = game;
    this.settings = AI_DIFFICULTY_SETTINGS[difficulty] || AI_DIFFICULTY_SETTINGS[AI_DIFFICULTY.MID];
    this.reactionDelay = this.settings.reactionDelay;
    this.lastDecisionTime = 0;
    this.currentState = 'idle';
    this.targetCharacter = null;
    this.lastInput = null;
    this.heavyHoldUntil = 0;
    this.lightReleaseAt = 0;
    this.platformGoal = null;
    /** performance.now() deadline while intentionally dropping to a lower foe */
    this._dropUntil = 0;
  }

  getStagePlatforms() {
    return this.game?.stage?.platforms || [];
  }

  /** Platform surface: top Y + horizontal bounds */
  platformInfo(p) {
    const w = p.bounds?.width ?? 0;
    const h = p.bounds?.height ?? 0;
    const x = p.mesh?.position?.x ?? 0;
    const y = p.mesh?.position?.y ?? 0;
    const halfW = w / 2;
    let top = y + h / 2;
    if (!p.oneWay && h >= 0.8) top += 0.14;
    else top += 0.05;
    return {
      x,
      left: x - halfW,
      right: x + halfW,
      top,
      halfW,
      oneWay: !!p.oneWay,
      solid: !p.oneWay && h >= 0.8
    };
  }

  getSurfaces() {
    return this.getStagePlatforms().map((p) => this.platformInfo(p));
  }

  /** Highest surface under world X at or below maxY */
  surfaceAt(x, maxY = Infinity) {
    let best = null;
    for (const s of this.getSurfaces()) {
      if (x < s.left - 0.1 || x > s.right + 0.1) continue;
      if (s.top > maxY + 0.4) continue;
      if (!best || s.top > best.top) best = s;
    }
    return best;
  }

  /** True if feet at (x,y) would have solid footing */
  hasFooting(x, y = this.player.position.y) {
    const s = this.surfaceAt(x, y + 0.5);
    return !!s && s.top <= y + 1.2;
  }

  /** Nearest platform center for recovery (prefer solid ground, then any) */
  nearestRecoverySurface(fromX, fromY) {
    const surfaces = this.getSurfaces();
    if (!surfaces.length) return null;

    let best = null;
    let bestScore = Infinity;
    for (const s of surfaces) {
      const cx = THREE.MathUtils.clamp(fromX, s.left + 0.4, s.right - 0.4);
      const dx = cx - fromX;
      const dy = s.top - fromY;
      // Prefer reachable height and closer X; solid slightly preferred
      const heightPenalty = dy > 3.2 ? (dy - 3.2) * 4 : 0;
      const solidBonus = s.solid ? -1.5 : 0;
      const score = Math.abs(dx) + Math.abs(Math.min(dy, 0)) * 0.4 + heightPenalty + solidBonus;
      if (score < bestScore) {
        bestScore = score;
        best = { ...s, aimX: cx };
      }
    }
    return best;
  }

  /** Soft platform to climb toward if target is higher */
  climbTargetToward(targetX, targetY, myY) {
    if (targetY <= myY + 0.6) return null;
    let best = null;
    let bestScore = Infinity;
    for (const s of this.getSurfaces()) {
      if (!s.oneWay) continue;
      if (s.top <= myY + 0.35) continue;
      if (s.top > myY + 2.6) continue;
      const dx = Math.abs(s.x - targetX) + Math.abs(s.x - this.player.position.x) * 0.5;
      const dy = s.top - myY;
      const score = dx + dy * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  /** Standing near platform edge? */
  nearEdge(margin = EDGE_MARGIN) {
    const x = this.player.position.x;
    const y = this.player.position.y;
    const s = this.surfaceAt(x, y + 0.8);
    if (!s) return { near: true, side: 0 };
    const distLeft = x - s.left;
    const distRight = s.right - x;
    if (distLeft < margin) return { near: true, side: -1, surface: s };
    if (distRight < margin) return { near: true, side: 1, surface: s };
    return { near: false, side: 0, surface: s };
  }

  /** Walking dir would step into a hole? */
  gapAhead(dirSign) {
    if (!dirSign) return false;
    const x = this.player.position.x;
    const y = this.player.position.y;
    const probe = x + dirSign * GAP_LOOKAHEAD;
    if (this.hasFooting(probe, y)) return false;
    // Also check slightly further for wider gaps (Soy River ~4)
    if (this.hasFooting(x + dirSign * (GAP_LOOKAHEAD + 1.2), y)) return false;
    return true;
  }

  /** Can jump across gap if landing exists within jump range */
  gapLanding(dirSign) {
    const x = this.player.position.x;
    const y = this.player.position.y;
    for (let d = 1.5; d <= 6.5; d += 0.5) {
      const lx = x + dirSign * d;
      const s = this.surfaceAt(lx, y + 2.5);
      if (s && Math.abs(s.top - y) < 2.8) {
        return { x: THREE.MathUtils.clamp(lx, s.left + 0.35, s.right - 0.35), surface: s };
      }
    }
    return null;
  }

  recoverInput() {
    const input = this.getIdleInput();
    const pos = this.player.position;
    const goal = this.nearestRecoverySurface(pos.x, pos.y);
    if (!goal) {
      input.jump = !!this.settings.recoverJump;
      input.right = pos.x < 0;
      input.left = pos.x >= 0;
      return input;
    }

    this.platformGoal = goal;
    const dx = goal.aimX - pos.x;
    input.right = dx > 0.2;
    input.left = dx < -0.2;

    const needUp = pos.y < goal.top - 0.15;
    const canJump = this.player.isGrounded || this.player.canDoubleJump;
    if (needUp && canJump && this.settings.recoverJump) {
      input.jump = true;
    }
    // Drift toward platform while airborne
    if (!this.player.isGrounded) {
      input.right = dx > 0.1;
      input.left = dx < -0.1;
      if (pos.y < goal.top - 0.5 && this.player.canDoubleJump && this.settings.recoverJump) {
        input.jump = true;
      }
    }
    return input;
  }

  /** Gap/edge safety: may override movement / force jump or retreat */
  applyTerrainSafety(input, preferredDir) {
    const pos = this.player.position;
    const grounded = this.player.isGrounded;
    const dropping = performance.now() < this._dropUntil;

    // Off-stage / falling through hole — full recover
    // (still recover if we fell too far even during a chase drop)
    const underStage = pos.y < FALLING_Y;
    const noFooting = !grounded && !this.hasFooting(pos.x, pos.y + 1.5) && pos.y < RECOVER_Y;
    if (underStage || (noFooting && !dropping)) {
      this._dropUntil = 0;
      return this.recoverInput();
    }

    if (!grounded) {
      // Airborne over a hole: drift to nearest bank / platform
      // (skip if we just stepped off to drop onto a lower opponent)
      if (!dropping && !this.hasFooting(pos.x, pos.y + 2)) {
        const goal = this.nearestRecoverySurface(pos.x, pos.y);
        if (goal) {
          const dx = goal.aimX - pos.x;
          input.right = dx > 0.15;
          input.left = dx < -0.15;
          if (this.player.canDoubleJump && pos.y < goal.top && this.settings.recoverJump) {
            input.jump = true;
          }
        }
      }
      return input;
    }

    // Intentional drop onto lower opponent — allow walking off this platform
    if (dropping) {
      return input;
    }

    // Grounded: don't walk off edges into holes
    let moveDir = 0;
    if (input.right) moveDir = 1;
    else if (input.left) moveDir = -1;
    else if (preferredDir) moveDir = preferredDir > 0 ? 1 : preferredDir < 0 ? -1 : 0;

    if (moveDir !== 0 && this.gapAhead(moveDir)) {
      const landing = this.gapLanding(moveDir);
      if (landing && Math.abs(landing.x - pos.x) < 5.5) {
        // Jump across
        input.jump = true;
        input.right = moveDir > 0;
        input.left = moveDir < 0;
      } else {
        // Can't clear — stop / back up from edge
        input.right = false;
        input.left = false;
        const edge = this.nearEdge(0.9);
        if (edge.near && edge.side !== 0) {
          input.right = edge.side < 0;
          input.left = edge.side > 0;
        }
        // Prefer soft platform bridge if one spans nearby
        const bridge = this.climbTargetToward(pos.x + moveDir * 4, pos.y + 2, pos.y);
        if (bridge) {
          const dx = bridge.x - pos.x;
          input.right = dx > 0.2;
          input.left = dx < -0.2;
          if (Math.abs(dx) < 2.2) input.jump = true;
        }
      }
    }

    // Standing on thin edge — nudge inward
    const edge = this.nearEdge(EDGE_MARGIN);
    if (edge.near && edge.surface && !input.jump) {
      if (edge.side < 0 && !input.right) {
        // Don't keep walking left off
        if (input.left && this.gapAhead(-1)) {
          input.left = false;
          input.right = true;
        }
      }
      if (edge.side > 0 && !input.left) {
        if (input.right && this.gapAhead(1)) {
          input.right = false;
          input.left = true;
        }
      }
    }

    return input;
  }

  /** Jump onto soft platforms when chasing someone above */
  applyPlatformClimb(input, target) {
    if (!target || this.player.isDead) return input;
    const myY = this.player.position.y;
    const ty = target.position.y;
    if (ty <= myY + 0.75) return input;

    const climb = this.climbTargetToward(target.position.x, ty, myY);
    if (!climb) {
      // Direct jump if under target platform
      if (this.player.isGrounded && Math.abs(target.position.x - this.player.position.x) < 2.5) {
        input.jump = true;
      }
      return input;
    }

    const dx = climb.x - this.player.position.x;
    // Only redirect when not mid-combo melee
    if (this.currentState !== 'attack' || Math.abs(ty - myY) > 1.2) {
      input.right = dx > 0.25;
      input.left = dx < -0.25;
    }
    if (this.player.isGrounded && Math.abs(dx) < 2.8 && Math.random() < 0.85) {
      input.jump = true;
    } else if (!this.player.isGrounded && this.player.canDoubleJump && myY < climb.top - 0.3) {
      if (Math.abs(dx) < 2.5) input.jump = true;
    }
    return input;
  }

  /**
   * Leave a higher platform to chase someone below.
   * Terrain safety normally blocks walking off edges — allow a controlled drop
   * when the opponent is clearly lower and landing exists underneath.
   */
  applyPlatformDrop(input, target) {
    if (!target || this.player.isDead || !this.player.isGrounded) return input;

    const myX = this.player.position.x;
    const myY = this.player.position.y;
    const tx = target.position.x;
    const ty = target.position.y;

    // Only when opponent is meaningfully below
    if (ty >= myY - 0.85) return input;

    const mySurface = this.surfaceAt(myX, myY + 0.8);
    if (!mySurface) return input;

    // Already on the same height band as target footing — no drop needed
    const underTarget = this.surfaceAt(tx, ty + 0.8);
    if (underTarget && Math.abs(underTarget.top - mySurface.top) < 0.4) return input;

    // Prefer dropping from soft platforms; solid main stage only if target is far below
    if (!mySurface.oneWay && myY - ty < 1.6) return input;

    // Safe landing somewhere below (stage or lower soft platform)
    const landing = this.surfaceAt(myX, mySurface.top - 0.5);
    const landingNearTarget = this.surfaceAt(tx, ty + 1.2);
    const hasLanding =
      (landing && landing.top < mySurface.top - 0.4) ||
      (landingNearTarget && landingNearTarget.top < mySurface.top - 0.4);
    if (!hasLanding) return input;

    // Walk toward the side that gets us closer to the target, off this platform
    const toTarget = tx - myX;
    let dropDir = toTarget > 0.15 ? 1 : toTarget < -0.15 ? -1 : 0;

    // If target is roughly under us, pick nearer edge
    if (dropDir === 0) {
      const distLeft = myX - mySurface.left;
      const distRight = mySurface.right - myX;
      dropDir = distLeft <= distRight ? -1 : 1;
    }

    // Aim past the edge so we actually leave the platform
    const edgeX = dropDir > 0 ? mySurface.right + 0.35 : mySurface.left - 0.35;
    const dx = edgeX - myX;
    input.right = dx > 0.05;
    input.left = dx < -0.05;
    input.jump = false;
    input.shield = false;

    // Hold long enough to clear the edge and fall a short distance
    this._dropUntil = performance.now() + 550;
    return input;
  }

  getInput() {
    if (
      this.player.isDead ||
      this.player.fighterState === FIGHTER_STATE.HITSTUN ||
      this.player.fighterState === FIGHTER_STATE.SHIELD_BREAK ||
      this.player.fighterState === FIGHTER_STATE.DODGE ||
      this.player.hitlagTimer > 0
    ) {
      this.heavyHoldUntil = 0;
      this.lightReleaseAt = 0;
      return this.getIdleInput();
    }

    if (
      this.player.isRolling ||
      this.player.isGrabbing ||
      this.player.isLassoing ||
      this.player.isGroundPounding ||
      this.player.isCountering
    ) {
      return this.getIdleInput();
    }

    const now = performance.now();

    if (this.lightReleaseAt > 0) {
      if (now < this.lightReleaseAt) {
        const tap = this.getIdleInput();
        tap.attack = true;
        tap.attackHeld = true;
        this.lastInput = tap;
        return tap;
      }
      this.lightReleaseAt = 0;
      const release = this.getIdleInput();
      this.lastInput = release;
      return release;
    }

    if (now < this.heavyHoldUntil || this.player.isChargingHeavy) {
      const hold = this.getIdleInput();
      hold.attackHeld = true;
      if (this.lastInput) {
        hold.left = this.lastInput.left;
        hold.right = this.lastInput.right;
      }
      // Still respect recovery while charging
      const safe = this.applyTerrainSafety(hold, 0);
      this.lastInput = safe;
      return safe;
    }

    // Recovery reacts immediately (don't wait on reaction delay)
    const pos = this.player.position;
    if (
      pos.y < FALLING_Y ||
      (!this.player.isGrounded && !this.hasFooting(pos.x, pos.y + 1.5) && pos.y < RECOVER_Y)
    ) {
      const rec = this.recoverInput();
      this.lastInput = rec;
      this.lastDecisionTime = now;
      return rec;
    }

    if (now - this.lastDecisionTime < this.reactionDelay) {
      return this.getLastInput();
    }

    this.lastDecisionTime = now;
    this.findTarget();

    if (!this.targetCharacter || this.targetCharacter.isDead) {
      return this.getIdleInput();
    }

    const distance = this.player.position.distanceTo(this.targetCharacter.position);
    const direction = new THREE.Vector3()
      .subVectors(this.targetCharacter.position, this.player.position);

    const { approachRange, attackRange } = this.settings;
    if (distance > approachRange) {
      this.currentState = 'approach';
    } else if (distance < attackRange) {
      this.currentState = 'attack';
    } else {
      this.currentState = 'position';
    }

    return this.makeDecision(distance, direction);
  }

  findTarget() {
    let best = null;
    let bestDist = Infinity;
    for (const char of this.allCharacters) {
      if (char === this.player || char.isDead || char.stocks <= 0) continue;
      if (areTeammates(this.player, char)) continue;
      const d = this.player.position.distanceTo(char.position);
      if (d < bestDist) {
        bestDist = d;
        best = char;
      }
    }
    this.targetCharacter = best;
  }

  getIdleInput() {
    return {
      left: false,
      right: false,
      jump: false,
      jumpHeld: false,
      attack: false,
      attackHeld: false,
      dodge: false,
      special: false,
      shield: false,
      grab: false
    };
  }

  getLastInput() {
    return this.lastInput || this.getIdleInput();
  }

  canUseSpecial() {
    return (
      this.player.specialCooldown <= 0 &&
      this.player.fighterState === FIGHTER_STATE.ACTIONABLE &&
      !this.player.isAttacking &&
      !this.player.isChargingHeavy &&
      !this.player.isDodging &&
      !this.player.shieldBroken
    );
  }

  wantsSpecial(distance, target) {
    if (!this.canUseSpecial()) return false;
    const s = this.settings;
    if (Math.random() > (s.specialChance ?? 0.2)) return false;

    const type = this.player.type;
    const specialRange = s.specialRange ?? 6;
    const melee = s.meleeRange ?? 1.7;
    const targetShielding = !!target.isShielding;
    const targetAttacking = !!target.isAttacking;
    const targetHigh = target.damage >= 60;

    switch (type) {
      case CHARACTER_TYPES.LIGHT:
        return distance > melee + 0.4 && distance < specialRange;
      case CHARACTER_TYPES.WASABI:
        return distance > 2.0 && distance < specialRange + 1;
      case CHARACTER_TYPES.MEDIUM:
        return targetAttacking && distance < melee + 1.2;
      case CHARACTER_TYPES.GYOZA:
        return distance > 1.2 && distance < 5.5;
      case CHARACTER_TYPES.HEAVY:
        return distance < 2.8 && (targetShielding || distance < melee + 0.6);
      case CHARACTER_TYPES.ONIGIRI:
        return distance < 2.2 && (targetShielding || targetHigh || distance < melee + 0.3);
      case CHARACTER_TYPES.RAMEN:
        return distance > 1.8 && distance < 5.5 && (targetShielding || targetHigh || distance > melee + 0.5);
      case CHARACTER_TYPES.TAMAGO:
        return distance < 2.8 && !this.player.isStinkCloud && (targetHigh || distance < melee + 1.2);
      default:
        return distance < specialRange && Math.random() < 0.35;
    }
  }

  makeDecision(distance, direction) {
    const input = this.getIdleInput();
    const horizontal = direction.x;
    const s = this.settings;
    const target = this.targetCharacter;
    const melee = s.meleeRange ?? 1.7;

    const faceIn = () => {
      input.right = horizontal > 0.15;
      input.left = horizontal < -0.15;
    };

    // Defense when opponent is swinging
    if (target.isAttacking && this.player.isGrounded && distance < melee + 1.4) {
      const r = Math.random();
      const shieldP = s.shieldVsAttackChance ?? 0.3;
      const dodgeP = s.dodgeVsAttackChance ?? 0.2;
      if (r < dodgeP && this.player.dodgeCooldown <= 0) {
        input.dodge = true;
        if (Math.random() < 0.55) {
          input.left = horizontal > 0;
          input.right = horizontal < 0;
        } else {
          faceIn();
        }
        const safe = this.applyTerrainSafety(input, horizontal);
        this.lastInput = safe;
        return safe;
      }
      if (r < dodgeP + shieldP) {
        input.shield = true;
        faceIn();
        const safe = this.applyTerrainSafety(input, horizontal);
        this.lastInput = safe;
        return safe;
      }
    }

    if (this.wantsSpecial(distance, target)) {
      input.special = true;
      faceIn();
      const safe = this.applyTerrainSafety(input, horizontal);
      this.lastInput = safe;
      return safe;
    }

    if (this.currentState === 'approach') {
      faceIn();
      if (
        this.canUseSpecial() &&
        (this.player.type === CHARACTER_TYPES.LIGHT || this.player.type === CHARACTER_TYPES.WASABI) &&
        distance > 3 &&
        distance < (s.specialRange ?? 6) &&
        Math.random() < (s.specialChance ?? 0.2) * 0.7
      ) {
        input.special = true;
      } else if (distance > 7 && this.player.isGrounded && Math.random() < s.jumpApproachChance) {
        input.jump = true;
      } else if (
        this.player.type === CHARACTER_TYPES.GYOZA &&
        this.canUseSpecial() &&
        distance > 2.5 &&
        distance < 5.5 &&
        Math.random() < (s.specialChance ?? 0.2)
      ) {
        input.special = true;
      }
    }

    if (this.currentState === 'attack') {
      const inMelee = distance <= melee;

      if (!inMelee) {
        faceIn();
        if (
          this.canUseSpecial() &&
          Math.random() < (s.specialChance ?? 0.2) * 0.8
        ) {
          const t = this.player.type;
          if (
            t === CHARACTER_TYPES.GYOZA ||
            t === CHARACTER_TYPES.LIGHT ||
            t === CHARACTER_TYPES.WASABI ||
            t === CHARACTER_TYPES.RAMEN ||
            t === CHARACTER_TYPES.TAMAGO
          ) {
            input.special = true;
          }
        }
      } else {
        faceIn();
        if (
          target.isShielding &&
          this.canUseSpecial() &&
          (this.player.type === CHARACTER_TYPES.ONIGIRI ||
            this.player.type === CHARACTER_TYPES.HEAVY ||
            this.player.type === CHARACTER_TYPES.RAMEN) &&
          Math.random() < 0.75
        ) {
          input.special = true;
        } else {
          const rand = Math.random();
          const lightEnd = s.lightChance;
          const heavyEnd = lightEnd + s.heavyChance;
          const specialEnd = heavyEnd + (s.specialChance ?? 0) * 0.5;
          const shieldEnd = specialEnd + s.shieldIdleChance;

          if (rand < lightEnd) {
            input.attack = true;
            input.attackHeld = true;
            this.lightReleaseAt = performance.now() + 50;
            if (direction.y > 0.6) input.jumpHeld = true;
          } else if (rand < heavyEnd) {
            input.attack = true;
            input.attackHeld = true;
            this.heavyHoldUntil = performance.now() + 600;
            if (direction.y > 0.6) input.jumpHeld = true;
          } else if (rand < specialEnd && this.canUseSpecial()) {
            input.special = true;
          } else if (rand < shieldEnd && this.player.isGrounded) {
            input.shield = true;
          } else {
            faceIn();
          }
        }
      }
    }

    if (this.currentState === 'position') {
      faceIn();
      if (
        this.canUseSpecial() &&
        distance > melee &&
        distance < (s.specialRange ?? 6.5) &&
        Math.random() < (s.specialChance ?? 0.2)
      ) {
        const t = this.player.type;
        if (
          t === CHARACTER_TYPES.LIGHT ||
          t === CHARACTER_TYPES.WASABI ||
          t === CHARACTER_TYPES.GYOZA ||
          t === CHARACTER_TYPES.MEDIUM ||
          t === CHARACTER_TYPES.RAMEN ||
          t === CHARACTER_TYPES.TAMAGO
        ) {
          input.special = true;
        }
      } else if (distance <= melee && Math.random() < 0.5) {
        input.attack = true;
        input.attackHeld = true;
        this.lightReleaseAt = performance.now() + 50;
      }

      if (this.player.isGrounded && Math.random() < s.jumpPositionChance) {
        input.jump = true;
      }
    }

    // Climb soft platforms when opponent is higher
    this.applyPlatformClimb(input, target);
    // Walk off soft platforms when opponent is below (climb may no-op)
    this.applyPlatformDrop(input, target);

    // Gap / hole / edge safety last so it can override chase
    const safe = this.applyTerrainSafety(input, horizontal);
    this.lastInput = safe;
    return safe;
  }
}
