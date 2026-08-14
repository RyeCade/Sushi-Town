export const GAME_STATES = {
  TITLE: 'title',
  CHARACTER_SELECT: 'character_select',
  COUNTDOWN: 'countdown',
  FIGHT: 'fight',
  KO: 'ko',
  VICTORY: 'victory'
};

export const CHARACTER_TYPES = {
  LIGHT: 'light',
  MEDIUM: 'medium',
  HEAVY: 'heavy',
  WASABI: 'wasabi',
  GYOZA: 'gyoza',
  ONIGIRI: 'onigiri',
  RAMEN: 'ramen',
  TAMAGO: 'tamago'
};

export const FIGHTER_STATE = {
  ACTIONABLE: 'actionable',
  ATTACK: 'attack',
  HITSTUN: 'hitstun',
  SHIELD: 'shield',
  DODGE: 'dodge',
  SHIELD_BREAK: 'shield_break',
  DEAD: 'dead'
};

export const PLAYER_MODES = {
  ONE_V_AI: '1vAi',
  FFA_2: 'ffa2',
  FFA_3: 'ffa3',
  FFA_4: 'ffa4',
  TEAM_2V2: '2v2',
  TEAM_3V1: '3v1'
};

/** Character-select / match input source. */
export const INPUT_MODES = {
  KEYBOARD: 'keyboard',
  PAD: 'pad'
};

export const MAX_PLAYERS = 4;

/** Default team color ids by slot index 0–3. */
export const DEFAULT_SLOT_COLORS = ['red', 'blue', 'yellow', 'green'];

/** Player team colors (limbs + overhead triangle). */
export const PLAYER_COLORS = {
  red: 0xff2222,
  blue: 0x2266ff,
  yellow: 0xffdd22,
  orange: 0xff8800,
  green: 0x22cc44,
  darkgreen: 0x1a6b2a,
  cyan: 0x22ddee,
  purple: 0xaa44ff,
  pink: 0xff66aa,
  black: 0x222222,
  white: 0xf0f0f0,
  grey: 0x888888
};

export const PLAYER_COLOR_IDS = Object.keys(PLAYER_COLORS);

export function getMatchPlayerCount(mode) {
  switch (mode) {
    case PLAYER_MODES.FFA_3:
      return 3;
    case PLAYER_MODES.FFA_4:
    case PLAYER_MODES.TEAM_2V2:
    case PLAYER_MODES.TEAM_3V1:
      return 4;
    case PLAYER_MODES.FFA_2:
    case PLAYER_MODES.ONE_V_AI:
    default:
      return 2;
  }
}

export function isFfaMode(mode) {
  return (
    mode === PLAYER_MODES.FFA_2 ||
    mode === PLAYER_MODES.FFA_3 ||
    mode === PLAYER_MODES.FFA_4
  );
}

export function isOneVAi(mode) {
  return mode === PLAYER_MODES.ONE_V_AI;
}

export function isTeamMode(mode) {
  return mode === PLAYER_MODES.TEAM_2V2 || mode === PLAYER_MODES.TEAM_3V1;
}

/** Default teamId (0 | 1) per slot. 2v2: A A B B; 3v1: A B B B. */
export function getTeamDefaultTeamIds(mode) {
  if (mode === PLAYER_MODES.TEAM_2V2) return [0, 0, 1, 1];
  if (mode === PLAYER_MODES.TEAM_3V1) return [0, 1, 1, 1];
  return null;
}

/** Default color ids per slot for team modes (matches default teamIds). */
export function getTeamDefaultColors(mode) {
  if (mode === PLAYER_MODES.TEAM_2V2) return ['red', 'red', 'blue', 'blue'];
  if (mode === PLAYER_MODES.TEAM_3V1) return ['red', 'blue', 'blue', 'blue'];
  return null;
}

/** Team groups from live slot.teamId values → [[...A], [...B]]. */
export function getTeamSlotIndicesFromSlots(slots) {
  const a = [];
  const b = [];
  for (let i = 0; i < (slots?.length || 0); i++) {
    const tid = slots[i]?.teamId;
    if (tid === 1) b.push(i);
    else a.push(i);
  }
  return [a, b];
}

/** @deprecated Prefer getTeamSlotIndicesFromSlots — fixed layout defaults only. */
export function getTeamSlotIndices(mode) {
  const ids = getTeamDefaultTeamIds(mode);
  if (!ids) return null;
  const a = [];
  const b = [];
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === 1) b.push(i);
    else a.push(i);
  }
  return [a, b];
}

/** Slot indices that share teamId with `slotIndex` (including self). */
export function getTeamMateSlotIndices(slotsOrMode, slotIndex, maybeSlots) {
  // Support (slots, slotIndex) and legacy (mode, slotIndex)
  let slots = slotsOrMode;
  if (!Array.isArray(slotsOrMode)) {
    slots = maybeSlots;
    if (!slots) return [slotIndex];
  }
  const tid = slots[slotIndex]?.teamId ?? 0;
  const out = [];
  for (let i = 0; i < slots.length; i++) {
    if ((slots[i]?.teamId ?? 0) === tid) out.push(i);
  }
  return out.length ? out : [slotIndex];
}

export const TEAM_LABELS = ['TEAM A', 'TEAM B'];

/** Same teamColor hex ⇒ teammates. Missing color ⇒ not teammates. */
export function areTeammates(a, b) {
  if (!a || !b || a === b) return false;
  const ca = a.teamColor;
  const cb = b.teamColor;
  if (ca == null || cb == null) return false;
  return ca === cb;
}

/** Keyboard: 1vAi, FFA 2, and team modes (2 humans + CPU fill). */
export function isKeyboardPlayerMode(mode) {
  return (
    mode === PLAYER_MODES.ONE_V_AI ||
    mode === PLAYER_MODES.FFA_2 ||
    isTeamMode(mode)
  );
}

export const AI_DIFFICULTY = {
  EASY: 'easy',
  MID: 'mid',
  HARD: 'hard'
};

/** Bot tuning by difficulty (ms delay, ranges, action chances).
 * attackRange / meleeRange should stay near hitbox reach (~1.4 light, ~2.1 heavy). */
export const AI_DIFFICULTY_SETTINGS = {
  [AI_DIFFICULTY.EASY]: {
    reactionDelay: 420,
    approachRange: 12,
    attackRange: 2.0,
    meleeRange: 1.55,
    specialRange: 5.5,
    jumpApproachChance: 0.18,
    jumpPositionChance: 0.1,
    shieldVsAttackChance: 0.18,
    dodgeVsAttackChance: 0.12,
    lightChance: 0.62,
    heavyChance: 0.14,
    specialChance: 0.12,
    shieldIdleChance: 0.05,
    recoverJump: true
  },
  [AI_DIFFICULTY.MID]: {
    reactionDelay: 220,
    approachRange: 11,
    attackRange: 2.2,
    meleeRange: 1.7,
    specialRange: 6.5,
    jumpApproachChance: 0.42,
    jumpPositionChance: 0.22,
    shieldVsAttackChance: 0.38,
    dodgeVsAttackChance: 0.28,
    lightChance: 0.48,
    heavyChance: 0.24,
    specialChance: 0.28,
    shieldIdleChance: 0.07,
    recoverJump: true
  },
  [AI_DIFFICULTY.HARD]: {
    reactionDelay: 90,
    approachRange: 10,
    attackRange: 2.4,
    meleeRange: 1.85,
    specialRange: 7.5,
    jumpApproachChance: 0.55,
    jumpPositionChance: 0.3,
    shieldVsAttackChance: 0.52,
    dodgeVsAttackChance: 0.42,
    lightChance: 0.38,
    heavyChance: 0.28,
    specialChance: 0.42,
    shieldIdleChance: 0.08,
    recoverJump: true
  }
};

export const PLAYER_CONTROLS = {
  PLAYER1: {
    LEFT: ['KeyA'],
    RIGHT: ['KeyD'],
    JUMP: ['KeyW'],
    ATTACK: ['KeyV'],
    DODGE: ['KeyC'],
    SPECIAL: ['ShiftLeft'],
    SHIELD: ['KeyS'],
    GRAB: ['KeyG']
  },
  PLAYER2: {
    LEFT: ['ArrowLeft'],
    RIGHT: ['ArrowRight'],
    JUMP: ['ArrowUp'],
    ATTACK: ['Backslash'],
    DODGE: ['BracketRight'],
    SPECIAL: ['Enter'],
    SHIELD: ['ArrowDown'],
    GRAB: ['NumpadDecimal']
  }
};

export const MOVEMENT = {
  WALK_SPEED: 5,
  DASH_SPEED: 12,
  DASH_DECAY: 0.9,
  JUMP_FORCE: 15,
  DOUBLE_JUMP_FORCE: 12,
  AIR_MOBILITY: 6,
  FAST_FALL_SPEED: 20,
  GRAVITY: 30
};

export const COMBAT = {
  LIGHT_DAMAGE: 5,
  HEAVY_DAMAGE: 20,
  LIGHT_KNOCKBACK: 5,
  HEAVY_KNOCKBACK: 8,
  SHIELD_KNOCKBACK_REDUCTION: 0.5,
  INVINCIBILITY_TIME: 2000
};

export const BLAST_ZONES = {
  HORIZONTAL: 40,
  VERTICAL_UP: 30,
  VERTICAL_DOWN: -20
};

export const INITIAL_STOCKS = 3;
/** Allowed stock counts on character select. */
export const STOCK_OPTIONS = [1, 2, 3, 4, 5];

/** Optional stage hazards (enabled via character-select toggle). */
export const HAZARD_KINDS = {
  STEAM_VENT: 'steam_vent',
  FALLING_COMET: 'falling_comet'
};

export const HAZARDS = {
  STEAM_VENT: {
    radius: 0.95,
    height: 2.4,
    period: 5.5,
    warnDuration: 0.55,
    activeDuration: 0.85,
    damage: 4,
    baseKnockback: 7.5,
    hitstun: 0.2,
    hitlag: 0.04,
    /** Per-player cooldown so multi-tick death traps cannot occur. */
    hitCooldown: 1.1
  },
  FALLING_COMET: {
    radius: 0.55,
    impactRadius: 1.35,
    spawnHeight: 11,
    fallSpeed: 16,
    warnDuration: 0.7,
    spawnIntervalMin: 3.2,
    spawnIntervalMax: 5.5,
    maxActive: 2,
    damage: 7,
    baseKnockback: 8.5,
    hitstun: 0.24,
    hitlag: 0.05,
    hitCooldown: 1.0
  }
};

/** Per-class special moves. Inputs are wired through Character/CombatSystem. */
export const SPECIALS = {
  /** Light — Hot Oil Splash: forward projectile, direct hit only (no splash AoE). */
  OIL_PROJECTILE: {
    speed: 16,
    lifetime: 1.6,
    visualRadius: 0.22,
    collisionRadius: 0.34,
    spawnOffsetX: 0.85,
    spawnOffsetY: 0.25,
    damage: 8,
    baseKnockback: 5,
    angle: 0.18,
    hitstun: 0.18,
    hitlag: 0.05,
    cooldown: 6,
    coreColor: 0xffaa22,
    glowColor: 0xffd070
  },
  /** Medium — Counter stance: blocks incoming damage and reflects it back at the attacker. */
  COUNTER: {
    window: 0.5,
    reflectDamageMult: 1.25,
    reflectKnockbackMult: 1.25,
    reflectStunMult: 1.1,
    cooldown: 6
  },
  /** Heavy — Ground Pound: brief hop, AoE shockwave on landing that bypasses shields. */
  GROUND_POUND: {
    windupDuration: 0.32,
    recoverDuration: 0.45,
    aoeRadius: 2.4,
    hopImpulse: 6,
    damage: 14,
    baseKnockback: 7,
    angle: 1.05,
    hitstun: 0.28,
    hitlag: 0.08,
    bypassShield: true,
    cooldown: 6
  },
  /** Wasabi Drop — arcing green blob that leaves a burn puddle. */
  WASABI_DROP: {
    speed: 11,
    arcVy: 9,
    gravity: 28,
    // Landing threshold (collider top); visual puddle is raised to stone tiles in CombatSystem
    groundY: 0.5,
    lifetime: 2.2,
    visualRadius: 0.2,
    collisionRadius: 0.32,
    spawnOffsetX: 0.75,
    spawnOffsetY: 0.35,
    damage: 7,
    baseKnockback: 4.5,
    angle: 0.22,
    hitstun: 0.16,
    hitlag: 0.04,
    cooldown: 7,
    coreColor: 0x6dff4a,
    glowColor: 0xb8ff88,
    puddleRadius: 1.4,
    puddleLifetime: 3.5,
    puddleDamage: 4,
    puddleTick: 0.25,
    puddleKnockback: 1.5
  },
  /** Gyoza — short roll charge; commits hard, rewards reads. */
  TAKOYAKI_ROLL: {
    duration: 0.2,
    speed: 14,
    damage: 12,
    baseKnockback: 6,
    angle: 0.78,
    hitstun: 0.22,
    hitlag: 0.06,
    hitbox: { offsetX: 0.5, offsetY: 0, width: 0.95, height: 0.85, depth: 0.85 },
    cooldown: 7
  },
  /** Onigiri — command grab: reach → pick up → throw behind (blocked by shield). */
  ONIGIRI_GRAB: {
    startup: 0.1,
    active: 0.12,
    hold: 0.12,
    endlag: 0.32,
    range: 1.5,
    height: 1.15,
    damage: 13,
    baseKnockback: 7.5,
    angle: 1.55,
    hitstun: 0.3,
    hitlag: 0.06,
    /** Snap target in front while held. */
    holdOffsetX: 0.55,
    holdOffsetY: 0.35,
    /** Release point slightly behind Onigiri before reverse launch. */
    throwOffsetX: 0.35,
    throwOffsetY: 0.2,
    cooldown: 7
  },
  /** Ramen — noodle lasso: extend rope, snag foe (ignores shield), pull them in. */
  NOODLE_LASSO: {
    startup: 0.12,
    extend: 0.22,
    pull: 0.28,
    endlag: 0.3,
    range: 5.2,
    height: 1.25,
    ropeY: 0.35,
    tipRadius: 0.42,
    pullOffsetX: 0.85,
    pullOffsetY: 0.2,
    damage: 11,
    baseKnockback: 5.5,
    angle: 0.55,
    hitstun: 0.26,
    hitlag: 0.05,
    bypassShield: true,
    cooldown: 7.5
  },
  /** Tamago — stink cloud armor: team-color swirls damage nearby foes for a short window. */
  STINK_CLOUD: {
    duration: 3.2,
    radius: 1.85,
    tick: 0.28,
    damage: 2,
    baseKnockback: 0.35,
    angle: 0.4,
    hitstun: 0.02,
    hitlag: 0,
    cooldown: 8
  }
};
