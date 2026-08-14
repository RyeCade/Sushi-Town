# Four Controllers + Character Customize Decisions

Local multiplayer expansion: up to 4 controllers, per-player character customize on join, P1 owns global match settings.

---

### D1 - [x] Keep 1vAi / 1v1 and add FFA with P1-chosen size

**Context:** North star is up to 4 humans; existing modes must not break.

**Decision:** Extend `PLAYER_MODES` with FFA variants (or mode `ffa` + `ffaSize` 2/3/4). PLAYERS dropdown: `1vAi`, `1v1`, `FFA 2`, `FFA 3`, `FFA 4`.

**Rationale:** Continuity for sparring + dual human; FFA size is an explicit P1 rule.

---

### D2 - [x] Join only on character select

**Context:** Hot-join mid-fight is complex (spawn, stocks, pause).

**Decision:** Controllers join only while `GAME_STATES.CHARACTER_SELECT`. Press A/Start on a free pad to claim the next open human slot and open that player’s customize panel.

**Rationale:** Smash-like CSS flow; simplest correct slice.

---

### D3 - [x] Per-player customize = fighter + color + Ready

**Context:** User asked for a character selection popup when a controller is detected/joins.

**Decision:** Each human slot panel/popup: roster fighter, unique team color, Ready toggle. Match rules stay global (P1-only).

**Rationale:** Clear ownership of cosmetics; Ready is explicit even if P1 can force-start.

---

### D4 - [x] P1 owns all global match settings

**Context:** “P1 can change the settings.”

**Decision:** Only P1 (keyboard/mouse or pad slot 0) may change MAP, STOCKS, HAZARDS, PLAYERS mode/FFA size, AI difficulty/type (1vAi). Other pads only control their own fighter/color/ready.

**Rationale:** Single host avoids conflicting dropdown thrash.

---

### D5 - [x] P1 force-start anytime; empty → AI, unready keep pick

**Context:** When does FFA/multi leave select?

**Decision:**
- P1 can force-start at any time (button or UI Start).
- Unready joined humans still spawn with their current fighter/color (default if never picked).
- Empty slots (no human joined) fill with AI up to the mode’s fighter count.
- Minimum: at least 2 fighters after fill (block start if somehow fewer).

**Rationale:** Party-friendly; doesn’t strand the host waiting on Ready.

---

### D6 - [x] FFA size is P1-chosen 2 / 3 / 4

**Context:** How many slots in FFA.

**Decision:** P1 picks FFA 2, FFA 3, or FFA 4. That is the spawn count; AI fills unjoined slots.

**Rationale:** Explicit party size without always forcing 4 bots.

---

### D7 - [x] Explicit INPUT mode: Keyboard XOR Controllers (supersedes merge)

**Context:** Merging keyboard+pad0 made controllers feel broken (ownership thrash, shield lock from bad axis maps, keyboard stealing). Users asked for a mode switch and keyboard-only 1vAi/1v1.

**Decision:**
- Character select **INPUT** dropdown: `keyboard` | `pad` (`INPUT_MODES` in `constants.js`).
- **Keyboard mode:** fight uses keyboard only; PLAYERS options limited to `1vAi` and `1v1` (FFA hidden / forced off).
- **Controller mode:** fight uses pads only (no keyboard merge); FFA 2/3/4 available; P1–P4 bind by stable `gamepadIndex`.
- Persist mode in `localStorage` (`sushiTown.inputMode`).
- Show live **CONTROLLERS CONNECTED: N** badge on select always.

**Rationale:** Clear mental model; avoids mixed-input bugs; matches party vs solo keyboard play.

---

### D7b - [x] Switch Pro USB via WebHID (macOS Chrome)

**Context:** Two Nintendo Switch Pro Controllers visible to macOS USB stack; Chrome Gamepad API returned empty forever. Pressing buttons did not help.

**Decision:**
- Add `SwitchProHid.js` WebHID driver (VID `0x057e`, PID `0x2009`).
- Virtual pad indices ≥ 100; merge into `InputManager.getLivePads()`.
- One-time `requestDevice` allowlist; then auto `getDevices()` / `connect` / poll reopen — no per-session button once granted.
- Hide allow button when any pad is already live.

**Rationale:** Only reliable path for USB Pro Controllers in Chrome on this Mac; Gamepad API is insufficient alone.

---

### D7c - [x] Pad bind by claimed index; never stick-as-trigger

**Context:** Rebinding pads by connection order at START stole P2’s pad; reading axes 2–5 as triggers locked shield on stick drift.

**Decision:**
- Own slots by `gamepadIndex` from join/claim; re-resolve pad object every frame.
- LT/RT from standard **buttons** 6/7 only (not stick axes).
- Edge buttons: pending map committed in `endFrame`.

**Rationale:** Stable multi-pad ownership and no false shield.

---

### D8 - [x] FFA win = last fighter with stocks > 0

**Context:** Victory condition for multi.

**Decision:** When exactly one character has `stocks > 0` (or is not fully eliminated), that player wins. KO of a stock does not end match until elimination. Update `handleKO` / `endMatch` for N players.

**Rationale:** Standard stock FFA; reuses existing stock system.

---

### D9 - [x] Default colors by slot; unique colors required

**Context:** Team colors already unique for 2P.

**Decision:** Defaults: P1 red, P2 blue, P3 yellow, P4 green. All live slots (human + AI) must have unique colors; picking a taken color reassigns the previous owner (AI flexible; humans get next free or block on other humans — prefer reassign AI first, else next free id).

**Rationale:** Extends existing palette rules.

---

### D10 - [x] Stages need 4 spawn points

**Context:** All stages currently define only 2 `spawnPoints`.

**Decision:** Every stage layout provides 4 spawn positions (spread on main platform / sides). Index by slot 0–3.

**Rationale:** Required for 3–4 player matches without stacking.
