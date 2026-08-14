import { CHARACTER_TYPES } from '../utils/constants.js';

const FRAME = 1 / 60;

const BASE_MOVES = {
  light: {
    startup: 2 * FRAME,
    active: 4 * FRAME,
    endlag: 6 * FRAME,
    damage: 5,
    baseKnockback: 5,
    angle: 0.35,
    hitstun: 0.18,
    hitlag: 0.04,
    hitbox: { offsetX: 0.9, offsetY: 0, width: 1.0, height: 0.55, depth: 0.8 },
    // Air attacks aim up (hitbox + knockback)
    aerial: {
      angle: 1.15,
      hitbox: { offsetX: 0.35, offsetY: 1.05, width: 0.9, height: 1.1, depth: 0.8 }
    }
  },
  heavy: {
    startup: 12 * FRAME,
    active: 6 * FRAME,
    endlag: 16 * FRAME,
    damage: 20,
    baseKnockback: 8,
    angle: 0.42,
    hitstun: 0.28,
    hitlag: 0.08,
    hitbox: { offsetX: 1.3, offsetY: 0.15, width: 1.7, height: 0.9, depth: 1.0 },
    aerial: {
      angle: 1.25,
      hitbox: { offsetX: 0.4, offsetY: 1.25, width: 1.2, height: 1.35, depth: 1.0 }
    }
  }
};

const CHARACTER_SCALE = {
  [CHARACTER_TYPES.LIGHT]: {
    light: { startup: 0.75, active: 0.9, endlag: 0.8, damage: 0.85, baseKnockback: 0.85, hitstun: 0.85 },
    heavy: { startup: 0.85, active: 0.95, endlag: 0.9, damage: 0.9, baseKnockback: 0.9, hitstun: 0.9 }
  },
  [CHARACTER_TYPES.MEDIUM]: {
    light: { startup: 1.0, active: 1.0, endlag: 1.0, damage: 1.0, baseKnockback: 1.0, hitstun: 1.0 },
    heavy: { startup: 1.0, active: 1.0, endlag: 1.0, damage: 1.0, baseKnockback: 1.0, hitstun: 1.0 }
  },
  [CHARACTER_TYPES.HEAVY]: {
    light: { startup: 1.15, active: 1.0, endlag: 1.2, damage: 1.15, baseKnockback: 1.15, hitstun: 1.1 },
    heavy: { startup: 1.25, active: 1.1, endlag: 1.3, damage: 1.25, baseKnockback: 1.25, hitstun: 1.2 }
  },
  [CHARACTER_TYPES.WASABI]: {
    light: { startup: 0.72, active: 0.9, endlag: 0.78, damage: 0.82, baseKnockback: 0.85, hitstun: 0.82 },
    heavy: { startup: 0.88, active: 0.95, endlag: 0.95, damage: 0.9, baseKnockback: 0.9, hitstun: 0.88 }
  },
  [CHARACTER_TYPES.GYOZA]: {
    light: { startup: 0.98, active: 1.0, endlag: 1.0, damage: 0.98, baseKnockback: 0.98, hitstun: 0.98 },
    heavy: { startup: 1.05, active: 1.0, endlag: 1.08, damage: 1.0, baseKnockback: 1.0, hitstun: 1.0 }
  },
  [CHARACTER_TYPES.ONIGIRI]: {
    light: { startup: 1.22, active: 1.0, endlag: 1.28, damage: 1.18, baseKnockback: 1.18, hitstun: 1.12 },
    heavy: { startup: 1.32, active: 1.1, endlag: 1.38, damage: 1.28, baseKnockback: 1.28, hitstun: 1.22 }
  },
  [CHARACTER_TYPES.RAMEN]: {
    light: { startup: 1.18, active: 1.0, endlag: 1.22, damage: 1.16, baseKnockback: 1.16, hitstun: 1.1 },
    heavy: { startup: 1.28, active: 1.1, endlag: 1.32, damage: 1.24, baseKnockback: 1.24, hitstun: 1.18 }
  },
  [CHARACTER_TYPES.TAMAGO]: {
    light: { startup: 1.0, active: 1.0, endlag: 1.02, damage: 1.0, baseKnockback: 1.0, hitstun: 1.0 },
    heavy: { startup: 1.05, active: 1.0, endlag: 1.08, damage: 1.02, baseKnockback: 1.02, hitstun: 1.0 }
  }
};

function scaleMove(base, scale) {
  return {
    startup: base.startup * (scale.startup ?? 1),
    active: base.active * (scale.active ?? 1),
    endlag: base.endlag * (scale.endlag ?? 1),
    damage: base.damage * (scale.damage ?? 1),
    baseKnockback: base.baseKnockback * (scale.baseKnockback ?? 1),
    angle: base.angle,
    hitstun: base.hitstun * (scale.hitstun ?? 1),
    hitlag: base.hitlag,
    hitbox: { ...base.hitbox },
    aerial: base.aerial
      ? {
          angle: base.aerial.angle,
          hitbox: { ...base.aerial.hitbox }
        }
      : null
  };
}

/** Forward kit when grounded-style; upward kit when aimUp (jump held). */
export function resolveMoveForStance(move, isForward) {
  if (isForward || !move?.aerial) return move;
  return {
    ...move,
    angle: move.aerial.angle,
    hitbox: { ...move.aerial.hitbox }
  };
}

export function getMoveSet(characterType) {
  const scales = CHARACTER_SCALE[characterType] || CHARACTER_SCALE[CHARACTER_TYPES.MEDIUM];
  return {
    light: scaleMove(BASE_MOVES.light, scales.light),
    heavy: scaleMove(BASE_MOVES.heavy, scales.heavy)
  };
}

export function getMoveTotalDuration(move) {
  return move.startup + move.active + move.endlag;
}

export function isMoveActive(move, elapsed) {
  return elapsed >= move.startup && elapsed < move.startup + move.active;
}

export const HURTBOX = {
  width: 1.0,
  height: 1.2,
  depth: 1.0
};

export const COMBAT_FEEL = {
  DI_STRENGTH: 0.12,
  DI_MAX: 0.35,
  SHIELD_PUSHBACK: 6,
  SHIELD_STUN: 0.12,
  /**
   * Shield hemisphere faces local +X (facing). Source must be at least this far
   * on the facing side of the body center to count as a front block.
   */
  SHIELD_FRONT_MIN: 0.08,
  SHIELD_MAX_HP: 60,
  /** Damage dealt to shield HP when blocking (scaled by attack damage). */
  SHIELD_DAMAGE_MULT: 1.35,
  SHIELD_REGEN_PER_SEC: 10,
  SHIELD_REGEN_DELAY: 0.85,
  SHIELD_BREAK_STUN: 1.35,
  DODGE_DURATION: 0.2,
  DODGE_IFRAMES: 0.14,
  DODGE_SPEED: 11,
  DODGE_COOLDOWN: 0.55,
  DODGE_ENDLAG: 0.08,
  GROUND_RAY_LENGTH: 0.75,
  GROUND_RAY_ORIGIN_Y: 0.1,
  /** Su Timer: seconds without dealing damage before coward % starts ticking. */
  COWARD_GRACE: 5,
  /** +% damage applied each coward tick. */
  COWARD_DAMAGE: 1,
  /** Seconds between coward damage ticks once grace expires. */
  COWARD_TICK: 1
};
