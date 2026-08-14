/**
 * WebHID driver for Nintendo Switch Pro Controller (USB).
 * Chrome on macOS often never exposes USB Pro Controllers via Gamepad API.
 *
 * Protocol refs: dekuNukem/Nintendo_Switch_Reverse_Engineering
 */

const NINTENDO_VENDOR = 0x057e;
const PRO_PRODUCT = 0x2009;
/** Virtual gamepad.index base (avoids clashing with real Gamepad API indices). */
const HID_INDEX_BASE = 100;

const STICK_DEADZONE = 0.18;

const FILTERS = [
  { vendorId: NINTENDO_VENDOR, productId: PRO_PRODUCT },
  // Joy-Con L / R (optional; treated as half-pads if connected)
  { vendorId: NINTENDO_VENDOR, productId: 0x2006 },
  { vendorId: NINTENDO_VENDOR, productId: 0x2007 }
];

function emptyState() {
  return {
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
    grab: false,
    start: false,
    startHeld: false
  };
}

function decodeStick12(data, offset) {
  const a = data[offset];
  const b = data[offset + 1];
  const c = data[offset + 2];
  const x = a | ((b & 0x0f) << 8);
  const y = (b >> 4) | (c << 4);
  // Factory center ~2048; range roughly 0..4095
  const nx = (x - 2048) / 1400;
  const ny = (y - 2048) / 1400;
  return {
    x: Math.max(-1, Math.min(1, nx)),
    y: Math.max(-1, Math.min(1, ny))
  };
}

function applyDeadzone(v) {
  return Math.abs(v) >= STICK_DEADZONE ? v : 0;
}

export class SwitchProHidManager {
  constructor() {
    /** @type {Map<string, HidPad>} */
    this.pads = new Map();
    this._nextSlot = 0;
    this._supported =
      typeof navigator !== 'undefined' && !!navigator.hid;
    /** @type {Set<() => void>} */
    this._onChange = new Set();
    this._reopenBusy = false;

    if (this._supported) {
      navigator.hid.addEventListener('disconnect', (e) => {
        this._removeDevice(e.device);
        this._emitChange();
      });
      // Chrome fires connect for previously-permitted devices on plug-in
      navigator.hid.addEventListener('connect', (e) => {
        if (!this._isNintendoPad(e.device)) return;
        this._attach(e.device)
          .then(() => this._emitChange())
          .catch(() => {});
      });
      // Re-open previously permitted devices (no user gesture needed)
      this.reopenGranted().then((list) => {
        if (list.length) this._emitChange();
      }).catch(() => {});

      // Catch late permissions / replugs without connect events
      this._pollTimer = setInterval(() => {
        this.reopenGranted().then((list) => {
          if (list.length) this._emitChange();
        }).catch(() => {});
      }, 1500);
    }
  }

  get supported() {
    return this._supported;
  }

  /** Subscribe to pad attach/detach (auto-reconnect UI refresh). */
  onChange(fn) {
    this._onChange.add(fn);
    return () => this._onChange.delete(fn);
  }

  _emitChange() {
    for (const fn of this._onChange) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  async reopenGranted() {
    if (!this._supported || this._reopenBusy) return [];
    this._reopenBusy = true;
    const opened = [];
    try {
      const devices = await navigator.hid.getDevices();
      for (const device of devices) {
        if (!this._isNintendoPad(device)) continue;
        if (this._hasDevice(device)) continue;
        try {
          await this._attach(device);
          opened.push(device);
        } catch {
          /* ignore */
        }
      }
    } finally {
      this._reopenBusy = false;
    }
    return opened;
  }

  /**
   * First-time only (user gesture). After that, reopenGranted handles reconnect.
   * Requests multiple devices when the browser allows.
   */
  async requestAndAttach() {
    if (!this._supported) {
      throw new Error('WebHID not supported in this browser');
    }
    // Prefer multi-select when available
    let devices = [];
    try {
      devices = await navigator.hid.requestDevice({
        filters: FILTERS,
        // multiple is not in the IDL everywhere; harmless if ignored
        multiple: true
      });
    } catch {
      devices = await navigator.hid.requestDevice({ filters: FILTERS });
    }
    let n = 0;
    for (const device of devices) {
      if (this._hasDevice(device)) continue;
      await this._attach(device);
      n++;
    }
    const more = await this.reopenGranted();
    if (n > 0 || more.length > 0) this._emitChange();
    return this.pads.size;
  }

  /** How many Nintendo pads the origin has permission for (may be unplugged). */
  async grantedCount() {
    if (!this._supported) return 0;
    try {
      const devices = await navigator.hid.getDevices();
      return devices.filter((d) => this._isNintendoPad(d)).length;
    } catch {
      return 0;
    }
  }

  _isNintendoPad(device) {
    if (device.vendorId !== NINTENDO_VENDOR) return false;
    return (
      device.productId === PRO_PRODUCT ||
      device.productId === 0x2006 ||
      device.productId === 0x2007 ||
      /pro controller|joy-con/i.test(device.productName || '')
    );
  }

  _deviceKey(device) {
    return `${device.vendorId}:${device.productId}:${device.productName}:${device.collections?.length}`;
  }

  _hasDevice(device) {
    for (const p of this.pads.values()) {
      if (p.device === device) return true;
    }
    return false;
  }

  _removeDevice(device) {
    for (const [key, p] of this.pads) {
      if (p.device === device) {
        p.dispose();
        this.pads.delete(key);
      }
    }
  }

  async _attach(device) {
    if (!device.opened) {
      await device.open();
    }
    const slot = this._nextSlot++;
    const index = HID_INDEX_BASE + slot;
    const pad = new HidPad(device, index, slot);
    await pad.initUsb();
    const key = `${index}:${device.productName}`;
    this.pads.set(key, pad);
    return pad;
  }

  getCount() {
    return this.pads.size;
  }

  /** Synthetic pad descriptors compatible with getLivePads consumers. */
  getVirtualPads() {
    const out = [];
    for (const p of this.pads.values()) {
      out.push(p.asGamepadLike());
    }
    out.sort((a, b) => a.index - b.index);
    return out;
  }

  getStateByIndex(gamepadIndex) {
    for (const p of this.pads.values()) {
      if (p.index === gamepadIndex) return p.getInputState();
    }
    return null;
  }

  getStatusLines() {
    return [...this.pads.values()].map(
      (p) => `✓ ${p.label} (#${p.index} HID)`
    );
  }
}

class HidPad {
  constructor(device, index, slot) {
    this.device = device;
    this.index = index;
    this.slot = slot;
    this.label = device.productName || 'Switch Pro';
    this.packetNumber = 0;
    this.state = emptyState();
    this._prevButtons = {
      jump: false,
      attack: false,
      dodge: false,
      special: false,
      grab: false,
      start: false
    };
    this._onInput = (e) => this._handleReport(e);
    this.device.addEventListener('inputreport', this._onInput);
    this.connected = true;
    this.lastReportAt = 0;
  }

  dispose() {
    try {
      this.device.removeEventListener('inputreport', this._onInput);
      if (this.device.opened) this.device.close();
    } catch {
      /* ignore */
    }
    this.connected = false;
  }

  async initUsb() {
    // USB handshake so Pro Controller stays on wire (won't fall back to BT timeout)
    try {
      await this._sendOutput(0x80, [0x02]); // handshake
      await sleep(50);
      await this._sendOutput(0x80, [0x03]); // higher baud
      await sleep(50);
      await this._sendOutput(0x80, [0x02]); // handshake again
      await sleep(50);
      await this._sendOutput(0x80, [0x04]); // force USB only
      await sleep(50);
    } catch {
      // Bluetooth-opened devices may reject 0x80 USB cmds — continue
    }

    // Enable standard full input reports (0x30 @ 60–120Hz)
    try {
      await this._sendSubcommand(0x03, [0x30]);
      await sleep(30);
      // Player LED = slot+1
      const led = 1 << (this.slot % 4);
      await this._sendSubcommand(0x30, [led]);
    } catch {
      /* simple 0x3F reports may still arrive without this */
    }
  }

  async _sendOutput(reportId, data) {
    const buf = new Uint8Array(data);
    // Try sendReport; some interfaces need sendFeatureReport
    try {
      await this.device.sendReport(reportId, buf);
    } catch {
      await this.device.sendFeatureReport?.(reportId, buf);
    }
  }

  async _sendSubcommand(subcmd, data = []) {
    // Output 0x01: rumble + subcommand
    const buf = new Uint8Array(48);
    buf[0] = this.packetNumber & 0x0f;
    this.packetNumber = (this.packetNumber + 1) & 0x0f;
    // Neutral rumble
    buf[1] = 0x00;
    buf[2] = 0x01;
    buf[3] = 0x40;
    buf[4] = 0x40;
    buf[5] = 0x00;
    buf[6] = 0x01;
    buf[7] = 0x40;
    buf[8] = 0x40;
    buf[9] = subcmd;
    for (let i = 0; i < data.length && i < 38; i++) buf[10 + i] = data[i];
    await this.device.sendReport(0x01, buf);
  }

  _handleReport(event) {
    const reportId = event.reportId;
    const data = new Uint8Array(event.data.buffer);
    this.lastReportAt = performance.now();

    if (reportId === 0x3f) {
      this._parseSimple(data);
      return;
    }
    if (reportId === 0x30 || reportId === 0x31 || reportId === 0x21) {
      this._parseFull(data);
      return;
    }
    // Some stacks omit report id in data[0]
    if (data.length >= 12 && (data[0] === 0x30 || data[0] === 0x3f)) {
      if (data[0] === 0x3f) this._parseSimple(data.subarray(1));
      else this._parseFull(data.subarray(1));
    }
  }

  _parseSimple(data) {
    // INPUT 0x3F (bytes after report id)
    // data[0-1] buttons, data[2] hat, data[3-6] left stick, data[7-10] right
    if (data.length < 4) return;

    const b0 = data[0];
    const b1 = data[1];
    // Joy-Con style simple map is awkward on Pro; prefer full reports.
    // Hat: 0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW,8=neutral
    const hat = data[2];
    let left = false;
    let right = false;
    let up = false;
    let down = false;
    if (hat !== 8 && hat <= 7) {
      if (hat === 0 || hat === 1 || hat === 7) up = true;
      if (hat === 4 || hat === 3 || hat === 5) down = true;
      if (hat === 6 || hat === 5 || hat === 7) left = true;
      if (hat === 2 || hat === 1 || hat === 3) right = true;
    }

    let lx = 0;
    let ly = 0;
    if (data.length >= 8) {
      const hx = data[3] | (data[4] << 8);
      const hy = data[5] | (data[6] << 8);
      lx = applyDeadzone((hx - 0x8000) / 20000);
      ly = applyDeadzone((hy - 0x8000) / 20000);
    }
    if (lx < 0) left = true;
    if (lx > 0) right = true;
    // Simple report Y: smaller = up (same as full after center)
    if (ly < 0) up = true;
    if (ly > 0) down = true;

    // Pro simple buttons (byte1/2 layout varies); use loose mapping
    const jumpHeld = !!(b0 & 0x08) || !!(b1 & 0x08); // Up-ish / A fallbacks
    const attackHeld = !!(b0 & 0x04) || !!(b0 & 0x01);
    const dodgeHeld = !!(b0 & 0x02);
    const specialHeld = !!(b1 & 0x40);
    const shieldHeld = !!(b1 & 0x80);
    const grabHeld = !!(b1 & 0x40) && !specialHeld;

    this._commitButtons({
      left,
      right,
      up,
      down,
      jumpHeld: jumpHeld || !!(b0 & 0x08),
      attackHeld,
      dodgeHeld,
      specialHeld,
      shieldHeld,
      grabHeld,
      startHeld: !!(b1 & 0x02)
    });
  }

  _parseFull(data) {
    // Standard full report AFTER report id byte already stripped by WebHID
    // bytes: [timer, bat/con, btnR, btnS, btnL, stickL*3, stickR*3, ...]
    if (data.length < 12) return;

    const btnR = data[2];
    const btnS = data[3];
    const btnL = data[4];

    // Right: Y X B A SR SL R ZR
    const y = !!(btnR & 0x01);
    const x = !!(btnR & 0x02);
    const b = !!(btnR & 0x04);
    const a = !!(btnR & 0x08);
    const r = !!(btnR & 0x40);
    const zr = !!(btnR & 0x80);

    // Left: Down Up Right Left SR SL L ZL
    const dpadDown = !!(btnL & 0x01);
    const dpadUp = !!(btnL & 0x02);
    const dpadRight = !!(btnL & 0x04);
    const dpadLeft = !!(btnL & 0x08);
    const l = !!(btnL & 0x40);
    const zl = !!(btnL & 0x80);

    // Shared: Minus Plus RStick LStick Home Capture
    const startHeld = !!(btnS & 0x02);

    const ls = decodeStick12(data, 5);
    const mx = applyDeadzone(ls.x);
    const my = applyDeadzone(ls.y);

    let left = dpadLeft || mx < 0;
    let right = dpadRight || mx > 0;
    // Stick Y: up is negative on Switch stick math after decode
    let up = dpadUp || my < 0;
    let down = dpadDown || my > 0;

    // Physical Nintendo face: B=jump, Y=attack, X=dodge, A=grab
    // R/ZR=special/shield, L/ZL=shield/grab
    const jumpHeld = b;
    const attackHeld = y;
    const dodgeHeld = x;
    const specialHeld = r;
    const shieldHeld = zr || zl;
    const grabHeld = a || l;

    this._commitButtons({
      left,
      right,
      up,
      down,
      jumpHeld,
      attackHeld,
      dodgeHeld,
      specialHeld,
      shieldHeld,
      grabHeld,
      startHeld
    });
  }

  _commitButtons({
    left,
    right,
    up,
    down,
    jumpHeld,
    attackHeld,
    dodgeHeld,
    specialHeld,
    shieldHeld,
    grabHeld,
    startHeld = false
  }) {
    const prev = this._prevButtons;
    // Latch rising edges until a game frame consumes them. HID reports ~120Hz;
    // overwriting edges on the next report dropped jumps/attacks before 60fps read.
    const jumpEdge = (!!jumpHeld && !prev.jump) || !!this.state.jump;
    const attackEdge = (!!attackHeld && !prev.attack) || !!this.state.attack;
    const dodgeEdge = (!!dodgeHeld && !prev.dodge) || !!this.state.dodge;
    const specialEdge = (!!specialHeld && !prev.special) || !!this.state.special;
    const grabEdge = (!!grabHeld && !prev.grab) || !!this.state.grab;
    const startEdge = (!!startHeld && !prev.start) || !!this.state.start;
    this.state = {
      left: !!left,
      right: !!right,
      up: !!up,
      down: !!down,
      jump: jumpEdge,
      jumpHeld: !!jumpHeld,
      attack: attackEdge,
      attackHeld: !!attackHeld,
      dodge: dodgeEdge,
      special: specialEdge,
      shield: !!shieldHeld,
      grab: grabEdge,
      start: startEdge,
      startHeld: !!startHeld
    };
    this._prevButtons = {
      jump: !!jumpHeld,
      attack: !!attackHeld,
      dodge: !!dodgeHeld,
      special: !!specialHeld,
      grab: !!grabHeld,
      start: !!startHeld
    };
  }

  /** Non-consuming peek (menus / debug). */
  peekState() {
    return { ...this.state };
  }

  getInputState() {
    // Snapshot + clear one-shot edges after the fight frame reads them.
    const s = { ...this.state };
    this.state.jump = false;
    this.state.attack = false;
    this.state.dodge = false;
    this.state.special = false;
    this.state.grab = false;
    this.state.start = false;
    return s;
  }

  asGamepadLike() {
    return {
      index: this.index,
      id: `${this.label} (WebHID)`,
      mapping: 'switch-pro-hid',
      connected: this.connected,
      buttons: [],
      axes: [],
      _hid: true,
      _hidPad: this
    };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
