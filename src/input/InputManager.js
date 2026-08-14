import { SwitchProHidManager } from './SwitchProHid.js';

/** Standard Gamepad button indices (Xbox / W3C mapping). */
const GP = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15
};

const STICK_DEADZONE = 0.2;
const TRIGGER_THRESHOLD = 0.5;

const EMPTY_INPUT = () => ({
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  jumpHeld: false,
  attack: false,
  attackHeld: false,
  dodge: false,
  special: false,
  shield: false,
  grab: false
});

export class InputManager {
  constructor() {
    this.keys = new Map();
    this.prevButtonDown = new Map();
    this.players = {
      PLAYER1: {},
      PLAYER2: {}
    };
    this._prevPadIndices = new Set();
    this._pendingButtons = new Map();
    /** Menu stick/dpad held state for edge detection: padIndex → {l,r,u,d}. */
    this._menuNavHeld = new Map();
    /** @type {Map<number, { index: number, id: string, mapping: string, lastActive: number }>} */
    this._padMeta = new Map();
    /** Pads the user has actually touched (button/stick). */
    this._activatedPads = new Set();
    /** WebHID path for Switch Pro Controllers (USB often missing from Gamepad API). */
    this.switchHid = new SwitchProHidManager();

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('gamepadconnected', (e) => {
      const gp = e.gamepad;
      if (gp) {
        this._touchMeta(gp);
        this.getLivePads();
      }
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      const idx = e.gamepad?.index;
      if (idx != null) {
        this._padMeta.delete(idx);
        this._activatedPads.delete(idx);
      }
      const prefix = `${idx}:`;
      for (const key of [...this.prevButtonDown.keys()]) {
        if (key.startsWith(prefix)) this.prevButtonDown.delete(key);
      }
    });

    const warm = () => this.pollAndActivate();
    window.addEventListener('pointerdown', warm, { passive: true });
    window.addEventListener('keydown', warm, { passive: true });
  }

  get hidSupported() {
    return this.switchHid?.supported === true;
  }

  /** Sync activated meta from current HID pads. */
  _syncHidMeta() {
    if (!this.switchHid) return;
    for (const vp of this.switchHid.getVirtualPads()) {
      this._activatedPads.add(vp.index);
      this._touchMeta({
        index: vp.index,
        id: vp.id,
        mapping: vp.mapping
      });
    }
  }

  /**
   * Silent reconnect of already-permitted Switch Pros (no popup).
   * Safe to call on boot and whenever devices may have been replugged.
   */
  async autoConnectHid() {
    if (!this.switchHid?.supported) return 0;
    await this.switchHid.reopenGranted();
    this._syncHidMeta();
    return this.switchHid.getCount();
  }

  /** First-time only: user gesture opens HID picker. */
  async connectHidControllers() {
    if (!this.switchHid?.supported) {
      throw new Error('WebHID not available — use Chrome/Edge');
    }
    await this.switchHid.requestAndAttach();
    this._syncHidMeta();
    return this.getConnectedPadCount();
  }

  /** Subscribe to HID attach/detach. */
  onHidChange(fn) {
    return this.switchHid?.onChange?.(fn) ?? (() => {});
  }

  async getHidGrantedCount() {
    return (await this.switchHid?.grantedCount?.()) ?? 0;
  }

  onKeyDown(e) {
    this.keys.set(e.code, true);
  }

  onKeyUp(e) {
    this.keys.set(e.code, false);
  }

  _touchMeta(pad) {
    if (!pad) return;
    const prev = this._padMeta.get(pad.index);
    this._padMeta.set(pad.index, {
      index: pad.index,
      id: pad.id || prev?.id || 'Gamepad',
      mapping: pad.mapping || prev?.mapping || '',
      lastActive: prev?.lastActive || 0
    });
  }

  pollGamepads() {
    try {
      const list = navigator.getGamepads?.();
      if (!list) return [];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        out[i] = list[i] || null;
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Poll + mark pads with stick/button activity as activated.
   * Call every frame.
   */
  pollAndActivate() {
    const live = this.getLivePads();
    const now = performance.now();
    for (const pad of live) {
      this._touchMeta(pad);
      if (this._rawActivity(pad)) {
        this._activatedPads.add(pad.index);
        const meta = this._padMeta.get(pad.index);
        if (meta) meta.lastActive = now;
      }
    }
    return live;
  }

  /** Raw activity without updating edge state. */
  _rawActivity(pad) {
    if (!pad) return false;
    // WebHID virtual pads have empty buttons/axes — read decoded state
    if (pad._hid) {
      const s = pad._hidPad?.state;
      if (!s) return true; // attached HID counts as live
      return !!(
        s.left ||
        s.right ||
        s.up ||
        s.down ||
        s.jumpHeld ||
        s.attackHeld ||
        s.dodge ||
        s.special ||
        s.shield ||
        s.grab ||
        s.jump ||
        s.attack
      );
    }
    if (pad.buttons) {
      for (let i = 0; i < pad.buttons.length; i++) {
        const b = pad.buttons[i];
        if (!b) continue;
        if (typeof b === 'object') {
          if (b.pressed || (typeof b.value === 'number' && b.value > 0.35)) return true;
        } else if (b) return true;
      }
    }
    if (pad.axes) {
      for (let i = 0; i < pad.axes.length; i++) {
        const a = pad.axes[i];
        if (typeof a === 'number' && Math.abs(a) >= STICK_DEADZONE) return true;
      }
    }
    return false;
  }

  /** Fresh connected pads (Gamepad API + WebHID Switch Pros). */
  getLivePads() {
    const pads = this.pollGamepads();
    const connected = [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      if (pad.connected === false) continue;
      connected.push(pad);
      this._touchMeta(pad);
    }
    if (this.switchHid) {
      for (const vp of this.switchHid.getVirtualPads()) {
        connected.push(vp);
        this._activatedPads.add(vp.index);
        this._touchMeta({
          index: vp.index,
          id: vp.id,
          mapping: vp.mapping
        });
      }
    }
    connected.sort((a, b) => a.index - b.index);
    return connected;
  }

  /** Only pads the player has pressed/moved (ignores idle ghost devices). */
  getActivatedPads() {
    const live = this.getLivePads();
    return live.filter(
      (p) => this._activatedPads.has(p.index) || p._hid === true
    );
  }

  getConnectedPadCount() {
    return this.getLivePads().length;
  }

  getActivatedPadCount() {
    return this.getActivatedPads().length;
  }

  isPadActivated(gamepadIndex) {
    return gamepadIndex != null && this._activatedPads.has(gamepadIndex);
  }

  getPadStatusLines() {
    const live = this.getLivePads();
    if (live.length === 0) {
      if (this._padMeta.size > 0) {
        return [...this._padMeta.values()].map(
          (m) => `${this._shortPadName(m.id)} (#${m.index}) — press a button`
        );
      }
      return [];
    }
    return live.map((p) => {
      if (p._hid) return `✓ ${this._shortPadName(p.id)} (#${p.index} HID)`;
      const on = this._activatedPads.has(p.index) ? '✓' : '…';
      return `${on} ${this._shortPadName(p.id)} (#${p.index})`;
    });
  }

  _shortPadName(id = '') {
    const s = String(id || 'Gamepad');
    const m = s.match(
      /(Xbox|DualShock|DualSense|Wireless Controller|Pro Controller|Switch|Stadia|8BitDo|Generic)[^()]*/i
    );
    const name = (m ? m[0] : s.split('(')[0]).trim();
    return name.length > 28 ? `${name.slice(0, 26)}…` : name || 'Gamepad';
  }

  getLivePad(slot) {
    return this.getLivePads()[slot] ?? null;
  }

  getPadByIndex(gamepadIndex) {
    if (gamepadIndex == null || gamepadIndex < 0) return null;
    // WebHID virtual pads first
    if (this.switchHid) {
      for (const vp of this.switchHid.getVirtualPads()) {
        if (vp.index === gamepadIndex) return vp;
      }
    }
    const pads = this.pollGamepads();
    if (gamepadIndex < pads.length) {
      const pad = pads[gamepadIndex];
      if (pad && pad.connected !== false && pad.index === gamepadIndex) return pad;
    }
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad && pad.index === gamepadIndex && pad.connected !== false) return pad;
    }
    return null;
  }

  consumeNewlyConnectedSlots() {
    const live = this.getLivePads();
    const current = new Set(live.map((p) => p.index));
    const newly = [];
    for (let i = 0; i < live.length; i++) {
      const idx = live[i].index;
      if (!this._prevPadIndices.has(idx)) newly.push(i);
    }
    this._prevPadIndices = current;
    return newly;
  }

  snapshotPads() {
    this._prevPadIndices = new Set(this.getLivePads().map((p) => p.index));
  }

  resetEdgeState() {
    this.prevButtonDown.clear();
    this._pendingButtons.clear();
  }

  buttonHeld(pad, index) {
    if (!pad?.buttons) return false;
    const btn = pad.buttons[index];
    if (btn == null) return false;
    if (typeof btn === 'object') {
      return !!(
        btn.pressed ||
        (typeof btn.value === 'number' && btn.value > TRIGGER_THRESHOLD)
      );
    }
    return !!btn;
  }

  buttonPressed(pad, index) {
    if (!pad) return false;
    const held = this.buttonHeld(pad, index);
    const key = `${pad.index}:${index}`;
    this._pendingButtons.set(key, held);
    const wasHeld = this.prevButtonDown.get(key) === true;
    return held && !wasHeld;
  }

  anyButtonPressed(pad) {
    if (!pad) return false;
    if (pad._hid) {
      const s = pad._hidPad?.state;
      if (!s) return false;
      const key = `${pad.index}:hidAny`;
      const held = !!(
        s.jumpHeld ||
        s.attackHeld ||
        s.shield ||
        s.jump ||
        s.attack ||
        s.dodge ||
        s.special ||
        s.grab
      );
      this._pendingButtons.set(key, held);
      const wasHeld = this.prevButtonDown.get(key) === true;
      return held && !wasHeld;
    }
    if (!pad.buttons) return false;
    const n = pad.buttons.length;
    for (let i = 0; i < n; i++) {
      if (this.buttonPressed(pad, i)) return true;
    }
    return false;
  }

  beginFrame() {
    this._pendingButtons.clear();
    this.pollAndActivate();
  }

  endFrame() {
    for (const [key, held] of this._pendingButtons) {
      this.prevButtonDown.set(key, held);
    }
    this._pendingButtons.clear();
  }

  stickAxis(pad, axisIndex) {
    if (!pad?.axes) return 0;
    const v = pad.axes[axisIndex] ?? 0;
    if (typeof v !== 'number' || Number.isNaN(v)) return 0;
    return Math.abs(v) >= STICK_DEADZONE ? v : 0;
  }

  /**
   * Horizontal move: left stick X (0), optional right-stick X only if left is dead
   * and mapping is non-standard. Never uses odd axes (those are usually Y).
   */
  readMoveX(pad) {
    if (!pad?.axes?.length) return 0;

    const x0 = this.stickAxis(pad, 0);
    if (x0 !== 0) return x0;

    // Some drivers put left stick on axes 2 (rare) or only expose d-pad
    const x2 = this.stickAxis(pad, 2);
    // Only use axis 2 if it looks like a stick (not a trigger resting at -1/+1)
    const raw2 = pad.axes[2];
    if (
      typeof raw2 === 'number' &&
      raw2 > -0.9 &&
      raw2 < 0.9 &&
      Math.abs(raw2) >= STICK_DEADZONE
    ) {
      return raw2;
    }

    // Explicit axis-6 hat X on some pads
    const raw6 = pad.axes[6];
    if (typeof raw6 === 'number' && Math.abs(raw6) >= 0.5 && Math.abs(raw6) <= 1.01) {
      return raw6;
    }

    return x2 !== 0 && Math.abs(pad.axes[2] ?? 0) < 0.95 ? x2 : 0;
  }

  /** Public: stick/button activity without consuming edge state. */
  padHasRawActivity(pad) {
    return this._rawActivity(pad);
  }

  readDpad(pad) {
    let left = this.buttonHeld(pad, GP.DPAD_LEFT);
    let right = this.buttonHeld(pad, GP.DPAD_RIGHT);
    let up = this.buttonHeld(pad, GP.DPAD_UP);
    let down = this.buttonHeld(pad, GP.DPAD_DOWN);

    // Hat / extra d-pad axes (never treat stick axes 0-1 as hat)
    for (const ai of [6, 7, 9]) {
      const a = pad.axes?.[ai];
      if (typeof a !== 'number' || Number.isNaN(a)) continue;
      if (ai === 6 || ai === 9) {
        if (a < -0.5) left = true;
        if (a > 0.5) right = true;
      }
      if (ai === 7) {
        if (a < -0.5) up = true;
        if (a > 0.5) down = true;
      }
    }

    return { left, right, up, down };
  }

  readTriggers(pad) {
    // Buttons only — stick/hat axes must never become shield.
    const lt = this.buttonHeld(pad, GP.LT);
    const rt = this.buttonHeld(pad, GP.RT);
    return { lt, rt };
  }

  /**
   * Face buttons by position (bottom/right/left/top = GP A/B/X/Y).
   * Xbox labels: A jump, B grab, X attack, Y dodge.
   * Switch physical: B jump, A grab, Y attack, X dodge (same positions).
   */
  readFace(pad) {
    const jumpHeld = this.buttonHeld(pad, GP.A);
    const jump = this.buttonPressed(pad, GP.A);
    const attackHeld = this.buttonHeld(pad, GP.X);
    const attack = this.buttonPressed(pad, GP.X);
    const dodge = this.buttonPressed(pad, GP.Y);
    const special =
      this.buttonPressed(pad, GP.RB) || this.buttonPressed(pad, GP.LB);
    const grab =
      this.buttonPressed(pad, GP.B) || this.buttonPressed(pad, GP.LB);

    return { jump, jumpHeld, attack, attackHeld, dodge, special, grab };
  }

  readMoveY(pad) {
    if (!pad?.axes?.length) return 0;
    const y1 = this.stickAxis(pad, 1);
    if (y1 !== 0) return y1;
    const y3 = this.stickAxis(pad, 3);
    return y3;
  }

  readPadState(pad) {
    if (!pad) return EMPTY_INPUT();

    // WebHID Switch Pro — state already decoded
    if (pad._hid && pad._hidPad) {
      return pad._hidPad.getInputState();
    }
    if (pad._hid && this.switchHid) {
      const s = this.switchHid.getStateByIndex(pad.index);
      if (s) return s;
    }

    const moveX = this.readMoveX(pad);
    const moveY = this.readMoveY(pad);
    const dpad = this.readDpad(pad);
    const left = moveX < -0.01 || dpad.left;
    const right = moveX > 0.01 || dpad.right;
    const up = moveY < -0.01 || dpad.up;
    const down = moveY > 0.01 || dpad.down;

    const face = this.readFace(pad);
    const { lt, rt } = this.readTriggers(pad);
    // Prefer RT for shield; LT alone only if clearly a trigger button
    const shield = rt || lt;

    return {
      left,
      right,
      up,
      down,
      jump: face.jump,
      jumpHeld: face.jumpHeld,
      attack: face.attack,
      attackHeld: face.attackHeld,
      dodge: face.dodge,
      special: face.special,
      shield,
      grab: face.grab
    };
  }

  /** Peek pad state without consuming HID one-shot edges when possible. */
  _menuPadHeld(pad) {
    if (!pad) return null;
    if (pad._hid && pad._hidPad?.state) {
      const s = pad._hidPad.state;
      return {
        left: !!s.left,
        right: !!s.right,
        up: !!s.up,
        down: !!s.down,
        confirm: !!(s.jumpHeld || s.attackHeld || s.jump || s.attack)
      };
    }
    const state = this.readPadState(pad);
    return {
      left: !!state.left,
      right: !!state.right,
      up: !!state.up,
      down: !!state.down,
      confirm: !!(
        state.jumpHeld ||
        state.attackHeld ||
        state.jump ||
        state.attack ||
        this.buttonHeld(pad, GP.A) ||
        this.buttonHeld(pad, GP.X)
      )
    };
  }

  /** Seed held edges so join/confirm presses don't double-fire as menu nav. */
  seedMenuNavHeld(pad) {
    if (!pad) return;
    const held = this._menuPadHeld(pad);
    if (held) this._menuNavHeld.set(`pad:${pad.index}`, held);
  }

  /**
   * Just-pressed menu navigation edges for a pad (stick + d-pad).
   * @returns {{ left: boolean, right: boolean, up: boolean, down: boolean, confirm: boolean }}
   */
  menuNavEdges(pad) {
    const empty = { left: false, right: false, up: false, down: false, confirm: false };
    if (!pad) return empty;
    const held = this._menuPadHeld(pad);
    if (!held) return empty;
    const key = `pad:${pad.index}`;
    const prev = this._menuNavHeld.get(key) || {
      left: false,
      right: false,
      up: false,
      down: false,
      confirm: false
    };
    this._menuNavHeld.set(key, held);
    return {
      left: held.left && !prev.left,
      right: held.right && !prev.right,
      up: held.up && !prev.up,
      down: held.down && !prev.down,
      confirm: held.confirm && !prev.confirm
    };
  }

  /** Keyboard menu edges for a player control map. */
  menuNavEdgesKeyboard(controls, edgeKey) {
    const empty = { left: false, right: false, up: false, down: false, confirm: false };
    if (!controls) return empty;
    const held = {
      left: this.isKeyHeld(controls.LEFT),
      right: this.isKeyHeld(controls.RIGHT),
      up: this.isKeyHeld(controls.JUMP),
      down: this.isKeyHeld(controls.SHIELD),
      confirm: this.isKeyHeld(controls.ATTACK)
    };
    const prev = this._menuNavHeld.get(edgeKey) || {
      left: false,
      right: false,
      up: false,
      down: false,
      confirm: false
    };
    this._menuNavHeld.set(edgeKey, held);
    return {
      left: held.left && !prev.left,
      right: held.right && !prev.right,
      up: held.up && !prev.up,
      down: held.down && !prev.down,
      confirm: held.confirm && !prev.confirm
    };
  }

  /** Debug snapshot for HUD. */
  debugPadSnapshot(gamepadIndex = null) {
    const pads = gamepadIndex != null
      ? [this.getPadByIndex(gamepadIndex)].filter(Boolean)
      : this.getLivePads();
    return pads.map((p) => {
      if (p._hid && p._hidPad) {
        const held = p._hidPad.peekState?.() ?? p._hidPad.state;
        return {
          index: p.index,
          id: this._shortPadName(p.id),
          mapping: 'webhid',
          activated: true,
          axes: [],
          pressed: [],
          move:
            `${held.left ? 'L' : ''}${held.right ? 'R' : ''}${held.jumpHeld || held.jump ? 'J' : ''}${held.attackHeld || held.attack ? 'A' : ''}${held.shield ? 'S' : ''}` ||
            '-'
        };
      }
      const axes = (p.axes || []).map((a) =>
        typeof a === 'number' ? Number(a.toFixed(2)) : a
      );
      const pressed = [];
      if (p.buttons) {
        for (let i = 0; i < p.buttons.length; i++) {
          const b = p.buttons[i];
          if (b && (b.pressed || b.value > 0.2)) {
            pressed.push(`${i}:${typeof b.value === 'number' ? b.value.toFixed(1) : 1}`);
          }
        }
      }
      const state = this.readPadState(p);
      return {
        index: p.index,
        id: this._shortPadName(p.id),
        mapping: p.mapping || '(none)',
        activated: this._activatedPads.has(p.index),
        axes,
        pressed,
        move: `${state.left ? 'L' : ''}${state.right ? 'R' : ''}${state.jumpHeld ? 'J' : ''}${state.attackHeld ? 'A' : ''}${state.shield ? 'S' : ''}` || '-'
      };
    });
  }

  getGamepadState(slot) {
    return this.readPadState(this.getLivePad(slot));
  }

  getGamepadStateByIndex(gamepadIndex) {
    return this.readPadState(this.getPadByIndex(gamepadIndex));
  }

  menuConfirmPressed(slot) {
    const pad = this.getLivePad(slot);
    if (!pad) return false;
    return this.anyButtonPressed(pad);
  }

  menuStartPressed(slot) {
    const pad = this.getLivePad(slot);
    if (!pad) return false;
    if (pad._hid) {
      const s = pad._hidPad?.state;
      if (!s) return false;
      const key = `${pad.index}:hidStart`;
      const held = !!(s.startHeld || s.start);
      this._pendingButtons.set(key, held);
      const wasHeld = this.prevButtonDown.get(key) === true;
      return held && !wasHeld;
    }
    return this.buttonPressed(pad, GP.START) || this.buttonPressed(pad, GP.SELECT);
  }

  anyMenuPress(slot) {
    return this.menuConfirmPressed(slot);
  }

  getKeyboardState(controls, player) {
    if (!controls) return EMPTY_INPUT();
    return {
      left: this.isKeyHeld(controls.LEFT),
      right: this.isKeyHeld(controls.RIGHT),
      up: this.isKeyHeld(controls.JUMP),
      down: this.isKeyHeld(controls.SHIELD),
      jump: this.isKeyPressed(controls.JUMP, player),
      jumpHeld: this.isKeyHeld(controls.JUMP),
      attack: this.isKeyPressed(controls.ATTACK, player),
      attackHeld: this.isKeyHeld(controls.ATTACK),
      dodge: this.isKeyPressed(controls.DODGE, player),
      special: this.isKeyPressed(controls.SPECIAL, player),
      shield: this.isKeyHeld(controls.SHIELD),
      grab: this.isKeyPressed(controls.GRAB, player)
    };
  }

  isKeyPressed(codes, player) {
    for (const code of codes) {
      if (this.keys.get(code)) {
        if (player === 'PLAYER1') this.players.PLAYER1.pressedThisFrame = true;
        return true;
      }
    }
    return false;
  }

  isKeyHeld(codes) {
    for (const code of codes) {
      if (this.keys.get(code)) return true;
    }
    return false;
  }

  /**
   * @param {number} slot
   * @param {object|null} controlsBySlot
   * @param {{
   *   mergeKeyboardP2?: boolean,
   *   gamepadIndex?: number|null,
   *   allowKeyboard?: boolean
   * }} opts
   */
  getPlayerState(slot, controlsBySlot = null, opts = {}) {
    const {
      mergeKeyboardP2 = false,
      gamepadIndex = null,
      allowKeyboard = true
    } = opts;

    let pad =
      gamepadIndex != null ? this.getPadByIndex(gamepadIndex) : null;

    // If bound index missing this frame, try activated pads by slot order
    if (!pad && gamepadIndex == null) {
      const activated = this.getActivatedPads();
      pad = activated[slot] || null;
    }

    if (pad) {
      return this.readPadState(pad);
    }

    if (!allowKeyboard) return EMPTY_INPUT();

    if (slot === 0) {
      return this.getKeyboardState(controlsBySlot?.PLAYER1, 'PLAYER1');
    }
    if (slot === 1 && mergeKeyboardP2) {
      return this.getKeyboardState(controlsBySlot?.PLAYER2, 'PLAYER2');
    }
    return EMPTY_INPUT();
  }

  getPlayer1State(controls) {
    return this.getPlayerState(0, { PLAYER1: controls });
  }

  getPlayer2State(controls) {
    return this.getPlayerState(1, { PLAYER2: controls }, { mergeKeyboardP2: true });
  }

  clearFrame() {
    for (const player of Object.values(this.players)) {
      player.pressedThisFrame = false;
    }
  }
}
