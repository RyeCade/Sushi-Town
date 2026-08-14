import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d';
import {
  GAME_STATES,
  PLAYER_CONTROLS,
  PLAYER_MODES,
  PLAYER_COLORS,
  PLAYER_COLOR_IDS,
  DEFAULT_SLOT_COLORS,
  AI_DIFFICULTY,
  COMBAT,
  CHARACTER_TYPES,
  INPUT_MODES,
  getMatchPlayerCount,
  isFfaMode,
  isOneVAi,
  isTeamMode,
  isKeyboardPlayerMode,
  getTeamMateSlotIndices,
  getTeamDefaultColors,
  getTeamDefaultTeamIds,
  areTeammates,
} from './utils/constants.js';
import { InputManager } from './input/InputManager.js';
import { UIManager } from './ui/UIManager.js';
import { Stage, STAGE_CATALOG, STAGE_IDS, resolveStageId } from './stages/Stage.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { Character } from './characters/Character.js';
import { BotController } from './ai/BotController.js';
import { HazardSystem } from './hazards/HazardSystem.js';
import { audio } from './audio/AudioManager.js';
import { PostFX } from './gfx/PostFX.js';
import { ParticleSystem } from './gfx/ParticleSystem.js';

export class Game {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 40, 90);
    
    // Default framing; tightened per stage so view just clears furthest platform edge.
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 5.5, 18);
    this.camera.lookAt(0, 2.8, 0);
    this._camBasePos = new THREE.Vector3(0, 5.5, 18);
    this._camLookAt = new THREE.Vector3(0, 2.8, 0);
    this._shakeIntensity = 0;
    this._shakeTime = 0;
    
    // Pixel ratio cap + tone mapping for punchy toon colors
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game-container').appendChild(this.renderer.domElement);
    
    this.world = null;
    this.eventQueue = null;
    this.bodies = [];
    this.platformsByHandle = new Map();

    this.particles = new ParticleSystem(this.scene);
    this.postFX = new PostFX(this.renderer, this.scene, this.camera);
    
    this.setupLighting();
    
    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    // Soft sky/ground fill — reads better with toon materials
    const hemi = new THREE.HemisphereLight(0xffe8c8, 0x2a3048, 0.55);
    this.scene.add(hemi);
    this._hemiLight = hemi;

    const ambient = new THREE.AmbientLight(0x506080, 0.28);
    this.scene.add(ambient);
    
    const directional = new THREE.DirectionalLight(0xfff2dd, 1.15);
    directional.position.set(10, 22, 12);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 100;
    directional.shadow.camera.left = -30;
    directional.shadow.camera.right = 30;
    directional.shadow.camera.top = 30;
    directional.shadow.camera.bottom = -30;
    directional.shadow.bias = -0.0008;
    directional.shadow.normalBias = 0.02;
    this.scene.add(directional);
    this._keyLight = directional;
    
    // Cool fill from opposite side
    const fill = new THREE.DirectionalLight(0x6a9cff, 0.35);
    fill.position.set(-12, 8, -8);
    this.scene.add(fill);
    this._fillLight = fill;

    // Camera-facing rim so fighters pop off the backdrop
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.45);
    rim.position.set(0, 6, 18);
    this.scene.add(rim);
    this._rimLight = rim;
  }

  /** Tint key/fill from stage theme accent after stage builds. */
  applyStageLighting(theme) {
    if (!theme) return;
    if (theme.background != null) {
      const bg = new THREE.Color(theme.background);
      this.scene.background = bg;
      this.scene.fog = new THREE.Fog(bg.getHex(), 38, 88);
      if (this._hemiLight) {
        this._hemiLight.groundColor.set(bg).multiplyScalar(0.6);
      }
    }
    if (theme.accent != null && this._fillLight) {
      this._fillLight.color.set(theme.accent).lerp(new THREE.Color(0x6a9cff), 0.45);
    }
  }

  async init() {
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this._configureWorld(this.world);
    this.eventQueue = new RAPIER.EventQueue(true);
    
    this.inputManager = new InputManager();
    this.uiManager = new UIManager();

    // Remember last input mode (pad users shouldn't fight the keyboard default)
    try {
      const saved = localStorage.getItem('sushiTown.inputMode');
      if (saved === INPUT_MODES.PAD || saved === INPUT_MODES.KEYBOARD) {
        this._pendingInputMode = saved;
      }
    } catch {
      this._pendingInputMode = null;
    }
    
    this.characterConfigs = [
      { type: CHARACTER_TYPES.LIGHT, name: 'Tempura', stats: { weight: 0.8, speed: 1.2, jumpForce: 16, size: 1.0 }, color: 0x4488FF },
      { type: CHARACTER_TYPES.MEDIUM, name: 'California', stats: { weight: 1.0, speed: 1.0, jumpForce: 14, size: 1.0 }, color: 0x44FF44 },
      { type: CHARACTER_TYPES.HEAVY, name: 'Dumpling', stats: { weight: 1.2, speed: 0.8, jumpForce: 12, size: 1.0 }, color: 0xFF4444 },
      { type: CHARACTER_TYPES.WASABI, name: 'Wasabi', stats: { weight: 0.75, speed: 1.15, jumpForce: 15, size: 1.0 }, color: 0x6dff4a },
      { type: CHARACTER_TYPES.GYOZA, name: 'Gyoza', stats: { weight: 1.02, speed: 0.98, jumpForce: 13.5, size: 1.0 }, color: 0xe8b86d },
      { type: CHARACTER_TYPES.ONIGIRI, name: 'Onigiri', stats: { weight: 1.28, speed: 0.75, jumpForce: 11, size: 1.0 }, color: 0xf5f0e6 },
      { type: CHARACTER_TYPES.RAMEN, name: 'Ramen', stats: { weight: 1.25, speed: 0.78, jumpForce: 11.5, size: 1.0 }, color: 0xe8a04a },
      { type: CHARACTER_TYPES.TAMAGO, name: 'Tamago', stats: { weight: 1.0, speed: 1.0, jumpForce: 14, size: 1.0 }, color: 0xfff0c8 }
    ];

    this.stageCatalog = STAGE_CATALOG;
    this.currentStage = STAGE_IDS.RANDOM;
    this.playerMode = PLAYER_MODES.ONE_V_AI;
    /** keyboard = WASD/arrows only; pad = gamepads only (no keyboard in fight). */
    this.inputMode = this._pendingInputMode || INPUT_MODES.KEYBOARD;
    this.aiDifficulty = AI_DIFFICULTY.MID;
    /** null / 'random' → pick a random roster type at match start */
    this.selectedAiType = 'random';
    /** Optional stage hazards (steam vents); Off by default. */
    this.hazardsEnabled = false;
    /** Stocks per player (character-select setting). */
    this.stockCount = 3;
    /** Slot being customized on character select (0-based). */
    this.activeSlot = 0;
    this.slots = [];
    this.botControllers = [];
    this._initSlots();

    this.state = GAME_STATES.CHARACTER_SELECT;
    this.characters = [];
    this.combatSystem = null;
    this.hazardSystem = null;
    this.stage = null;
    this.audio = audio;

    // Auto-open previously authorized Switch Pros (no button press)
    this.inputManager.onHidChange(() => this._onHidPadsChanged());
    await this.inputManager.autoConnectHid();
    if (this.inputManager.switchHid?.getCount?.() > 0) {
      this.inputMode = INPUT_MODES.PAD;
      this._bindHidPadsToSlots();
    }

    this.showCharacterSelect();
    this.audio.playMenuMusic();
  }

  _onHidPadsChanged() {
    this.inputManager._syncHidMeta?.();
    if (this.inputManager.switchHid?.getCount?.() > 0) {
      // Prefer controllers once HID pads appear
      if (this.inputMode !== INPUT_MODES.PAD) {
        this.inputMode = INPUT_MODES.PAD;
        try {
          localStorage.setItem('sushiTown.inputMode', INPUT_MODES.PAD);
        } catch {
          /* ignore */
        }
      }
      this._bindHidPadsToSlots();
    }
    if (this.state === GAME_STATES.CHARACTER_SELECT) {
      this._lastPadStatusKey = '';
      this.refreshCharacterSelect();
    }
  }

  _bindHidPadsToSlots() {
    const live = this.inputManager.getLivePads();
    for (const pad of live) {
      if (!pad._hid) continue;
      if (this.slots.some((s) => s.human && s.gamepadIndex === pad.index)) continue;
      if (this.slots[0] && this.slots[0].gamepadIndex == null) {
        this.slots[0].gamepadIndex = pad.index;
        this.slots[0].padSlot = live.indexOf(pad);
      } else if (isFfaMode(this.playerMode) || isTeamMode(this.playerMode)) {
        this.tryJoinPad(live.indexOf(pad), pad.index);
      }
    }
  }

  _makeSlot(index, { human = false, joined = false } = {}) {
    const colorId = DEFAULT_SLOT_COLORS[index] || PLAYER_COLOR_IDS[index % PLAYER_COLOR_IDS.length];
    return {
      human,
      joined,
      /** Sorted live-pad slot at join (UI only). */
      padSlot: human && joined ? index : null,
      /** Stable browser Gamepad.index claimed by this slot. */
      gamepadIndex: null,
      fighterIndex: 0,
      colorId,
      /** Team mode: 0 = Team A, 1 = Team B. */
      teamId: 0,
      ready: false,
      /** Character-select cursor: 'team' | 'color' | 'fighter' | 'ready' */
      cursorFocus: 'fighter',
      cursorFighterIndex: 0,
      cursorColorId: colorId
    };
  }

  _ensureSlotCursor(slot) {
    if (!slot) return;
    if (!slot.cursorFocus) slot.cursorFocus = 'fighter';
    if (slot.cursorFighterIndex == null) {
      slot.cursorFighterIndex = slot.fighterIndex ?? 0;
    }
    if (!slot.cursorColorId) slot.cursorColorId = slot.colorId;
  }

  _slotCanCustomize(slotIndex) {
    const slot = this.slots[slotIndex];
    if (!slot) return false;
    // Team modes: every slot (human + CPU) can set team/color/fighter
    if (isTeamMode(this.playerMode)) return true;
    if (isOneVAi(this.playerMode) && slotIndex === 0) return true;
    if (isOneVAi(this.playerMode) && slotIndex === 1) return false;
    return !!(slot.human && slot.joined);
  }

  /** Slot has its own exclusive pad claim (required for multi-cursor). */
  _slotHasOwnPad(slotIndex) {
    const slot = this.slots[slotIndex];
    if (!slot || slot.gamepadIndex == null) return false;
    // Reject if another slot already claimed the same pad
    for (let i = 0; i < this.slots.length; i++) {
      if (i === slotIndex) continue;
      if (this.slots[i]?.gamepadIndex === slot.gamepadIndex) return false;
    }
    return true;
  }

  /** How many human slots have a unique pad bound. */
  _boundPadSlotCount() {
    const seen = new Set();
    let n = 0;
    for (const s of this.slots) {
      if (!s?.human || !s.joined || s.gamepadIndex == null) continue;
      if (seen.has(s.gamepadIndex)) continue;
      seen.add(s.gamepadIndex);
      n++;
    }
    return n;
  }

  /** Drop duplicate pad claims (keep lowest slot index). */
  _dedupePadClaims() {
    const seen = new Set();
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s || s.gamepadIndex == null) continue;
      if (seen.has(s.gamepadIndex)) {
        s.gamepadIndex = null;
        s.padSlot = null;
      } else {
        seen.add(s.gamepadIndex);
      }
    }
  }

  _freeColorIds(exceptSlot) {
    if (isTeamMode(this.playerMode)) {
      const enemyColor = this._enemyTeamColorId(exceptSlot);
      return PLAYER_COLOR_IDS.filter((c) => c !== enemyColor);
    }
    const used = new Set(
      this.slots
        .filter((_, i) => i !== exceptSlot)
        .map((s) => s.colorId)
        .filter(Boolean)
    );
    return PLAYER_COLOR_IDS.filter((c) => !used.has(c));
  }

  _enemyTeamColorId(slotIndex) {
    if (!isTeamMode(this.playerMode)) return null;
    const myTid = this.slots[slotIndex]?.teamId ?? 0;
    for (const s of this.slots) {
      if (!s) continue;
      if ((s.teamId ?? 0) !== myTid && s.colorId) return s.colorId;
    }
    return null;
  }

  /** Color of the first slot already on teamId, or default for that side. */
  _colorForTeamId(teamId, slots = this.slots) {
    const defaults = getTeamDefaultColors(this.playerMode) || ['red', 'blue'];
    for (const s of slots) {
      if (s && (s.teamId ?? 0) === teamId && s.colorId) return s.colorId;
    }
    return teamId === 1 ? defaults[defaults.length - 1] || 'blue' : defaults[0] || 'red';
  }

  _applyTeamColor(slotIndex, colorId) {
    const mates = getTeamMateSlotIndices(this.slots, slotIndex);
    for (const i of mates) {
      const s = this.slots[i];
      if (!s) continue;
      s.colorId = colorId;
      s.cursorColorId = colorId;
      this._ensureSlotCursor(s);
    }
    // If enemy team shares this color, move them to a free color as a unit
    const myTid = this.slots[slotIndex]?.teamId ?? 0;
    const enemyIndices = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      if ((s.teamId ?? 0) !== myTid) enemyIndices.push(i);
    }
    if (!enemyIndices.length) return;
    const enemy = this.slots[enemyIndices[0]];
    if (!enemy || enemy.colorId !== colorId) return;
    const next = PLAYER_COLOR_IDS.find((c) => c !== colorId) || 'grey';
    for (const i of enemyIndices) {
      const s = this.slots[i];
      if (!s) continue;
      s.colorId = next;
      s.cursorColorId = next;
      this._ensureSlotCursor(s);
    }
  }

  _applyTeamId(slotIndex, teamId) {
    const slot = this.slots[slotIndex];
    if (!slot || !isTeamMode(this.playerMode)) return;
    const tid = teamId === 1 ? 1 : 0;
    slot.teamId = tid;
    // Adopt the team's existing color (or default)
    const colorId = this._colorForTeamId(tid);
    // Avoid adopting enemy-only conflict: if alone on new team, keep own color if free
    const matesBefore = this.slots.filter(
      (s, i) => i !== slotIndex && s && (s.teamId ?? 0) === tid
    );
    if (matesBefore.length > 0) {
      slot.colorId = colorId;
      slot.cursorColorId = colorId;
    } else {
      // First member of this team — keep color unless it matches the other team
      const otherColor = this._enemyTeamColorId(slotIndex);
      if (slot.colorId === otherColor) {
        slot.colorId = tid === 1 ? 'blue' : 'red';
        if (slot.colorId === otherColor) {
          slot.colorId = PLAYER_COLOR_IDS.find((c) => c !== otherColor) || 'grey';
        }
        slot.cursorColorId = slot.colorId;
      }
    }
    this._ensureTeamColors();
  }

  _ensureTeamColors(slots = this.slots) {
    if (!isTeamMode(this.playerMode)) return;
    const defaults = getTeamDefaultColors(this.playerMode) || ['red', 'blue'];
    // Sync color within each teamId; keep opposing teams distinct
    const byTeam = { 0: [], 1: [] };
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      if (s.teamId !== 0 && s.teamId !== 1) s.teamId = 0;
      byTeam[s.teamId].push(i);
    }
    const colorOf = { 0: null, 1: null };
    for (const tid of [0, 1]) {
      const group = byTeam[tid];
      if (!group.length) continue;
      let id = slots[group[0]]?.colorId || (tid === 1 ? defaults[1] || 'blue' : defaults[0] || 'red');
      colorOf[tid] = id;
      for (const i of group) {
        slots[i].colorId = id;
        slots[i].cursorColorId = id;
      }
    }
    if (
      colorOf[0] != null &&
      colorOf[1] != null &&
      colorOf[0] === colorOf[1]
    ) {
      const next = PLAYER_COLOR_IDS.find((c) => c !== colorOf[0]) || 'grey';
      for (const i of byTeam[1]) {
        slots[i].colorId = next;
        slots[i].cursorColorId = next;
      }
    }
  }

  /**
   * Apply menu navigation for one slot. Returns true if UI should refresh.
   */
  _applySlotMenuNav(slotIndex, edges) {
    if (!edges || !this._slotCanCustomize(slotIndex)) return false;
    const slot = this.slots[slotIndex];
    if (!slot) return false;
    this._ensureSlotCursor(slot);

    const rosterLen = this.characterConfigs.length;
    const sections = [];
    if (isTeamMode(this.playerMode)) sections.push('team');
    sections.push('color', 'fighter');
    if (slot.human && slot.joined) sections.push('ready');
    let changed = false;

    const moveSection = (dir) => {
      const i = sections.indexOf(slot.cursorFocus);
      const next = sections[(Math.max(0, i) + dir + sections.length) % sections.length];
      if (next !== slot.cursorFocus) {
        slot.cursorFocus = next;
        changed = true;
      }
    };

    if (edges.up) moveSection(-1);
    if (edges.down) moveSection(1);

    if (edges.left || edges.right) {
      const dir = edges.right ? 1 : -1;
      if (slot.cursorFocus === 'team' && isTeamMode(this.playerMode)) {
        this._applyTeamId(slotIndex, (slot.teamId ?? 0) === 0 ? 1 : 0);
        changed = true;
      } else if (slot.cursorFocus === 'fighter') {
        const cur = slot.cursorFighterIndex ?? slot.fighterIndex ?? 0;
        const next = (cur + dir + rosterLen) % rosterLen;
        slot.cursorFighterIndex = next;
        slot.fighterIndex = next;
        changed = true;
      } else if (slot.cursorFocus === 'color') {
        const free = this._freeColorIds(slotIndex);
        if (free.length > 0) {
          let idx = free.indexOf(slot.cursorColorId);
          if (idx < 0) idx = free.indexOf(slot.colorId);
          if (idx < 0) idx = 0;
          const next = free[(idx + dir + free.length) % free.length];
          if (isTeamMode(this.playerMode)) {
            this._applyTeamColor(slotIndex, next);
          } else {
            slot.cursorColorId = next;
            slot.colorId = next;
            this._ensureUniqueColors();
          }
          changed = true;
        }
      } else if (slot.cursorFocus === 'ready' && slot.human && slot.joined) {
        slot.ready = !slot.ready;
        changed = true;
      }
    }

    if (edges.confirm && slot.human && slot.joined) {
      if (slot.cursorFocus === 'ready' || slot.cursorFocus === 'fighter') {
        slot.ready = !slot.ready;
        if (slot.cursorFocus === 'fighter') slot.cursorFocus = 'ready';
        changed = true;
      } else if (slot.cursorFocus === 'color') {
        // Confirm color → drop to fighters
        slot.cursorFocus = 'fighter';
        changed = true;
      }
    }

    return changed;
  }

  _initSlots() {
    const n = getMatchPlayerCount(this.playerMode);
    const prev = this.slots || [];
    const teamDefaults = getTeamDefaultColors(this.playerMode);
    const teamIdDefaults = getTeamDefaultTeamIds(this.playerMode);
    const next = [];
    for (let i = 0; i < n; i++) {
      const old = prev[i];
      const defaultColor =
        teamDefaults?.[i] || DEFAULT_SLOT_COLORS[i] || PLAYER_COLOR_IDS[i % PLAYER_COLOR_IDS.length];
      const defaultTeamId = teamIdDefaults?.[i] ?? 0;
      if (old) {
        next.push({
          ...old,
          colorId: isTeamMode(this.playerMode)
            ? (old.teamId != null
                ? old.colorId || defaultColor
                : teamDefaults?.[i] || old.colorId || defaultColor)
            : old.colorId || defaultColor,
          teamId: isTeamMode(this.playerMode)
            ? (old.teamId === 0 || old.teamId === 1 ? old.teamId : defaultTeamId)
            : 0,
          fighterIndex: old.fighterIndex ?? 0
        });
      } else {
        const slot = this._makeSlot(i, { human: i === 0, joined: i === 0 });
        slot.colorId = defaultColor;
        slot.cursorColorId = defaultColor;
        slot.teamId = defaultTeamId;
        next.push(slot);
      }
    }
    // Mode rules
    if (isOneVAi(this.playerMode)) {
      next[0] = {
        ...next[0],
        human: true,
        joined: true,
        padSlot: 0,
        gamepadIndex: next[0].gamepadIndex ?? null
      };
      if (next[1]) {
        next[1] = {
          ...next[1],
          human: false,
          joined: true,
          padSlot: null,
          gamepadIndex: null,
          ready: true
        };
      }
    } else if (
      this.inputMode === INPUT_MODES.KEYBOARD &&
      (this.playerMode === PLAYER_MODES.FFA_2 || isTeamMode(this.playerMode))
    ) {
      // Keyboard: P1+P2 split-key humans; team modes fill remaining as open→CPU
      next[0] = {
        ...next[0],
        human: true,
        joined: true,
        padSlot: 0,
        gamepadIndex: null
      };
      next[1] = {
        ...(next[1] || this._makeSlot(1)),
        human: true,
        joined: true,
        padSlot: 1,
        gamepadIndex: null,
        ready: next[1]?.ready ?? false
      };
      for (let i = 2; i < n; i++) {
        next[i] = {
          ...(next[i] || this._makeSlot(i)),
          human: false,
          joined: false,
          padSlot: null,
          gamepadIndex: null,
          ready: false
        };
      }
    } else {
      // FFA / team pads: P1 joined human; others open until pad joins (CPU at start if empty)
      next[0] = {
        ...next[0],
        human: true,
        joined: true,
        padSlot: 0,
        gamepadIndex: next[0].gamepadIndex ?? null
      };
      for (let i = 1; i < n; i++) {
        const s = next[i];
        if (!s.human || !s.joined) {
          next[i] = {
            ...s,
            human: false,
            joined: false,
            padSlot: null,
            gamepadIndex: null,
            ready: false
          };
        }
      }
    }
    if (isTeamMode(this.playerMode)) {
      this._ensureTeamColors(next);
    } else {
      this._ensureUniqueColors(next);
    }
    for (const s of next) this._ensureSlotCursor(s);
    this.slots = next;
    if (this.activeSlot >= n) this.activeSlot = 0;
  }

  _ensureUniqueColors(slots = this.slots) {
    if (isTeamMode(this.playerMode)) return;
    const used = new Set();
    for (const slot of slots) {
      let id = slot.colorId;
      if (used.has(id)) {
        id = PLAYER_COLOR_IDS.find((c) => !used.has(c)) || id;
        slot.colorId = id;
      }
      used.add(slot.colorId);
    }
  }

  _nextFreeColor(exceptSlot) {
    if (isTeamMode(this.playerMode)) {
      const enemyColor = this._enemyTeamColorId(exceptSlot);
      return PLAYER_COLOR_IDS.find((c) => c && c !== enemyColor) || 'grey';
    }
    const used = new Set(
      this.slots
        .filter((_, i) => i !== exceptSlot)
        .map((s) => s.colorId)
    );
    return PLAYER_COLOR_IDS.find((c) => !used.has(c)) || 'grey';
  }

  onStageChanged(stageId) {
    this.currentStage = stageId;
  }

  onPlayerModeChanged(mode) {
    if (this.inputMode === INPUT_MODES.KEYBOARD && !isKeyboardPlayerMode(mode)) {
      mode = PLAYER_MODES.FFA_2;
    }
    this.playerMode = mode;
    this._initSlots();
    this.refreshCharacterSelect();
  }

  onInputModeChanged(mode) {
    const next = mode === INPUT_MODES.PAD ? INPUT_MODES.PAD : INPUT_MODES.KEYBOARD;
    this.inputMode = next;
    try {
      localStorage.setItem('sushiTown.inputMode', next);
    } catch {
      /* ignore */
    }
    if (next === INPUT_MODES.KEYBOARD && !isKeyboardPlayerMode(this.playerMode)) {
      this.playerMode = PLAYER_MODES.FFA_2;
    }
    // Clear pad claims when switching to keyboard
    if (next === INPUT_MODES.KEYBOARD) {
      for (const slot of this.slots) {
        if (slot) {
          slot.gamepadIndex = null;
          if (!slot.human) slot.padSlot = null;
        }
      }
    } else {
      // Silent reconnect + bind when entering controller mode
      this.inputManager.autoConnectHid().then(() => {
        this._bindHidPadsToSlots();
        this._lastPadStatusKey = '';
        this.refreshCharacterSelect();
      });
    }
    this._initSlots();
    this.refreshCharacterSelect();
  }

  isPadInputMode() {
    return this.inputMode === INPUT_MODES.PAD;
  }

  isKeyboardInputMode() {
    return this.inputMode === INPUT_MODES.KEYBOARD;
  }

  async connectHidControllers() {
    const n = await this.inputManager.connectHidControllers();
    this.inputMode = INPUT_MODES.PAD;
    try {
      localStorage.setItem('sushiTown.inputMode', INPUT_MODES.PAD);
    } catch {
      /* ignore */
    }
    this._bindHidPadsToSlots();
    this._lastPadStatusKey = '';
    this.refreshCharacterSelect();
    return n;
  }

  onAiDifficultyChanged(difficulty) {
    this.aiDifficulty = difficulty;
  }

  onAiTypeChanged(type) {
    this.selectedAiType = type;
    if (isOneVAi(this.playerMode) && this.slots[1]) {
      if (type && type !== 'random') {
        const idx = this.characterConfigs.findIndex((c) => c.type === type);
        if (idx >= 0) this.slots[1].fighterIndex = idx;
      }
      this.refreshCharacterSelect();
    }
  }

  onHazardsChanged(enabled) {
    this.hazardsEnabled = !!enabled;
  }

  onStockCountChanged(count) {
    const n = Math.floor(Number(count));
    this.stockCount = Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
  }

  onSlotUpdated(slotIndex, patch) {
    const slot = this.slots[slotIndex];
    if (!slot) return;
    if (patch.teamId != null && isTeamMode(this.playerMode)) {
      this._applyTeamId(slotIndex, patch.teamId);
      const { teamId: _t, colorId: _c, cursorColorId: _cc, ...rest } = patch;
      Object.assign(slot, rest);
      if (patch.fighterIndex != null) slot.cursorFighterIndex = patch.fighterIndex;
      this._ensureSlotCursor(slot);
      this.refreshCharacterSelect();
      return;
    }
    if (patch.colorId != null && isTeamMode(this.playerMode)) {
      this._applyTeamColor(slotIndex, patch.colorId);
      const { colorId: _c, cursorColorId: _cc, ...rest } = patch;
      Object.assign(slot, rest);
      if (patch.fighterIndex != null) slot.cursorFighterIndex = patch.fighterIndex;
      this._ensureSlotCursor(slot);
      this._ensureTeamColors();
      this.refreshCharacterSelect();
      return;
    }
    if (patch.colorId != null && patch.colorId !== slot.colorId) {
      const taken = this.slots.findIndex(
        (s, i) => i !== slotIndex && s.colorId === patch.colorId
      );
      if (taken >= 0) {
        this.slots[taken].colorId = this._nextFreeColor(taken);
        this._ensureSlotCursor(this.slots[taken]);
        this.slots[taken].cursorColorId = this.slots[taken].colorId;
      }
    }
    Object.assign(slot, patch);
    if (patch.colorId != null) slot.cursorColorId = patch.colorId;
    if (patch.fighterIndex != null) slot.cursorFighterIndex = patch.fighterIndex;
    this._ensureSlotCursor(slot);
    this._ensureUniqueColors();
    this.refreshCharacterSelect();
  }

  onActiveSlotChanged(index) {
    this.activeSlot = index;
    this.refreshCharacterSelect();
  }

  /**
   * Claim next unbound human slot with a physical pad.
   * Prefers empty open slots; also binds pre-joined humans still missing a pad.
   * @param {number} sortedSlot index into getLivePads()
   * @param {number|null} gamepadIndex browser Gamepad.index (preferred ownership key)
   */
  tryJoinPad(sortedSlot, gamepadIndex = null) {
    const pad =
      gamepadIndex != null
        ? this.inputManager.getPadByIndex(gamepadIndex)
        : this.inputManager.getLivePad(sortedSlot);
    const gpIndex = pad?.index ?? gamepadIndex;
    if (gpIndex == null) return false;

    if (this.slots.some((s) => s.gamepadIndex === gpIndex)) return false;

    // 1) Open empty slot (FFA)
    let target = this.slots.findIndex((s, i) => i > 0 && !s.joined);
    // 2) Pre-joined human still missing a pad
    if (target < 0) {
      target = this.slots.findIndex(
        (s, i) => i > 0 && s.human && s.joined && s.gamepadIndex == null
      );
    }
    if (target < 0) return false;

    const colorId = this.slots[target].colorId || this._nextFreeColor(target);
    this.slots[target] = {
      ...this.slots[target],
      human: true,
      joined: true,
      padSlot: sortedSlot,
      gamepadIndex: gpIndex,
      ready: false,
      colorId,
      cursorFocus: 'fighter',
      cursorFighterIndex: this.slots[target].fighterIndex ?? 0,
      cursorColorId: colorId
    };
    this._dedupePadClaims();
    this.activeSlot = target;
    const joinedPad = this.inputManager.getPadByIndex(gpIndex);
    this.inputManager.seedMenuNavHeld?.(joinedPad);
    this.audio.playUiConfirm();
    this.refreshCharacterSelect();
    return true;
  }

  /** Random roster pick when AI fighter is unset or "random". */
  _resolveAiFighterConfig() {
    const pick = this.selectedAiType;
    if (pick && pick !== 'random') {
      const found = this.characterConfigs.find((c) => c.type === pick);
      if (found) return found;
    }
    const roster = this.characterConfigs;
    return roster[Math.floor(Math.random() * roster.length)] || roster[0];
  }

  _colorHex(colorId) {
    return PLAYER_COLORS[colorId] ?? PLAYER_COLORS.red;
  }

  _slotFighterConfig(slot) {
    const idx = slot.fighterIndex ?? 0;
    return this.characterConfigs[idx] || this.characterConfigs[0];
  }

  showCharacterSelect() {
    this.state = GAME_STATES.CHARACTER_SELECT;
    this._initSlots();
    this.inputManager.snapshotPads();
    this.refreshCharacterSelect();
  }

  refreshCharacterSelect() {
    if (this.state !== GAME_STATES.CHARACTER_SELECT) return;
    this.inputManager.pollAndActivate?.();
    const padCount = this.inputManager.getConnectedPadCount();
    const padLines = this.inputManager.getPadStatusLines?.() ?? [];
    this.uiManager.createCharacterSelect({
      characters: this.characterConfigs,
      stages: this.stageCatalog,
      selectedStageId: this.currentStage,
      onStageChange: (id) => this.onStageChanged(id),
      playerMode: this.playerMode,
      onPlayerModeChange: (mode) => this.onPlayerModeChanged(mode),
      inputMode: this.inputMode,
      onInputModeChange: (mode) => this.onInputModeChanged(mode),
      onConnectHid: () => this.connectHidControllers(),
      hidSupported: this.inputManager.hidSupported === true,
      padCount,
      padLines,
      slots: this.slots.map((s, i) => ({
        ...s,
        hasOwnPad: this._slotHasOwnPad(i)
      })),
      activeSlot: this.activeSlot,
      // Pad cursors when any human slot owns a pad (1 pad is enough)
      multiCursors:
        this.inputMode === INPUT_MODES.PAD && this._boundPadSlotCount() >= 1,
      onActiveSlotChange: (i) => this.onActiveSlotChanged(i),
      onSlotUpdate: (i, patch) => this.onSlotUpdated(i, patch),
      onForceStart: () => this.forceStart(),
      aiDifficulty: this.aiDifficulty,
      onAiDifficultyChange: (d) => this.onAiDifficultyChanged(d),
      aiType: this.selectedAiType,
      onAiTypeChange: (t) => this.onAiTypeChanged(t),
      hazardsEnabled: this.hazardsEnabled,
      onHazardsChange: (on) => this.onHazardsChanged(on),
      stockCount: this.stockCount,
      onStockCountChange: (n) => this.onStockCountChanged(n)
    });
  }

  pollCharacterSelectInput() {
    if (this.state !== GAME_STATES.CHARACTER_SELECT) return;

    // Periodic silent HID reopen (handles cold plug after page load)
    const now = performance.now();
    if (!this._nextHidPollAt || now >= this._nextHidPollAt) {
      this._nextHidPollAt = now + 2000;
      const before = this.inputManager.switchHid?.getCount?.() ?? 0;
      this.inputManager.autoConnectHid().then((after) => {
        if (after > before) this._onHidPadsChanged();
      });
    }

    // Always poll so controller count stays live (even in keyboard mode)
    const livePads = this.inputManager.pollAndActivate();
    const padCount = livePads.length;
    const statusLines = this.inputManager.getPadStatusLines?.() ?? [];
    const statusKey = `${this.inputMode}|${padCount}|${statusLines.join(';')}`;
    this._dedupePadClaims();
    const boundBefore = this._boundPadSlotCount();
    // Auto-claim unbound live pads onto open human slots (HID + Gamepad API)
    this._claimUnboundPads(livePads);
    const boundAfter = this._boundPadSlotCount();
    const padCursors =
      this.inputMode === INPUT_MODES.PAD && boundAfter >= 1;
    const claimsChanged = boundAfter !== boundBefore;
    if (statusKey !== this._lastPadStatusKey || claimsChanged) {
      this._lastPadStatusKey = statusKey;
      this.uiManager.updatePadStatus?.(padCount, statusLines, this.inputMode);
      // Rebuild when cursor chrome or pad ownership changes
      if (padCursors !== !!this._lastMultiCursors || claimsChanged) {
        this._lastMultiCursors = padCursors;
        this.refreshCharacterSelect();
        return;
      }
      this._lastMultiCursors = padCursors;
    }

    // Keyboard mode: mouse clicks customize panels
    if (this.inputMode !== INPUT_MODES.PAD) return;

    // Pad join / start — each physical pad claims at most one slot
    for (let sortedSlot = 0; sortedSlot < padCount; sortedSlot++) {
      const pad = livePads[sortedSlot];
      if (!pad) continue;
      if (this.slots.some((s) => s.gamepadIndex === pad.index)) continue;

      const pressed = this.inputManager.menuConfirmPressed(sortedSlot);
      const active =
        this.inputManager.isPadActivated(pad.index) &&
        this.inputManager.padHasRawActivity(pad);
      // HID pads are always "activated"; treat attach as join intent on open slots
      const hidLive = !!pad._hid;
      if (!pressed && !active && !hidLive) continue;

      if (this.slots[0] && this.slots[0].gamepadIndex == null) {
        this.slots[0].gamepadIndex = pad.index;
        this.slots[0].padSlot = sortedSlot;
        this._dedupePadClaims();
        this.inputManager.seedMenuNavHeld?.(pad);
        this.audio.playUiConfirm();
        this.refreshCharacterSelect();
        return;
      } else if (pressed || hidLive) {
        if (this.tryJoinPad(sortedSlot, pad.index)) return;
      }
    }

    this.inputManager.consumeNewlyConnectedSlots();

    const p1PadSorted =
      this.slots[0]?.gamepadIndex != null
        ? livePads.findIndex((p) => p.index === this.slots[0].gamepadIndex)
        : 0;
    if (
      padCount > 0 &&
      (this.inputManager.menuStartPressed(p1PadSorted >= 0 ? p1PadSorted : 0) ||
        this.inputManager.menuStartPressed(0))
    ) {
      this.forceStart();
      return;
    }

    // Each bound pad drives its own slot cursor (1+ pads)
    if (this._boundPadSlotCount() < 1) return;

    let menuDirty = false;
    const padsUsedThisFrame = new Set();
    for (let i = 0; i < this.slots.length; i++) {
      if (!this._slotCanCustomize(i)) continue;
      if (!this._slotHasOwnPad(i)) continue;
      const gpIndex = this.slots[i].gamepadIndex;
      if (padsUsedThisFrame.has(gpIndex)) continue;
      const pad = this.inputManager.getPadByIndex(gpIndex);
      if (!pad) continue;
      padsUsedThisFrame.add(gpIndex);
      const edges = this.inputManager.menuNavEdges(pad);
      if (this._applySlotMenuNav(i, edges)) menuDirty = true;
    }

    if (menuDirty) {
      this.audio.playUiSelect();
      this.refreshCharacterSelect();
    }
  }

  /** Bind activated/HID pads that aren't claimed yet onto open human slots. */
  _claimUnboundPads(livePads) {
    if (this.inputMode !== INPUT_MODES.PAD) return;
    for (let sortedSlot = 0; sortedSlot < livePads.length; sortedSlot++) {
      const pad = livePads[sortedSlot];
      if (!pad) continue;
      if (this.slots.some((s) => s.gamepadIndex === pad.index)) continue;
      // Skip idle Gamepad-API ghosts; HID is always real once attached
      if (!pad._hid && !this.inputManager.isPadActivated(pad.index)) continue;
      if (this.slots[0] && this.slots[0].gamepadIndex == null) {
        this.slots[0].gamepadIndex = pad.index;
        this.slots[0].padSlot = sortedSlot;
        this._dedupePadClaims();
        this.inputManager.seedMenuNavHeld?.(pad);
        continue;
      }
      if (isFfaMode(this.playerMode) || isTeamMode(this.playerMode)) {
        // Second+ pad still needs a confirm press (or HID auto-join)
        if (pad._hid) this.tryJoinPad(sortedSlot, pad.index);
      }
    }
  }

  forceStart() {
    if (this.state !== GAME_STATES.CHARACTER_SELECT) return;
    this.startGame();
  }

  getStageName() {
    if (this.currentStage === STAGE_IDS.RANDOM && this.activeStageId) {
      const active = this.stageCatalog.find((s) => s.id === this.activeStageId);
      return active ? `Random (${active.name})` : 'Random';
    }
    return this.stageCatalog.find((s) => s.id === this.currentStage)?.name || this.currentStage;
  }

  resetPhysicsWorld() {
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this._configureWorld(this.world);
    this.eventQueue = new RAPIER.EventQueue(true);
    this.bodies = [];
    this.platformsByHandle = new Map();
  }

  _configureWorld(world) {
    world.numSolverIterations = 12;
    world.numInternalPgsIterations = 2;
    if (world.integrationParameters) {
      world.integrationParameters.maxCcdSubsteps = 2;
    }
  }

  clearMatchEntities() {
    if (this.characters) {
      for (const char of this.characters) {
        char.dispose();
      }
    }
    this.characters = [];
    this.botControllers = [];
    this.botController = null;
    this.combatSystem = null;
    if (this.hazardSystem) {
      this.hazardSystem.dispose();
      this.hazardSystem = null;
    }

    if (this.stage) {
      this.stage.dispose();
      this.stage = null;
    }

    this.particles?.clear();

    this.resetPhysicsWorld();
  }

  createGround(x, y, z, width, height, depth, { oneWay = false } = {}) {
    // One-way colliders are thickened so fast falls don't tunnel through thin visuals.
    const colliderHeight = oneWay ? Math.max(height, 0.8) : height;
    const top = y + height / 2;
    const bodyY = oneWay ? top - colliderHeight / 2 : y;

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, bodyY, z);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, colliderHeight / 2, depth / 2)
      .setFriction(1.2)
      .setRestitution(0);
    if (oneWay) {
      colliderDesc.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    }
    const collider = this.world.createCollider(colliderDesc, body);

    this.platformsByHandle.set(body.handle, {
      body,
      collider,
      top,
      halfWidth: width / 2,
      isOneWay: oneWay
    });

    return body;
  }

  createDynamicBody(x, y, z, width, height, depth, mass = 1) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.2)
      .setAngularDamping(1.0)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(1.0)
      .setAdditionalSolverIterations(4)
      .enabledTranslations(true, true, false)
      .enabledRotations(false, false, false);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setFriction(0.9)
      .setRestitution(0)
      .setMass(mass)
      .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    this.world.createCollider(colliderDesc, body);
    this.bodies.push(body);
    return body;
  }

  createSphereBody(x, y, z, radius, mass = 1) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.2)
      .setAngularDamping(1.0)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(1.0)
      .setAdditionalSolverIterations(4)
      .enabledTranslations(true, true, false)
      .enabledRotations(false, false, false);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setFriction(0.9)
      .setRestitution(0)
      .setMass(mass)
      .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    this.world.createCollider(colliderDesc, body);
    this.bodies.push(body);
    return body;
  }

  stepPhysics() {
    if (!this.world) return;

    for (const char of this.characters) {
      if (!char.body) continue;
      char._preStepFeetY = char.body.translation().y - char._halfHeight;
    }

    this.world.step(this.eventQueue, this.physicsHooks);
    this._resolveSurfaceContacts();
  }

  /**
   * Keep characters from sinking into ground/platforms by snapping feet to the
   * surface top and killing downward velocity when supported.
   */
  _resolveSurfaceContacts() {
    for (const char of this.characters) {
      if (!char?.body) continue;
      const body = char.body;
      const pos = body.translation();
      const vel = body.linvel();
      if (vel.y > 1.5) continue;

      const halfHeight = char._halfHeight;
      const feetY = pos.y - halfHeight;
      const prevFeetY = char._preStepFeetY ?? feetY;

      let bestTop = null;
      for (const platform of this.platformsByHandle.values()) {
        const platPos = platform.body.translation();
        if (Math.abs(pos.x - platPos.x) > platform.halfWidth + 0.12) continue;

        const top = platform.top;
        if (platform.isOneWay) {
          // Soft: only support when coming from above / already on top.
          const supported =
            (prevFeetY >= top - 0.05 && feetY <= top + 0.15) ||
            (feetY <= top + 0.05 && feetY >= top - 0.35 && vel.y <= 0.5);
          if (!supported) continue;
        } else {
          // Solid ground: any penetration or near-contact from above.
          const supported =
            feetY <= top + 0.12 &&
            feetY >= top - 0.6 &&
            prevFeetY >= top - 0.75;
          if (!supported) continue;
        }

        if (bestTop === null || top > bestTop) bestTop = top;
      }

      if (bestTop === null) continue;

      const targetY = bestTop + halfHeight;
      if (pos.y < targetY - 0.001 || (vel.y < 0 && pos.y <= targetY + 0.08)) {
        body.setTranslation({ x: pos.x, y: targetY, z: 0 }, true);
        body.setLinvel({ x: vel.x, y: 0, z: 0 }, true);
      }
    }
  }

  physicsHooks = {
    filterContactPair: (collider1, collider2, body1, body2) => {
      // Character colliders opt into this hook; null filters out contact entirely.
      // Phase through while dodging or mid command-grab hold/pickup.
      const charA = this._resolveCharacter(body1);
      const charB = this._resolveCharacter(body2);
      if (charA && charB) {
        if (areTeammates(charA, charB)) {
          return RAPIER.SolverFlags.EMPTY;
        }
        const aPhase = charA.isDodging || charA.isGrabbing || charA.isLassoing;
        const bPhase = charB.isDodging || charB.isGrabbing || charB.isLassoing;
        if (aPhase || bPhase) {
          return RAPIER.SolverFlags.EMPTY;
        }
        return RAPIER.SolverFlags.COMPUTE_IMPULSE;
      }

      const platformA = this.platformsByHandle.get(body1);
      const platformB = this.platformsByHandle.get(body2);
      const platform = platformA || platformB;

      // One-way soft platforms: pass from below / while rising; solid from above.
      if (platform?.isOneWay) {
        const charHandle = platformA ? body2 : body1;
        const char = this._resolveCharacter(charHandle);
        if (!char || !char.body) return RAPIER.SolverFlags.COMPUTE_IMPULSE;

        const platformTop = platform.top;
        const charPos = char.body.translation();
        const charVy = char.body.linvel().y;
        const prevFeetY = char._preStepFeetY ?? (charPos.y - char._halfHeight);

        if (charVy > 0) {
          return RAPIER.SolverFlags.EMPTY;
        }

        if (prevFeetY >= platformTop - 0.1) {
          return RAPIER.SolverFlags.COMPUTE_IMPULSE;
        }

        return RAPIER.SolverFlags.EMPTY;
      }

      // Ground / solid platforms / anything else: normal collision.
      return RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: () => true
  };

  _resolveCharacter(bodyHandle) {
    if (!this.characters) return null;
    for (const char of this.characters) {
      if (char.body && char.body.handle === bodyHandle) return char;
    }
    return null;
  }

  startGame() {
    this.clearMatchEntities();

    this.uiManager.clearScreen();
    this.audio.playFightMusic();
    this.audio.playUiConfirm();

    this.activeStageId = resolveStageId(this.currentStage);
    this.stage = new Stage(this.scene, this, this.activeStageId);
    this.applyStageLighting(this.stage.theme);
    this.frameCameraToStage();

    const n = getMatchPlayerCount(this.playerMode);
    if (isTeamMode(this.playerMode)) {
      this._ensureTeamColors();
    } else {
      this._ensureUniqueColors();
    }
    this.botControllers = [];

    for (let i = 0; i < n; i++) {
      const slot = this.slots[i] || this._makeSlot(i);
      const isHuman = slot.human && slot.joined;
      let config;
      if (!isHuman && isOneVAi(this.playerMode) && i === 1) {
        config = this._resolveAiFighterConfig();
      } else if (!isHuman) {
        config = this._resolveAiFighterConfig();
      } else {
        config = this._slotFighterConfig(slot);
      }
      const color = this._colorHex(slot.colorId);
      const spawn = this.stage.spawnPoints[i] || this.stage.spawnPoints[0];
      const char = new Character(this.scene, this, spawn, config.type, i + 1, color);
      if (!isHuman) {
        char.isBot = true;
      }
      this.characters.push(char);
    }

    for (let i = 0; i < this.characters.length; i++) {
      const char = this.characters[i];
      if (char.isBot) {
        const bot = new BotController(char, this.characters, this.aiDifficulty, this);
        this.botControllers.push(bot);
      }
    }
    this.botController = this.botControllers[0] || null;

    this.combatSystem = new CombatSystem(this.scene, this, this.characters);

    if (this.hazardsEnabled) {
      this.hazardSystem = new HazardSystem(this.scene, this, this.activeStageId);
    } else {
      this.hazardSystem = null;
    }

    this.inputManager.resetEdgeState();
    this.inputManager.pollAndActivate();

    if (this.inputMode === INPUT_MODES.PAD) {
      const livePads = this.inputManager.getLivePads();
      const activated = this.inputManager.getActivatedPads();
      const pool = activated.length > 0 ? activated : livePads;

      const claimed = new Set();
      for (const s of this.slots) {
        if (s.human && s.joined && s.gamepadIndex != null) {
          if (livePads.some((p) => p.index === s.gamepadIndex)) {
            claimed.add(s.gamepadIndex);
          } else {
            s.gamepadIndex = null;
          }
        }
      }
      let freeCursor = 0;
      const nextFreePad = () => {
        while (freeCursor < pool.length) {
          const pad = pool[freeCursor++];
          if (!claimed.has(pad.index)) {
            claimed.add(pad.index);
            return pad;
          }
        }
        for (const pad of livePads) {
          if (!claimed.has(pad.index)) {
            claimed.add(pad.index);
            return pad;
          }
        }
        return null;
      };

      for (let i = 0; i < this.characters.length; i++) {
        const char = this.characters[i];
        if (char.isBot) {
          char.gamepadIndex = null;
          char.padSlot = null;
          continue;
        }
        const slot = this.slots[i];
        let pad = null;
        if (slot?.gamepadIndex != null) {
          pad = this.inputManager.getPadByIndex(slot.gamepadIndex);
        }
        if (!pad) pad = nextFreePad();
        else claimed.add(pad.index);
        char.gamepadIndex = pad ? pad.index : null;
        char.padSlot = pad
          ? livePads.findIndex((p) => p.index === pad.index)
          : null;
        if (slot) {
          slot.padSlot = char.padSlot;
          slot.gamepadIndex = char.gamepadIndex;
        }
      }
    } else {
      for (const char of this.characters) {
        char.gamepadIndex = null;
        char.padSlot = null;
      }
      for (const slot of this.slots) {
        if (slot) {
          slot.gamepadIndex = null;
          slot.padSlot = null;
        }
      }
    }

    const labels = this.characters.map((c, i) => {
      if (c.isBot) return `CPU ${i + 1}`;
      return `PLAYER ${i + 1}`;
    });
    this.uiManager.createHUD(this.stockCount, labels);
    this.uiManager.createControlsHelp(
      isFfaMode(this.playerMode) || isTeamMode(this.playerMode),
      this.inputMode
    );
    if (this.inputMode === INPUT_MODES.PAD) {
      this.uiManager.createPadDebug?.();
    }
    this.state = GAME_STATES.FIGHT;
  }

  _inputForSlot(slotIndex) {
    const char = this.characters[slotIndex];
    if (!char || char.isBot) {
      const bot = this.botControllers.find((b) => b.player === char);
      if (bot) {
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
          grab: false,
          ...bot.getInput()
        };
      }
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

    // Explicit input mode — never mix keyboard + pad in a match
    if (this.inputMode === INPUT_MODES.KEYBOARD) {
      if (slotIndex === 0) {
        return this.inputManager.getKeyboardState(
          PLAYER_CONTROLS.PLAYER1,
          'PLAYER1'
        );
      }
      if (
        slotIndex === 1 &&
        this.slots[1]?.human &&
        (this.playerMode === PLAYER_MODES.FFA_2 || isTeamMode(this.playerMode))
      ) {
        return this.inputManager.getKeyboardState(
          PLAYER_CONTROLS.PLAYER2,
          'PLAYER2'
        );
      }
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

    // Pad mode
    let pad =
      char.gamepadIndex != null
        ? this.inputManager.getPadByIndex(char.gamepadIndex)
        : null;

    if (!pad) {
      const used = new Set(
        this.characters
          .filter((c, i) => i !== slotIndex && !c.isBot && c.gamepadIndex != null)
          .map((c) => c.gamepadIndex)
      );
      const free = this.inputManager
        .getActivatedPads()
        .find((p) => !used.has(p.index));
      if (free) {
        char.gamepadIndex = free.index;
        pad = free;
      }
    }

    if (pad) return this.inputManager.readPadState(pad);

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

  _updatePadDebug() {
    const el = this.uiManager?.hudElements?.padDebug;
    if (!el) return;
    const lines = [];
    const snaps = this.inputManager.debugPadSnapshot?.() || [];
    if (snaps.length === 0) {
      lines.push('PAD DEBUG: none from browser — click page, press buttons');
    } else {
      for (const s of snaps) {
        lines.push(
          `#${s.index} ${s.id} map=${s.mapping} act=${s.activated ? 'Y' : 'n'} → ${s.move}`
        );
        lines.push(`  axes[${s.axes.join(',')}] btn[${s.pressed.join(' ') || '-'}]`);
      }
    }
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      if (c.isBot) continue;
      lines.push(`P${i + 1} bound=#${c.gamepadIndex ?? '∅'}`);
    }
    el.textContent = lines.join('\n');
  }

  update(deltaTime) {
    this.inputManager.beginFrame?.();

    if (this.state === GAME_STATES.CHARACTER_SELECT) {
      this.pollCharacterSelectInput();
      this.inputManager.endFrame?.();
      this.inputManager.clearFrame();
      return;
    }

    if (this.state !== GAME_STATES.FIGHT) {
      this.inputManager.endFrame?.();
      return;
    }

    // Snapshot all human inputs first so edge state is stable per frame
    const inputs = [];
    for (let i = 0; i < this.characters.length; i++) {
      inputs[i] = this._inputForSlot(i);
    }
    this._updatePadDebug();
    this.inputManager.endFrame?.();

    for (let i = 0; i < this.characters.length; i++) {
      this.characters[i].update(deltaTime, inputs[i]);
    }

    this.stage?.update?.(deltaTime, this.characters);

    this.stepPhysics();

    for (const char of this.characters) {
      char.syncMeshPosition(0);
      char.updateGrounded();
    }

    this.combatSystem.update(deltaTime);
    this.hazardSystem?.update(deltaTime, this.characters);
    this.particles?.update(deltaTime);
    this.postFX?.update(deltaTime);

    const hits = this.combatSystem.checkAllCollisions();
    for (const { attacker, defender, hit } of hits) {
      this.combatSystem.applyHit(attacker, defender, hit);
    }

    for (let i = 0; i < this.characters.length; i++) {
      const char = this.characters[i];
      if (!char.isDead && this.combatSystem.checkBlastZones(char)) {
        this.handleKO(char, i);
      }
    }

    for (let i = 0; i < this.characters.length; i++) {
      this.uiManager.updateDamage(
        i + 1,
        this.characters[i].damage,
        this.characters[i].damageColor
      );
      this.uiManager.updateStocks(i + 1, this.characters[i].stocks);
    }

    this.updateCameraShake(deltaTime);
    this.inputManager.clearFrame();
  }

  addCameraShake(intensity) {
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
    this._shakeTime = Math.max(this._shakeTime, 0.18 + intensity * 0.12);
  }

  updateCameraShake(deltaTime) {
    if (this._shakeTime <= 0 && this._shakeIntensity <= 0) {
      this.camera.position.copy(this._camBasePos);
      this.camera.lookAt(this._camLookAt);
      return;
    }

    this._shakeTime = Math.max(0, this._shakeTime - deltaTime);
    this._shakeIntensity *= Math.pow(0.04, deltaTime); // exponential decay
    if (this._shakeTime <= 0) this._shakeIntensity = 0;

    const mag = this._shakeIntensity;
    const ox = (Math.random() - 0.5) * 2 * mag * 0.55;
    const oy = (Math.random() - 0.5) * 2 * mag * 0.4;
    this.camera.position.set(
      this._camBasePos.x + ox,
      this._camBasePos.y + oy,
      this._camBasePos.z
    );
    this.camera.lookAt(
      this._camLookAt.x + ox * 0.3,
      this._camLookAt.y + oy * 0.3,
      this._camLookAt.z
    );
  }

  handleKO(character, index) {
    this.audio.playKo();
    this.particles?.spawnConfetti?.(
      character.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
      character.teamColor
    );
    this.postFX?.punchBloom?.(0.7);
    this.addCameraShake(0.45);
    const spawnPoint = this.stage.spawnPoints[index] || this.stage.spawnPoints[0];
    character.respawn(spawnPoint);
    this.uiManager.showMessage('KO!', 1000);

    if (character.stocks <= 0) {
      this.checkMatchEnd();
    }
  }

  checkMatchEnd() {
    const alive = [];
    for (let i = 0; i < this.characters.length; i++) {
      if (this.characters[i].stocks > 0) alive.push(i);
    }
    if (alive.length === 0) {
      this.endMatch(0);
      return;
    }
    if (alive.length === 1) {
      this.endMatch(alive[0]);
      return;
    }
    // Last team standing: all alive share teamColor
    const firstColor = this.characters[alive[0]].teamColor;
    if (
      firstColor != null &&
      alive.every((i) => this.characters[i].teamColor === firstColor)
    ) {
      this.endMatch(alive[0], alive);
    }
  }

  endMatch(winnerSlotIndex, winningAliveIndices = null) {
    this.state = GAME_STATES.VICTORY;
    this.addCameraShake(0.85);
    this.postFX?.punchBloom?.(0.9);
    this.audio.playVictory();
    this.audio.playVictoryMusic();

    const winnerChar = this.characters[winnerSlotIndex];
    const aliveWinners =
      winningAliveIndices ||
      (winnerChar?.stocks > 0 ? [winnerSlotIndex] : []);

    let winner;
    if (isTeamMode(this.playerMode) && aliveWinners.length > 0) {
      const colorId =
        this.slots[winnerSlotIndex]?.colorId ||
        Object.keys(PLAYER_COLORS).find(
          (k) => PLAYER_COLORS[k] === winnerChar?.teamColor
        ) ||
        'team';
      const names = aliveWinners.map((i) => {
        const c = this.characters[i];
        return c?.isBot ? `CPU ${i + 1}` : `P${i + 1}`;
      });
      winner =
        aliveWinners.length > 1
          ? `TEAM ${String(colorId).toUpperCase()} (${names.join(' + ')})`
          : names[0];
    } else {
      winner = winnerChar?.isBot
        ? `CPU ${winnerSlotIndex + 1}`
        : `PLAYER ${winnerSlotIndex + 1}`;
    }

    const stats = this.characters.map((c, i) => {
      const label = c.isBot ? `CPU ${i + 1}` : `Player ${i + 1}`;
      return `${label}: ${Math.floor(c.damage)}% · ${Math.max(0, c.stocks)} stocks`;
    });

    for (const i of aliveWinners) {
      const c = this.characters[i];
      if (!c || c.stocks <= 0) continue;
      c.startVictoryPose();
      this.particles?.spawnConfetti?.(
        c.position.clone().add(new THREE.Vector3(0, 1, 0)),
        c.teamColor
      );
    }

    this.uiManager.createVictoryScreen(
      winner,
      stats,
      () => this.startGame(),
      () => this.returnToSelect()
    );
  }

  returnToSelect() {
    this.clearMatchEntities();
    this.uiManager.clearScreen();
    this.audio.playMenuMusic();
    this.showCharacterSelect();
  }

  /**
   * Frame camera so horizontal view just clears the furthest ground/platform edge
   * (small margin past max |x| + half-width of platforms).
   */
  frameCameraToStage() {
    if (!this.stage?.platforms?.length) {
      this._camBasePos.set(0, 5.5, 18);
      this._camLookAt.set(0, 2.8, 0);
      this.camera.position.copy(this._camBasePos);
      this.camera.lookAt(this._camLookAt);
      return;
    }

    let maxHalfExtent = 10;
    let maxTop = 1;
    for (const p of this.stage.platforms) {
      const mesh = p.mesh;
      const halfW = (p.bounds?.width ?? 4) / 2;
      const halfH = (p.bounds?.height ?? 1) / 2;
      maxHalfExtent = Math.max(maxHalfExtent, Math.abs(mesh.position.x) + halfW);
      maxTop = Math.max(maxTop, mesh.position.y + halfH);
    }

    // Slightly past furthest edge so platforms aren’t flush with the frame.
    const halfWidth = maxHalfExtent + 1.2;
    const lookY = Math.min(Math.max(maxTop * 0.45, 2.2), 3.6);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const aspect = Math.max(this.camera.aspect, 0.5);
    // Distance so horizontal FOV covers ±halfWidth at look target depth.
    const dist = (halfWidth / Math.tan(fovRad / 2) / aspect) * 1.05;
    const camZ = Math.min(Math.max(dist, 14), 24);
    const camY = lookY + 2.4;

    this._camBasePos.set(0, camY, camZ);
    this._camLookAt.set(0, lookY, 0);
    this._shakeIntensity = 0;
    this._shakeTime = 0;
    this.camera.position.copy(this._camBasePos);
    this.camera.lookAt(this._camLookAt);
    this.camera.near = 0.1;
    this.camera.far = 120;
    this.camera.updateProjectionMatrix();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h);
    this.postFX?.setSize(w, h);
    if (this.stage) this.frameCameraToStage();
  }

  render() {
    // Keep victory pose animating while on victory screen
    if (this.state === GAME_STATES.VICTORY && this.characters?.length) {
      const dt = 1 / 60;
      for (const char of this.characters) {
        if (char.victoryPose) {
          char.updateVictoryPose(dt);
          char.syncMeshPosition(dt);
        }
      }
      this.particles?.update(dt);
      this.postFX?.update(dt);
      this.updateCameraShake(dt);
    }
    if (this.postFX) {
      this.postFX.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}