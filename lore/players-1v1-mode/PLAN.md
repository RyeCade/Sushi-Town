# Players 1v1 Mode Implementation Plan

Add a **Players** option list on character select (`1vAi` | `1v1`). `1vAi` keeps the current single-fighter select + bot. `1v1` shows dual P1/P2 grids, human controls for both, and starts when both have picked. Keyboard layouts are always split per the new bindings.

> **Agent Reminder:** Update this plan document to mark each step as it is completed.

- [x] 1. Constants and control maps
   - [x] a. Add `PLAYER_MODES = { ONE_V_AI: '1vAi', ONE_V_ONE: '1v1' }` (or equivalent) in `src/utils/constants.js`
   - [x] b. Rewrite `PLAYER_CONTROLS.PLAYER1` to: LEFT `KeyA`, RIGHT `KeyD`, JUMP `KeyW`, SHIELD `KeyS`, LIGHT `KeyV`, HEAVY `KeyC` (drop shared arrow/medium/numpad leftovers from P1)
   - [x] c. Rewrite `PLAYER_CONTROLS.PLAYER2` to: LEFT `ArrowLeft`, RIGHT `ArrowRight`, JUMP `ArrowUp`, SHIELD `ArrowDown`, LIGHT `Backslash`, HEAVY `BracketRight` (keep optional SPECIAL/GRAB stubs if still referenced, or omit if unused)
- [x] 2. Character select UI — Players dropdown + dual grids
   - [x] a. Extend `UIManager.createCharacterSelect` with `selectedPlayerMode`, `onPlayerModeChange`, and dual-select callbacks (or a single structured `onSelect` for modes)
   - [x] b. Add a **PLAYERS** `<select>` next to MAP/LOOK with options `1vAi` and `1v1`; on change call `onPlayerModeChange` and rebuild fighter area
   - [x] c. When mode is `1vAi`: keep one grid, subtitle "SELECT YOUR FIGHTER"; card click → existing single `onSelect(index)`
   - [x] d. When mode is `1v1`: two side-by-side sections titled **P1** and **P2**, each with a full character grid; track `selectedP1` / `selectedP2` indices (null until picked)
   - [x] e. Highlight selected card per panel; allow re-pick on the same panel
   - [x] f. When both indices are non-null, invoke start callback with both indices (auto-start)
   - [x] g. Allow same character type for both panels (no uniqueness check)
- [x] 3. Game mode state and start flow
   - [x] a. In `Game.init` / `showCharacterSelect`, store `this.playerMode` defaulting to `1vAi`; pass mode + change handler into UI
   - [x] b. Store `this.selectedCharacter` (P1) and `this.selectedCharacterP2` (1v1 only)
   - [x] c. `onCharacterSelected` for 1vAi: set P1 config, clear P2 human selection, `startGame()`
   - [x] d. Dual-select handler for 1v1: set both configs, `startGame()`
   - [x] e. In `startGame`: if `1vAi`, spawn bot as today (different type from P1); if `1v1`, spawn second human Character with P2 config, **no** `isBot` / `BotController`
   - [x] f. `endMatch` / victory labels: `PLAYER 1` / `PLAYER 2` in 1v1; keep `PLAYER 1` / `BOT` in 1vAi
   - [x] g. `returnToSelect` / rematch preserve `playerMode` and stage/style as today
- [x] 4. Input and HUD polish
   - [x] a. `Game.update`: use bot input only when `botController` exists; else `getPlayer2State(PLAYER_CONTROLS.PLAYER2)`
   - [x] b. Update `createControlsHelp` to show P1 binds; in 1v1 also show P2 binds (compact dual columns)
   - [x] c. HUD labels remain PLAYER 1 / PLAYER 2 (optional: show BOT for P2 in 1vAi only if desired — default keep PLAYER 2)
- [x] 5. Smoke-check
   - [x] a. 1vAi: single grid, bot spawns, P1 uses WASD+V/C
   - [x] b. 1v1: dual grids, same type allowed, both humans move/attack with split keys
   - [x] c. Switching PLAYERS mid-select rebuilds the correct UI without leftover dual/single state
   - [x] d. Rematch and return to select keep mode and still work
- [x] 6. Team colors (follow-on)
   - [x] a. `PLAYER_COLORS` / `PLAYER_COLOR_IDS` in constants; defaults P1 red / P2 blue
   - [x] b. Character accepts `teamColor`; limbs use it; overhead inverted triangle marker
   - [x] c. Color swatches on select (1vAi single row; 1v1 per panel); unique colors enforced
   - [x] d. 1vAi: picking AI’s color reassigns AI (all swatches enabled + AI color hint)
   - [x] e. Docs: PROJECT.md, RESEARCH.md, DECISIONS D7–D8
- [x] 7. AI settings + combat polish (follow-on)
   - [x] a. Easy/Mid/Hard + AI fighter type + AI color on 1vAi select
   - [x] b. Bot meleeRange / walk-in before swing; difficulty settings table
   - [x] c. Hold-jump up-attacks (`jumpHeld` + aerial move kit)
   - [x] d. Heavy knockback retuned to baseKnockback 8
   - [x] e. Ball + curved swoosh FX; wrap body; up-attacks over crown; never under
   - [x] f. Docs: PROJECT.md Phase 12, RESEARCH §10, DECISIONS D9–D11
