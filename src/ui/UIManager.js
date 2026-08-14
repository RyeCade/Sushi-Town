import * as THREE from 'three';
import {
  GAME_STATES,
  PLAYER_COLORS,
  PLAYER_COLOR_IDS,
  PLAYER_MODES,
  INPUT_MODES,
  AI_DIFFICULTY,
  CHARACTER_TYPES,
  isOneVAi,
  isFfaMode,
  isTeamMode,
  TEAM_LABELS
} from '../utils/constants.js';
import { audio } from '../audio/AudioManager.js';

export class UIManager {
  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:sans-serif;';
    document.body.appendChild(this.container);
    
    this.hudElements = {};
    this.currentScreen = null;
  }

  createHUD(stockCount = 3, labels = ['PLAYER 1', 'PLAYER 2']) {
    this.clearScreen();
    
    const stocks = Math.min(5, Math.max(1, Math.floor(stockCount) || 3));
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:20px;left:0;right:0;display:flex;justify-content:space-around;flex-wrap:wrap;gap:12px;padding:0 24px;';

    this.hudElements.damage = [];
    this.hudElements.stocks = [];

    for (let i = 0; i < labels.length; i++) {
      const box = this.createPlayerBox(labels[i], '0%', stocks);
      hud.appendChild(box);
      this.hudElements.damage[i] = box.querySelector('.damage');
      this.hudElements.stocks[i] = box.querySelectorAll('.stock');
    }
    
    this.container.appendChild(hud);
    this.currentScreen = 'hud';
  }

  createPlayerBox(label, damage, stocks) {
    const box = document.createElement('div');
    box.style.cssText = 'background:rgba(0,0,0,0.7);padding:12px 18px;border-radius:10px;color:white;min-width:140px;';
    
    const nameLabel = document.createElement('div');
    nameLabel.style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:6px;';
    nameLabel.textContent = label;
    
    const damageDisplay = document.createElement('div');
    damageDisplay.className = 'damage';
    damageDisplay.style.cssText = 'font-size:36px;font-weight:bold;color:#ffcc00;text-shadow:2px 2px 4px rgba(0,0,0,0.5);';
    damageDisplay.textContent = damage;
    
    const stockContainer = document.createElement('div');
    stockContainer.className = 'stocks';
    stockContainer.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
    
    for (let i = 0; i < stocks; i++) {
      const stock = document.createElement('div');
      stock.className = 'stock';
      stock.style.cssText = 'width:14px;height:14px;background:#ff4444;border-radius:50%;box-shadow:0 0 10px #ff4444;';
      stockContainer.appendChild(stock);
    }
    
    box.appendChild(nameLabel);
    box.appendChild(damageDisplay);
    box.appendChild(stockContainer);
    
    return box;
  }

  updateDamage(player, damage, damageColor = null) {
    const element = this.hudElements.damage?.[player - 1]
      ?? (player === 1 ? this.hudElements.p1Damage : this.hudElements.p2Damage);
    if (element) {
      element.textContent = `${Math.floor(damage)}%`;
      if (damageColor != null) {
        const css = this._vividHexCss(damageColor);
        element.style.color = css;
        element.style.textShadow = `0 0 12px ${css}, 0 0 24px ${css}, 2px 2px 4px rgba(0,0,0,0.65)`;
      } else {
        element.style.color = '#ffcc00';
        element.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
      }
    }
  }

  /** Brighten + saturate a THREE hex for readable HUD tint. */
  _vividHexCss(hex) {
    const c = new THREE.Color(hex >>> 0);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // Push toward full chroma and a mid-bright luminance so it pops on dark HUD
    c.setHSL(hsl.h, Math.min(1, hsl.s * 1.45 + 0.25), Math.min(0.72, Math.max(0.48, hsl.l * 1.15 + 0.12)));
    return '#' + c.getHexString();
  }

  updateStocks(player, stocks) {
    const elements = this.hudElements.stocks?.[player - 1]
      ?? (player === 1 ? this.hudElements.p1Stocks : this.hudElements.p2Stocks);
    if (elements) {
      elements.forEach((stock, i) => {
        stock.style.background = i < stocks ? '#ff4444' : '#333333';
        stock.style.boxShadow = i < stocks ? '0 0 10px #ff4444' : 'none';
      });
    }
  }

  createControlsHelp(isMulti = false, inputMode = INPUT_MODES.KEYBOARD) {
    const help = document.createElement('div');
    help.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);padding:15px 25px;border-radius:10px;color:white;font-size:12px;display:flex;gap:30px;';

    const p1Controls = [
      ['A/D', 'Move'],
      ['W', 'Jump'],
      ['V', 'Attack'],
      ['C', 'Dodge'],
      ['Shift', 'Special'],
      ['S', 'Shield']
    ];

    const p2Controls = [
      ['←/→', 'Move'],
      ['↑', 'Jump'],
      ['\\', 'Attack'],
      [']', 'Dodge'],
      ['Enter', 'Special'],
      ['↓', 'Shield']
    ];

    const xboxControls = [
      ['LS / D-pad', 'Move'],
      ['A', 'Jump'],
      ['X', 'Attack'],
      ['Hold X', 'Heavy'],
      ['Y', 'Dodge'],
      ['RB', 'Special'],
      ['RT', 'Shield']
    ];

    const switchControls = [
      ['LS / D-pad', 'Move'],
      ['B', 'Jump'],
      ['Y', 'Attack'],
      ['Hold Y', 'Heavy'],
      ['X', 'Dodge'],
      ['A', 'Grab'],
      ['R', 'Special'],
      ['ZR / ZL', 'Shield']
    ];

    const appendControlBlock = (title, controls) => {
      const block = document.createElement('div');
      block.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
      if (title) {
        const heading = document.createElement('div');
        heading.style.cssText = 'font-size:11px;font-weight:bold;color:#ffcc00;letter-spacing:0.06em;margin-bottom:2px;';
        heading.textContent = title;
        block.appendChild(heading);
      }
      const cols = document.createElement('div');
      cols.style.cssText = 'display:flex;gap:20px;';
      const leftCol = document.createElement('div');
      leftCol.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
      const rightCol = document.createElement('div');
      rightCol.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
      const split = Math.ceil(controls.length / 2);
      controls.forEach(([key, action], i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:15px;';
        row.innerHTML = `<span style="color:#ffcc00;font-weight:bold;">${key}</span><span>${action}</span>`;
        if (i < split) leftCol.appendChild(row);
        else rightCol.appendChild(row);
      });
      cols.appendChild(leftCol);
      cols.appendChild(rightCol);
      block.appendChild(cols);
      help.appendChild(block);
    };

    if (inputMode === INPUT_MODES.PAD) {
      appendControlBlock('Xbox / standard', xboxControls);
      appendControlBlock('Switch Pro', switchControls);
    } else if (isMulti) {
      appendControlBlock('P1', p1Controls);
      appendControlBlock('P2', p2Controls);
    } else {
      appendControlBlock('Keyboard', p1Controls);
    }

    this.container.appendChild(help);
    this.hudElements.controlsHelp = help;
  }

  /**
   * @param {object} opts
   */
  createCharacterSelect(opts = {}) {
    const {
      characters = [],
      stages = [],
      selectedStageId = null,
      onStageChange = null,
      playerMode = PLAYER_MODES.ONE_V_AI,
      onPlayerModeChange = null,
      inputMode = INPUT_MODES.KEYBOARD,
      onInputModeChange = null,
      onConnectHid = null,
      hidSupported = false,
      padCount = 0,
      padLines = [],
      slots = [],
      activeSlot = 0,
      multiCursors = false,
      onActiveSlotChange = null,
      onSlotUpdate = null,
      onForceStart = null,
      aiDifficulty = AI_DIFFICULTY.MID,
      onAiDifficultyChange = null,
      aiType = 'random',
      onAiTypeChange = null,
      hazardsEnabled = false,
      onHazardsChange = null,
      stockCount = 3,
      onStockCountChange = null
    } = opts;

    this.clearScreen();
    this.onSlotUpdate = onSlotUpdate;
    this.onActiveSlotChange = onActiveSlotChange;
    this.onForceStart = onForceStart;
    this.onAiDifficultyChange = onAiDifficultyChange;
    this.onAiTypeChange = onAiTypeChange;
    this.onHazardsChange = onHazardsChange;
    this.onStockCountChange = onStockCountChange;
    this._selectCharacters = characters;
    this._selectedPlayerMode = playerMode;
    this._inputMode = inputMode;
    this._slots = slots.map((s) => ({ ...s }));
    this._activeSlot = activeSlot;
    this._multiCursors = !!multiCursors;
    this._selectedAiDifficulty = aiDifficulty;
    this._selectedAiType = aiType;
    this._hazardsEnabled = !!hazardsEnabled;
    this._stockCount = Math.min(5, Math.max(1, Math.floor(stockCount) || 3));

    const isPad = inputMode === INPUT_MODES.PAD;

    const screen = document.createElement('div');
    screen.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:28px 16px 40px;background:linear-gradient(135deg,#1a1a2e,#16213e);pointer-events:auto;overflow:auto;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:48px;font-weight:bold;color:#ff6b6b;margin-bottom:8px;text-shadow:0 0 24px rgba(255,107,107,0.45);letter-spacing:0.08em;';
    title.textContent = 'SUSHI TOWN';

    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:18px;font-weight:bold;color:white;margin-bottom:12px;opacity:0.85;';
    subtitle.textContent = isTeamMode(playerMode)
      ? playerMode === PLAYER_MODES.TEAM_3V1
        ? '3v1 TEAMS — SHARED COLOR = TEAM'
        : '2v2 TEAMS — SHARED COLOR = TEAM'
      : isFfaMode(playerMode)
        ? 'FREE-FOR-ALL — CUSTOMIZE & START'
        : 'SELECT YOUR FIGHTER';
    this._selectSubtitle = subtitle;

    screen.appendChild(title);
    screen.appendChild(subtitle);

    // Controller count badge (always visible)
    const controllerBadge = document.createElement('div');
    controllerBadge.id = 'controller-count';
    controllerBadge.style.cssText =
      'display:inline-flex;align-items:center;gap:10px;margin-bottom:14px;padding:8px 16px;border-radius:999px;font-size:13px;font-weight:bold;letter-spacing:0.04em;border:2px solid rgba(136,170,255,0.45);background:rgba(0,0,0,0.35);';
    this._controllerBadgeEl = controllerBadge;
    this._setControllerBadge(padCount, padLines, inputMode);
    screen.appendChild(controllerBadge);

    const optionsRow = document.createElement('div');
    optionsRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px 24px;margin-bottom:20px;';

    const selectStyle = 'min-width:160px;padding:10px 14px;font-size:14px;font-weight:bold;color:white;background:#1e2740;border:2px solid #ffcc00;border-radius:8px;cursor:pointer;outline:none;appearance:auto;';
    const labelStyle = 'font-size:13px;font-weight:bold;color:#ffcc00;letter-spacing:0.04em;';

    const addLabeledSelect = (labelText, id, options, value, onChange) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;';
      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.style.cssText = labelStyle;
      lab.textContent = labelText;
      const sel = document.createElement('select');
      sel.id = id;
      sel.style.cssText = selectStyle;
      options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.id;
        o.textContent = opt.name;
        if (opt.id === value) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => onChange(sel.value));
      row.appendChild(lab);
      row.appendChild(sel);
      optionsRow.appendChild(row);
    };

    addLabeledSelect(
      'INPUT',
      'input-mode-select',
      [
        { id: INPUT_MODES.KEYBOARD, name: 'Keyboard' },
        { id: INPUT_MODES.PAD, name: 'Controllers' }
      ],
      inputMode,
      (v) => {
        if (onInputModeChange) onInputModeChange(v);
      }
    );

    const playerOptions = isPad
      ? [
          { id: PLAYER_MODES.ONE_V_AI, name: '1vAi' },
          { id: PLAYER_MODES.FFA_2, name: 'FFA 2' },
          { id: PLAYER_MODES.FFA_3, name: 'FFA 3' },
          { id: PLAYER_MODES.FFA_4, name: 'FFA 4' },
          { id: PLAYER_MODES.TEAM_2V2, name: '2v2' },
          { id: PLAYER_MODES.TEAM_3V1, name: '3v1' }
        ]
      : [
          { id: PLAYER_MODES.ONE_V_AI, name: '1vAi' },
          { id: PLAYER_MODES.FFA_2, name: 'FFA 2' },
          { id: PLAYER_MODES.TEAM_2V2, name: '2v2' },
          { id: PLAYER_MODES.TEAM_3V1, name: '3v1' }
        ];

    addLabeledSelect(
      'PLAYERS',
      'players-select',
      playerOptions,
      playerMode,
      (v) => {
        if (onPlayerModeChange) onPlayerModeChange(v);
      }
    );

    if (stages.length > 0) {
      addLabeledSelect(
        'MAP',
        'stage-select',
        stages.map((s) => ({ id: s.id, name: s.name })),
        selectedStageId,
        (v) => {
          if (onStageChange) onStageChange(v);
        }
      );
    }

    addLabeledSelect(
      'HAZARDS',
      'hazards-select',
      [
        { id: 'off', name: 'Off' },
        { id: 'on', name: 'On' }
      ],
      this._hazardsEnabled ? 'on' : 'off',
      (v) => {
        this._hazardsEnabled = v === 'on';
        if (onHazardsChange) onHazardsChange(this._hazardsEnabled);
      }
    );

    addLabeledSelect(
      'STOCKS',
      'stocks-select',
      [1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: String(n) })),
      String(this._stockCount),
      (v) => {
        this._stockCount = Math.min(5, Math.max(1, parseInt(v, 10) || 3));
        if (onStockCountChange) onStockCountChange(this._stockCount);
      }
    );

    // Only show first-time / add-more HID button when none are live yet
    if (isPad && hidSupported && onConnectHid && padCount <= 0) {
      const hidBtn = document.createElement('button');
      hidBtn.type = 'button';
      hidBtn.textContent = 'ALLOW SWITCH PROS (ONCE)';
      hidBtn.title =
        'One-time browser permission. After this, pads reconnect automatically.';
      hidBtn.style.cssText =
        'padding:12px 18px;font-size:13px;font-weight:bold;color:#e8f0ff;background:#2a4a8a;border:2px solid #88aaff;border-radius:8px;cursor:pointer;letter-spacing:0.04em;';
      hidBtn.addEventListener('click', async () => {
        hidBtn.disabled = true;
        hidBtn.textContent = 'SELECT BOTH PADS…';
        try {
          await onConnectHid();
          audio.playUiConfirm();
        } catch (err) {
          console.warn(err);
          hidBtn.textContent = 'ALLOW SWITCH PROS (ONCE)';
          hidBtn.disabled = false;
        }
      });
      optionsRow.appendChild(hidBtn);
    }

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.textContent = 'START';
    startBtn.style.cssText = 'padding:12px 28px;font-size:16px;font-weight:bold;color:#1a1a2e;background:#ffcc00;border:none;border-radius:8px;cursor:pointer;letter-spacing:0.08em;box-shadow:0 0 18px rgba(255,204,0,0.35);';
    startBtn.addEventListener('click', () => {
      audio.playUiConfirm();
      if (onForceStart) onForceStart();
    });
    optionsRow.appendChild(startBtn);

    screen.appendChild(optionsRow);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:13px;color:#aaa;margin-bottom:8px;text-align:center;max-width:820px;';
    if (!isPad) {
      if (isTeamMode(playerMode)) {
        hint.textContent =
          playerMode === PLAYER_MODES.TEAM_3V1
            ? 'Keyboard 3v1 · P1 solo team · P2 + CPUs majority · shared color = team · P1: WASD · P2: arrows'
            : 'Keyboard 2v2 · P1+P2 human, P3+P4 CPU · shared color = team · P1: WASD · P2: arrows';
      } else {
        hint.textContent =
          playerMode === PLAYER_MODES.FFA_2
            ? 'Keyboard FFA 2 · P1: WASD + V/C · P2: arrows + \\ / ]'
            : 'Keyboard 1vAi · P1: WASD move · V attack · C dodge · S shield';
      }
    } else if (hidSupported && padCount <= 0) {
      hint.textContent =
        'Switch Pros need a one-time browser allow. Click ALLOW SWITCH PROS once (pick both). After that they auto-connect on every load.';
    } else if (hidSupported && padCount >= 2) {
      hint.textContent =
        '2+ pads · each has its own cursor · ←→ pick · ↑↓ color/fighter/ready · START';
    } else if (hidSupported && padCount > 0) {
      hint.textContent =
        'Click to customize · plug a 2nd pad for multi-cursors · START to fight';
    } else if (isTeamMode(playerMode)) {
      hint.textContent =
        'Teams · join with pads · same color = teammates · empty slots = CPU on START';
    } else if (isFfaMode(playerMode)) {
      hint.textContent =
        'Join with pads · side-by-side customize · empty slots = CPU on START';
    } else if (isOneVAi(playerMode)) {
      hint.textContent =
        'Controllers · claim P1 · customize on the left · START to fight';
    } else {
      hint.textContent =
        'Click panels to customize · 2+ pads unlock multi-cursors · START anytime';
    }
    screen.appendChild(hint);

    const padStatus = document.createElement('div');
    padStatus.id = 'pad-status';
    padStatus.style.cssText =
      'font-size:12px;font-weight:bold;color:#88aaff;margin-bottom:14px;text-align:center;letter-spacing:0.04em;max-width:900px;';
    this._padStatusEl = padStatus;
    this.updatePadStatus(padCount, padLines, inputMode);
    screen.appendChild(padStatus);

    const fighterArea = document.createElement('div');
    fighterArea.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:1400px;';
    this._fighterArea = fighterArea;
    this._renderFighterArea(fighterArea);

    screen.appendChild(fighterArea);
    this.container.appendChild(screen);
    this.currentScreen = 'characterSelect';
  }

  _setControllerBadge(count = 0, lines = [], inputMode = INPUT_MODES.KEYBOARD) {
    const el = this._controllerBadgeEl;
    if (!el) return;
    const n = Math.max(0, count | 0);
    const isPad = inputMode === INPUT_MODES.PAD;
    el.style.borderColor = n > 0 ? 'rgba(34,204,68,0.65)' : 'rgba(136,170,255,0.45)';
    el.style.color = n > 0 ? '#7dffa0' : '#88aaff';
    const modeTag = isPad ? 'CONTROLLER MODE' : 'KEYBOARD MODE';
    const detail =
      lines && lines.length > 0 ? ` · ${lines.slice(0, 4).join(' · ')}` : '';
    el.textContent = `CONTROLLERS CONNECTED: ${n} · ${modeTag}${detail}`;
  }

  _colorCss(colorId) {
    const hex = PLAYER_COLORS[colorId] ?? 0xffffff;
    return '#' + hex.toString(16).padStart(6, '0');
  }

  /** Map roster type → weight class for select layout. */
  _characterClass(type) {
    if (
      type === CHARACTER_TYPES.LIGHT ||
      type === CHARACTER_TYPES.WASABI
    ) return 'light';
    if (
      type === CHARACTER_TYPES.HEAVY ||
      type === CHARACTER_TYPES.ONIGIRI ||
      type === CHARACTER_TYPES.RAMEN
    ) return 'heavy';
    // medium, gyoza, tamago
    return 'medium';
  }

  _groupCharactersByClass(characters) {
    const order = [
      { id: 'light', label: 'LIGHT' },
      { id: 'medium', label: 'MEDIUM' },
      { id: 'heavy', label: 'HEAVY' }
    ];
    return order.map((group) => ({
      ...group,
      entries: characters
        .map((char, index) => ({ char, index }))
        .filter(({ char }) => this._characterClass(char.type) === group.id)
    })).filter((g) => g.entries.length > 0);
  }

  _createClassedCharacterGrid(characters, cardOptionsFor, opts = {}) {
    const { compact = false } = opts;
    const root = document.createElement('div');
    root.style.cssText = compact
      ? 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;'
      : 'display:flex;flex-direction:row;flex-wrap:wrap;align-items:flex-start;justify-content:center;gap:28px;';

    const groups = this._groupCharactersByClass(characters);
    groups.forEach((group) => {
      const section = document.createElement('div');
      section.style.cssText = compact
        ? 'display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;'
        : 'display:flex;flex-direction:column;align-items:center;gap:10px;';

      const label = document.createElement('div');
      label.style.cssText = compact
        ? 'font-size:10px;font-weight:bold;color:#ffcc00;letter-spacing:0.1em;opacity:0.85;'
        : 'font-size:13px;font-weight:bold;color:#ffcc00;letter-spacing:0.12em;opacity:0.9;';
      label.textContent = group.label;
      section.appendChild(label);

      const col = document.createElement('div');
      col.style.cssText = compact
        ? 'display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;justify-content:center;'
        : 'display:flex;flex-direction:column;gap:14px;align-items:center;';
      group.entries.forEach(({ char, index }) => {
        col.appendChild(
          this.createCharacterCard(char, index, {
            ...cardOptionsFor(char, index),
            compact
          })
        );
      });
      section.appendChild(col);
      root.appendChild(section);
    });

    return root;
  }

  _slotCanCustomize(slot, slotIndex, mode) {
    if (!slot) return false;
    if (isTeamMode(mode)) return true;
    if (isOneVAi(mode) && slotIndex === 0) return true;
    if (isOneVAi(mode) && slotIndex === 1) return false;
    return !!(slot.human && slot.joined);
  }

  _renderFighterArea(fighterArea) {
    if (!fighterArea || !this._selectCharacters) return;
    fighterArea.innerHTML = '';

    const characters = this._selectCharacters;
    const slots = this._slots || [];
    const mode = this._selectedPlayerMode;

    const panelsRow = document.createElement('div');
    panelsRow.style.cssText =
      'display:flex;flex-direction:row;flex-wrap:nowrap;justify-content:center;align-items:stretch;gap:12px;width:100%;overflow-x:auto;padding-bottom:8px;';

    slots.forEach((slot, i) => {
      panelsRow.appendChild(this._createPlayerCustomizePanel(i, slot, characters, mode));
    });
    fighterArea.appendChild(panelsRow);

    if (isOneVAi(mode)) {
      fighterArea.appendChild(this._createAiSettingsPanel(characters));
    }
  }

  _createPlayerCustomizePanel(slotIndex, slot, characters, mode) {
    const canEdit = this._slotCanCustomize(slot, slotIndex, mode);
    // Cursor on any editable slot that owns a unique pad (1 pad is enough)
    const showCursor = !!(
      this._inputMode === INPUT_MODES.PAD &&
      this._multiCursors &&
      canEdit &&
      slot.hasOwnPad
    );
    const teamCss = this._colorCss(slot.colorId);
    const cursorOn = showCursor ? (slot.cursorFocus || 'fighter') : null;
    const panel = document.createElement('div');
    panel.dataset.slotIndex = String(slotIndex);
    panel.style.cssText = [
      'flex:1 1 220px',
      'min-width:200px',
      'max-width:320px',
      'padding:12px 10px 14px',
      'background:rgba(0,0,0,0.45)',
      'border-radius:14px',
      `border:3px solid ${canEdit ? teamCss : 'rgba(255,255,255,0.15)'}`,
      canEdit ? `box-shadow:0 0 16px ${teamCss}55` : '',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:10px'
    ].filter(Boolean).join(';');

    const title = document.createElement('div');
    title.style.cssText = `font-size:18px;font-weight:bold;color:${canEdit ? teamCss : '#ffcc00'};letter-spacing:0.06em;`;
    title.textContent = `P${slotIndex + 1}`;
    panel.appendChild(title);

    let status = 'OPEN';
    let statusColor = '#888';
    if (slot.human && slot.joined) {
      status = slot.ready ? 'READY' : 'JOINED';
      statusColor = slot.ready ? '#22cc44' : '#ffcc00';
    } else if (!slot.human && (slot.joined || isOneVAi(mode) || isTeamMode(mode))) {
      status = 'CPU';
      statusColor = '#88aaff';
    } else if (isFfaMode(mode) || isTeamMode(mode)) {
      status = slot.joined ? 'CPU' : 'OPEN · Press A';
      statusColor = slot.joined ? '#88aaff' : '#666';
    }

    const statusEl = document.createElement('div');
    statusEl.style.cssText = `font-size:11px;font-weight:bold;color:${statusColor};letter-spacing:0.04em;`;
    statusEl.textContent = status;
    panel.appendChild(statusEl);

    if (!canEdit) {
      const cfg = characters[slot.fighterIndex ?? 0] || characters[0];
      if (cfg && (slot.joined || !slot.human)) {
        const name = document.createElement('div');
        name.style.cssText = 'font-size:14px;font-weight:bold;color:white;text-align:center;';
        name.textContent = cfg.name || cfg.type;
        panel.appendChild(name);
      }
      const locked = document.createElement('div');
      locked.style.cssText = 'font-size:12px;color:#666;text-align:center;margin-top:8px;';
      locked.textContent = slot.joined && !slot.human ? 'CPU picks at start' : 'Waiting…';
      panel.appendChild(locked);
      return panel;
    }

    if (isTeamMode(mode)) {
      const teamWrap = document.createElement('div');
      teamWrap.style.cssText =
        cursorOn === 'team'
          ? `padding:6px;border-radius:10px;border:2px solid ${teamCss};box-shadow:0 0 12px ${teamCss};width:100%;`
          : 'padding:6px;border-radius:10px;border:2px solid transparent;width:100%;';
      teamWrap.appendChild(
        this._createSlotTeamRow(slotIndex, slot, { compact: true, showCursor })
      );
      panel.appendChild(teamWrap);
    }

    const colorWrap = document.createElement('div');
    colorWrap.style.cssText =
      cursorOn === 'color'
        ? `padding:6px;border-radius:10px;border:2px solid ${teamCss};box-shadow:0 0 12px ${teamCss};width:100%;`
        : 'padding:6px;border-radius:10px;border:2px solid transparent;width:100%;';
    colorWrap.appendChild(
      this._createSlotColorRow(slotIndex, slot, { compact: true, showCursor })
    );
    panel.appendChild(colorWrap);

    const fighterWrap = document.createElement('div');
    fighterWrap.style.cssText =
      cursorOn === 'fighter'
        ? `padding:6px;border-radius:10px;border:2px solid ${teamCss};box-shadow:0 0 12px ${teamCss};width:100%;`
        : 'padding:6px;border-radius:10px;border:2px solid transparent;width:100%;';
    fighterWrap.appendChild(
      this._createClassedCharacterGrid(
        characters,
        (_char, index) => ({
          teamColorId: slot.colorId,
          selected: (slot.fighterIndex ?? 0) === index,
          cursor:
            showCursor &&
            cursorOn === 'fighter' &&
            (slot.cursorFighterIndex ?? slot.fighterIndex ?? 0) === index,
          onClick: () => {
            if (this.onSlotUpdate) {
              this.onSlotUpdate(slotIndex, {
                fighterIndex: index,
                cursorFighterIndex: index,
                cursorFocus: 'fighter'
              });
            }
          }
        }),
        { compact: true }
      )
    );
    panel.appendChild(fighterWrap);

    if (slot.human && slot.joined) {
      const readyBtn = document.createElement('button');
      readyBtn.type = 'button';
      readyBtn.textContent = slot.ready ? 'READY ✓' : 'READY';
      const readyOutline =
        showCursor && cursorOn === 'ready'
          ? `outline:3px solid ${teamCss};outline-offset:2px;`
          : '';
      readyBtn.style.cssText = slot.ready
        ? `padding:8px 20px;font-weight:bold;background:#22cc44;color:#fff;border:none;border-radius:8px;cursor:pointer;${readyOutline}`
        : `padding:8px 20px;font-weight:bold;background:#1e2740;color:#ffcc00;border:2px solid #ffcc00;border-radius:8px;cursor:pointer;${readyOutline}`;
      readyBtn.addEventListener('click', () => {
        audio.playUiSelect();
        if (this.onSlotUpdate) {
          this.onSlotUpdate(slotIndex, { ready: !slot.ready, cursorFocus: 'ready' });
        }
      });
      panel.appendChild(readyBtn);
    }

    if (showCursor) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:10px;color:#888;text-align:center;line-height:1.3;';
      hint.textContent = isTeamMode(mode)
        ? '←→ team/color/fighter · ↑↓ sections · A ready'
        : '←→ fighters · ↑↓ sections · A ready';
      panel.appendChild(hint);
    }

    return panel;
  }

  _createSlotTeamRow(slotIndex, slot, opts = {}) {
    const { compact = false, showCursor = false } = opts;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;';

    const heading = document.createElement('div');
    heading.style.cssText = compact
      ? 'font-size:10px;font-weight:bold;color:#ffcc00;letter-spacing:0.06em;'
      : 'font-size:12px;font-weight:bold;color:#ffcc00;letter-spacing:0.06em;';
    heading.textContent = 'TEAM';
    row.appendChild(heading);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;';

    const current = slot?.teamId === 1 ? 1 : 0;
    const cursorOnTeam = showCursor && slot.cursorFocus === 'team';

    for (const tid of [0, 1]) {
      const selected = current === tid;
      const colorId = this._teamColorIdFor(tid, slotIndex);
      const css = this._colorCss(colorId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = TEAM_LABELS[tid] || `TEAM ${tid === 0 ? 'A' : 'B'}`;
      btn.style.cssText = [
        compact ? 'padding:6px 10px;font-size:11px' : 'padding:8px 14px;font-size:12px',
        'font-weight:bold',
        'border-radius:8px',
        'cursor:pointer',
        'letter-spacing:0.04em',
        selected
          ? `background:${css};color:#111;border:3px solid #ffcc00`
          : `background:rgba(0,0,0,0.35);color:${css};border:2px solid ${css}99`,
        cursorOnTeam && !selected ? `box-shadow:0 0 10px ${css}` : ''
      ]
        .filter(Boolean)
        .join(';');
      btn.addEventListener('click', () => {
        audio.playUiSelect();
        if (this.onSlotUpdate) {
          this.onSlotUpdate(slotIndex, {
            teamId: tid,
            cursorFocus: 'team'
          });
        }
      });
      btns.appendChild(btn);
    }

    row.appendChild(btns);
    return row;
  }

  /** Representative colorId for a teamId from current slots. */
  _teamColorIdFor(teamId, preferSlotIndex = -1) {
    const slots = this._slots || [];
    if (preferSlotIndex >= 0 && slots[preferSlotIndex]?.teamId === teamId) {
      return slots[preferSlotIndex].colorId || (teamId === 1 ? 'blue' : 'red');
    }
    for (const s of slots) {
      if (s && (s.teamId ?? 0) === teamId && s.colorId) return s.colorId;
    }
    return teamId === 1 ? 'blue' : 'red';
  }

  _createSlotColorRow(slotIndex, slot, opts = {}) {
    const { compact = false, showCursor = false } = opts;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;';

    const heading = document.createElement('div');
    heading.style.cssText = compact
      ? 'font-size:10px;font-weight:bold;color:#ffcc00;letter-spacing:0.06em;'
      : 'font-size:12px;font-weight:bold;color:#ffcc00;letter-spacing:0.06em;';
    heading.textContent = 'COLOR';
    row.appendChild(heading);

    const swatches = document.createElement('div');
    swatches.style.cssText = compact
      ? 'display:flex;flex-wrap:wrap;gap:5px;justify-content:center;'
      : 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:320px;';

    const mode = this._selectedPlayerMode;
    let taken;
    if (isTeamMode(mode)) {
      // Only block the opposing team's current color(s)
      const myTid = slot?.teamId ?? 0;
      const enemyColors = new Set();
      for (const s of this._slots || []) {
        if (!s) continue;
        if ((s.teamId ?? 0) !== myTid && s.colorId) enemyColors.add(s.colorId);
      }
      taken = enemyColors;
    } else {
      taken = new Set(
        (this._slots || [])
          .map((s, i) => (i !== slotIndex ? s.colorId : null))
          .filter(Boolean)
      );
    }

    const cursorColor =
      showCursor && slot.cursorFocus === 'color'
        ? (slot.cursorColorId || slot.colorId)
        : null;

    PLAYER_COLOR_IDS.forEach((colorId) => {
      const blocked = taken.has(colorId);
      const selected = slot?.colorId === colorId;
      const hovered = cursorColor === colorId;
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.title = colorId;
      swatch.disabled = blocked;
      const css = this._colorCss(colorId);
      const size = compact ? 22 : 28;
      swatch.style.cssText = [
        `width:${size}px`,
        `height:${size}px`,
        'border-radius:6px',
        `background:${css}`,
        selected ? 'border:3px solid #ffcc00' : hovered ? 'border:3px solid #ffffff' : 'border:2px solid rgba(255,255,255,0.35)',
        hovered && !selected ? `box-shadow:0 0 10px ${css}` : '',
        blocked ? 'opacity:0.25;cursor:not-allowed' : 'cursor:pointer',
        'padding:0'
      ].filter(Boolean).join(';');
      if (!blocked) {
        swatch.addEventListener('click', () => {
          audio.playUiSelect();
          if (this.onSlotUpdate) {
            this.onSlotUpdate(slotIndex, {
              colorId,
              cursorColorId: colorId,
              cursorFocus: 'color'
            });
          }
        });
      }
      swatches.appendChild(swatch);
    });

    row.appendChild(swatches);
    return row;
  }

  _createAiSettingsPanel(characters) {
    const panel = document.createElement('div');
    panel.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:16px;padding:18px 24px;background:rgba(0,0,0,0.35);border-radius:12px;border:1px solid rgba(255,204,0,0.25);';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:bold;color:#ffcc00;letter-spacing:0.08em;';
    title.textContent = 'AI SETTINGS';
    panel.appendChild(title);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:20px 28px;align-items:center;justify-content:center;';

    const selectStyle = 'min-width:140px;padding:8px 12px;font-size:13px;font-weight:bold;color:white;background:#1e2740;border:2px solid #ffcc00;border-radius:8px;cursor:pointer;outline:none;';
    const labelStyle = 'font-size:12px;font-weight:bold;color:#ffcc00;letter-spacing:0.04em;';

    const diffRow = document.createElement('div');
    diffRow.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const diffLabel = document.createElement('label');
    diffLabel.style.cssText = labelStyle;
    diffLabel.textContent = 'LEVEL';
    const diffSelect = document.createElement('select');
    diffSelect.style.cssText = selectStyle;
    [
      { id: AI_DIFFICULTY.EASY, name: 'Easy' },
      { id: AI_DIFFICULTY.MID, name: 'Mid' },
      { id: AI_DIFFICULTY.HARD, name: 'Hard' }
    ].forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.name;
      if (opt.id === this._selectedAiDifficulty) option.selected = true;
      diffSelect.appendChild(option);
    });
    diffSelect.addEventListener('change', () => {
      this._selectedAiDifficulty = diffSelect.value;
      if (this.onAiDifficultyChange) this.onAiDifficultyChange(diffSelect.value);
    });
    diffRow.appendChild(diffLabel);
    diffRow.appendChild(diffSelect);
    controls.appendChild(diffRow);

    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const typeLabel = document.createElement('label');
    typeLabel.style.cssText = labelStyle;
    typeLabel.textContent = 'FIGHTER';
    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = selectStyle;
    const randomOpt = document.createElement('option');
    randomOpt.value = 'random';
    randomOpt.textContent = 'Random';
    if (!this._selectedAiType || this._selectedAiType === 'random') {
      randomOpt.selected = true;
    }
    typeSelect.appendChild(randomOpt);
    this._groupCharactersByClass(characters).forEach((group) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      group.entries.forEach(({ char }) => {
        const option = document.createElement('option');
        option.value = char.type;
        option.textContent = char.name || char.type;
        if (char.type === this._selectedAiType) option.selected = true;
        optgroup.appendChild(option);
      });
      typeSelect.appendChild(optgroup);
    });
    typeSelect.addEventListener('change', () => {
      this._selectedAiType = typeSelect.value;
      if (this.onAiTypeChange) this.onAiTypeChange(typeSelect.value);
    });
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(typeSelect);
    controls.appendChild(typeRow);

    panel.appendChild(controls);

    const aiSlot = this._slots?.[1];
    if (aiSlot) {
      panel.appendChild(this._createSlotColorRow(1, aiSlot));
    }

    return panel;
  }

  _characterBlurb(type) {
    const blurbs = {
      [CHARACTER_TYPES.LIGHT]: {
        role: 'LIGHT · Poke',
        text: 'Fast fried shrimp. Hot Oil Splash projectile for mid-range pressure. Lightest normals, highest mobility in class.'
      },
      [CHARACTER_TYPES.WASABI]: {
        role: 'LIGHT · Zone',
        text: 'Green heat drop. Lobs a Wasabi blob that leaves a burn puddle. Slightly denser than Tempura; controls space with DoT.'
      },
      [CHARACTER_TYPES.MEDIUM]: {
        role: 'MEDIUM · Counter',
        text: 'Balanced California roll. Baseline stats with a Counter stance that reflects hits. All-rounder for any matchup.'
      },
      [CHARACTER_TYPES.GYOZA]: {
        role: 'MEDIUM · Commit',
        text: 'Pan-fried half-moon. Takoyaki Roll dashes forward with a hard hit. Slightly denser mid — reward reads, punish whiffs.'
      },
      [CHARACTER_TYPES.TAMAGO]: {
        role: 'MEDIUM · Armor',
        text: 'Soft-boiled egg. Stink Cloud wraps you in team-color swirls that burn anyone who stays close. Balanced mid with sticky space control.'
      },
      [CHARACTER_TYPES.HEAVY]: {
        role: 'HEAVY · AoE',
        text: 'Puffy dumpling tank. Ground Pound hops then shockwaves through shields. Best heavy mobility among the heavies.'
      },
      [CHARACTER_TYPES.ONIGIRI]: {
        role: 'HEAVY · Grab',
        text: 'Dense rice ball. Command grab picks up and throws behind — blocked by shield. Slowest, heaviest normals on the roster.'
      },
      [CHARACTER_TYPES.RAMEN]: {
        role: 'HEAVY · Lasso',
        text: 'Steaming ramen bowl. Noodle Lasso snags foes at mid-range and yanks them in — pierces shields. Dense normals, strong setplay.'
      }
    };
    return blurbs[type] || { role: 'FIGHTER', text: 'A sushi-town brawler ready to rumble.' };
  }

  createCharacterCard(character, index, options = {}) {
    const {
      selected = false,
      onClick = null,
      teamColorId = null,
      compact = false,
      cursor = false
    } = options;
    const card = document.createElement('div');
    const cardW = compact ? 88 : 160;
    const cardH = compact ? 110 : 200;
    card.style.cssText = `width:${cardW}px;height:${cardH}px;background:rgba(255,255,255,0.1);border-radius:${compact ? 10 : 15}px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s ease;border:3px solid transparent;position:relative;`;

    const palette = {
      light: { color: '#e8b84a', accent: '#f0a090', shape: '40% 40% 30% 30%' },
      medium: { color: '#f7f2e8', accent: '#ff6a1a', shape: '40px' },
      heavy: { color: '#f0d9a8', accent: '#d4b06a', shape: '50%' },
      wasabi: { color: '#6dff4a', accent: '#2f9e2a', shape: '50% 50% 45% 45%' },
      gyoza: { color: '#e8b86d', accent: '#c9943a', shape: '50% 0 0 50%', clip: 'ellipse(48% 50% at 62% 50%)' },
      onigiri: { color: '#f5f0e6', accent: '#2a2a2a', shape: '8px', clip: 'polygon(50% 4%, 94% 82%, 88% 96%, 12% 96%, 6% 82%)' },
      ramen: { color: '#e8a04a', accent: '#f5d78a', shape: '50%', clip: 'ellipse(50% 42% at 50% 55%)' },
      tamago: { color: '#fff0c8', accent: '#ffb84a', shape: '50%', clip: 'ellipse(48% 55% at 50% 48%)' }
    };
    const look = palette[character.type] || palette.medium;
    const colorHex = look.color;
    const accentHex = look.accent;
    const teamCss = teamColorId ? this._colorCss(teamColorId) : accentHex;
    const blurb = this._characterBlurb(character.type);
    const weight = character.stats?.weight ?? 1;
    const speed = character.stats?.speed ?? 1;
    const jump = character.stats?.jumpForce ?? 14;

    if (selected) {
      card.style.borderColor = teamCss;
      card.style.boxShadow = `0 0 18px ${teamCss}`;
      card.style.transform = 'scale(1.03)';
    } else if (cursor) {
      card.style.borderColor = '#ffffff';
      card.style.boxShadow = `0 0 14px ${teamCss}`;
      card.style.transform = 'scale(1.06)';
    }

    const previewSize = compact ? 40 : 72;
    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = `position:relative;width:${previewSize}px;height:${compact ? previewSize + 4 : 88}px;margin-bottom:${compact ? 4 : 8}px;display:flex;flex-direction:column;align-items:center;`;

    if (teamColorId && !compact) {
      const marker = document.createElement('div');
      marker.style.cssText = `width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:12px solid ${teamCss};margin-bottom:4px;filter:drop-shadow(0 0 4px ${teamCss});`;
      previewWrap.appendChild(marker);
    }

    const preview = document.createElement('div');
    const shapeRadius = look.shape;
    const clipCss = look.clip ? `clip-path:${look.clip};-webkit-clip-path:${look.clip};` : '';
    preview.style.cssText = `width:${previewSize}px;height:${previewSize}px;background:linear-gradient(160deg,${colorHex} 55%,${accentHex} 100%);border-radius:${shapeRadius};box-shadow:0 0 ${compact ? 12 : 30}px ${accentHex};border-bottom:3px solid ${teamCss};${clipCss}`;
    previewWrap.appendChild(preview);

    const name = document.createElement('div');
    name.style.cssText = compact
      ? 'font-size:11px;font-weight:bold;color:white;text-transform:uppercase;text-align:center;line-height:1.1;'
      : 'font-size:18px;font-weight:bold;color:white;text-transform:uppercase;';
    name.textContent = character.name || character.type;

    const stats = document.createElement('div');
    stats.style.cssText = compact
      ? 'font-size:9px;color:#aaa;margin-top:2px;text-align:center;'
      : 'font-size:12px;color:#aaa;margin-top:8px;text-align:center;';
    stats.textContent = compact
      ? `${Math.floor(speed * 10)}/${Math.floor(jump)}`
      : `SPD ${Math.floor(speed * 10)} | JMP ${Math.floor(jump)}`;

    // Hover description popup
    const tip = document.createElement('div');
    tip.style.cssText = [
      'display:none',
      'position:absolute',
      'left:50%',
      'bottom:calc(100% + 10px)',
      'transform:translateX(-50%)',
      'width:220px',
      'padding:12px 14px',
      'background:rgba(12,10,8,0.95)',
      'border:1px solid rgba(255,255,255,0.18)',
      'border-radius:10px',
      'box-shadow:0 8px 28px rgba(0,0,0,0.55)',
      'color:#eee',
      'text-align:left',
      'pointer-events:none',
      'z-index:50',
      'line-height:1.35'
    ].join(';');

    const tipRole = document.createElement('div');
    tipRole.style.cssText = `font-size:11px;font-weight:bold;letter-spacing:0.06em;color:${teamCss};margin-bottom:6px;text-transform:uppercase;`;
    tipRole.textContent = blurb.role;

    const tipName = document.createElement('div');
    tipName.style.cssText = 'font-size:15px;font-weight:bold;color:#fff;margin-bottom:6px;';
    tipName.textContent = character.name || character.type;

    const tipText = document.createElement('div');
    tipText.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:8px;';
    tipText.textContent = blurb.text;

    const tipStats = document.createElement('div');
    tipStats.style.cssText = 'font-size:11px;color:#999;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;';
    tipStats.textContent = `WT ${weight.toFixed(2)} · SPD ${speed.toFixed(2)} · JMP ${jump}`;

    tip.appendChild(tipRole);
    tip.appendChild(tipName);
    tip.appendChild(tipText);
    tip.appendChild(tipStats);
    card.appendChild(tip);

    card.appendChild(previewWrap);
    card.appendChild(name);
    card.appendChild(stats);

    card.addEventListener('click', () => {
      audio.playUiSelect();
      if (onClick) onClick();
    });

    card.addEventListener('mouseenter', () => {
      tip.style.display = 'block';
      if (!selected) {
        card.style.borderColor = teamCss;
        card.style.transform = 'scale(1.05)';
      }
    });

    card.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
      if (!selected) {
        card.style.borderColor = 'transparent';
        card.style.transform = 'scale(1)';
      }
    });

    return card;
  }

  createCountdown() {
    this.clearScreen();
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    
    const count = document.createElement('div');
    count.id = 'countdown';
    count.style.cssText = 'font-size:150px;font-weight:bold;color:white;text-shadow:0 0 50px rgba(255,255,255,0.5);';
    count.textContent = '3';
    
    overlay.appendChild(count);
    this.container.appendChild(overlay);
    this.currentScreen = 'countdown';
    
    return count;
  }

  createVictoryScreen(winner, stats, onRematch, onSelect) {
    // Keep battlefield visible — only clear HUD overlays, then popup options
    this.container.innerHTML = '';
    this.hudElements = {};

    const screen = document.createElement('div');
    screen.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:8%;background:transparent;pointer-events:none;';

    const panel = document.createElement('div');
    panel.style.cssText = 'display:flex;flex-direction:column;align-items:center;background:rgba(10,12,24,0.72);padding:28px 40px;border-radius:16px;border:2px solid rgba(255,204,0,0.45);box-shadow:0 12px 40px rgba(0,0,0,0.55);pointer-events:auto;backdrop-filter:blur(6px);';

    const winnerText = document.createElement('div');
    winnerText.style.cssText = 'font-size:42px;font-weight:bold;color:#ffcc00;margin-bottom:12px;text-shadow:0 0 24px rgba(255,200,0,0.55);letter-spacing:0.04em;';
    winnerText.textContent = `${winner} WINS!`;

    const statsBox = document.createElement('div');
    statsBox.style.cssText = 'margin-bottom:22px;text-align:center;';
    statsBox.innerHTML = stats.map(s => `<div style="color:rgba(255,255,255,0.9);font-size:16px;margin:4px 0;">${s}</div>`).join('');

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;';

    const rematchBtn = this.createButton('REMATCH', onRematch);
    const selectBtn = this.createButton('CHARACTER SELECT', onSelect);

    buttons.appendChild(rematchBtn);
    buttons.appendChild(selectBtn);

    panel.appendChild(winnerText);
    panel.appendChild(statsBox);
    panel.appendChild(buttons);
    screen.appendChild(panel);
    this.container.appendChild(screen);
    this.currentScreen = 'victory';
  }

  createButton(text, onClick) {
    const btn = document.createElement('div');
    btn.style.cssText = 'padding:15px 30px;font-size:18px;font-weight:bold;color:white;background:linear-gradient(135deg,#ff4444,#cc2222);border-radius:10px;cursor:pointer;transition:all 0.2s ease;';
    btn.textContent = text;
    
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 0 20px rgba(255,68,68,0.5)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
    });
    
    btn.addEventListener('click', onClick);
    
    return btn;
  }

  updatePadStatus(count = 0, lines = [], inputMode = INPUT_MODES.KEYBOARD) {
    this._setControllerBadge(count, lines, inputMode);

    const el = this._padStatusEl || this.container.querySelector('#pad-status');
    if (!el) return;

    const n = Math.max(0, count | 0);
    if (inputMode === INPUT_MODES.KEYBOARD) {
      el.style.color = n > 0 ? '#88aaff' : '#667788';
      el.textContent =
        n > 0
          ? `${n} controller${n === 1 ? '' : 's'} detected (switch INPUT to Controllers to use them)`
          : 'No controllers detected · playing with keyboard';
      return;
    }

    if (n <= 0 && (!lines || lines.length === 0)) {
      el.style.color = '#ffaa66';
      el.textContent =
        'No controllers · click this window, then press buttons on each pad';
      return;
    }
    el.style.color = '#22cc44';
    const detail =
      lines && lines.length > 0 ? lines.join(' · ') : `${n} connected`;
    el.textContent = `${detail} · press any button to claim slot · ✓ = active`;
  }

  createPadDebug() {
    let el = this.hudElements.padDebug;
    if (el?.parentNode) el.parentNode.removeChild(el);
    el = document.createElement('pre');
    el.style.cssText =
      'position:absolute;left:8px;bottom:8px;max-width:min(520px,90vw);margin:0;padding:8px 10px;background:rgba(0,0,0,0.75);color:#7cffb2;font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none;z-index:50;border-radius:6px;';
    el.textContent = 'PAD DEBUG…';
    this.container.appendChild(el);
    this.hudElements.padDebug = el;
  }

  clearScreen() {
    this.container.innerHTML = '';
    this._padStatusEl = null;
    this.currentScreen = null;
  }

  showMessage(text, duration = 2000) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:72px;font-weight:bold;color:white;text-shadow:0 0 30px rgba(255,255,255,0.5);';
    msg.textContent = text;
    this.container.appendChild(msg);
    
    setTimeout(() => {
      if (msg.parentNode) {
        msg.parentNode.removeChild(msg);
      }
    }, duration);
  }
}