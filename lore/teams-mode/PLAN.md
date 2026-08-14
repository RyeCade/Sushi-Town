# Teams Mode Implementation Plan

Add **2v2** and **3v1** player modes: preset team slots by shared color, no friendly damage/grabs/body collisions, bots ignore allies, match ends on last team standing. Keyboard uses 2 humans + CPU fill; pads use existing join/CPU-fill flow.

> **Agent Reminder:** Update this plan document to mark each step as it is completed.

- [x] 1. Constants and helpers
   - [x] a. In `src/utils/constants.js`, add `PLAYER_MODES.TEAM_2V2 = '2v2'` and `PLAYER_MODES.TEAM_3V1 = '3v1'`
   - [x] b. Extend `getMatchPlayerCount` to return `4` for both team modes
   - [x] c. Add `isTeamMode(mode)` returning true for 2v2 / 3v1
   - [x] d. Extend `isKeyboardPlayerMode` to include both team modes (D6)
   - [x] e. Add `getTeamSlotIndices(mode)` → e.g. 2v2: `[[0,1],[2,3]]`, 3v1: `[[0],[1,2,3]]`
   - [x] f. Add `getTeamMateSlotIndices(mode, slotIndex)` helper for recolor propagation
- [x] 2. Teammate identity API
   - [x] a. Add `areTeammates(a, b)` in a small shared place (prefer `src/utils/constants.js` or thin `src/combat/teams.js`) comparing `a?.teamColor === b?.teamColor` with null-safe false when either missing
   - [x] b. Optionally add `Character.isTeammate(other)` wrapping the helper
- [x] 3. Slot init and color rules (`src/Game.js`)
   - [x] a. In `_initSlots`, when `isTeamMode`: force 4 slots; apply preset default colors (2v2: red/red/blue/blue; 3v1: red/blue/blue/blue using `DEFAULT_SLOT_COLORS` / team A+B ids)
   - [x] b. Keyboard team mode: slots 0–1 human joined (same as keyboard FFA 2); slots 2–3 CPU (`human: false`, `joined: true` or false-until-start consistent with FFA empty→CPU on start — match existing FFA CPU fill: unjoined empty become CPU at `startGame`)
   - [x] c. Pad team mode: same join rules as FFA 4 (P1 joined; others open until pad join; empty = CPU at start)
   - [x] d. Gate `_ensureUniqueColors` / `_freeColorIds` / `_nextFreeColor`: **only** when `!isTeamMode(this.playerMode)`
   - [x] e. In team mode, `_ensureTeamColors(slots)`: each team’s slots share one colorId; opposing teams differ
   - [x] f. `onSlotUpdated`: if team mode and `patch.colorId` set, assign that colorId to all teammate slots; if it collides with enemy team color, either reject or reassign enemy via `_nextFreeColor` for the enemy team as a unit (prefer: pick color, if enemy has it move enemy team to next free color not used by any team)
   - [x] g. Menu color nav (`_applySlotMenuNav` color branch): in team mode cycle all colors except the enemy team’s current color; on change propagate to teammates (do not use `_freeColorIds` unique list)
   - [x] h. `onInputModeChanged` / `onPlayerModeChanged`: keep team modes valid on keyboard (no forced fallback)
   - [x] i. `startGame`: stop calling `_ensureUniqueColors` for team modes; keep `_ensureTeamColors` instead so spawn colors match teams
- [x] 4. Character select UI (`src/ui/UIManager.js`)
   - [x] a. Add **2v2** and **3v1** to PLAYERS options for both keyboard and pad lists
   - [x] b. Color swatches in team mode: do not disable colors merely because a teammate has them; disable (or treat as enemy-only) the opposing team’s current color
   - [x] c. Optional polish: small “TEAM A / TEAM B” (or “SOLO / TEAM”) label on slot cards from `getTeamSlotIndices`
   - [x] d. Hints: keyboard 2v2/3v1 text notes P1+P2 human, others CPU; pad notes join + team colors
- [x] 5. Combat friendly-fire off (`src/combat/CombatSystem.js`)
   - [x] a. `checkAllCollisions`: skip when `areTeammates(attacker, defender)`
   - [x] b. Projectile loop (~652): skip teammates of `p.owner`
   - [x] c. `_updatePuddles` burn loop (~825): skip teammates of `puddle.owner`
   - [x] d. `applyGroundPoundAoe` (~502): skip teammates
   - [x] e. `applyRollHit` (~1004): skip teammates
   - [x] f. `applyGrabHit` (~1052): skip teammates
   - [x] g. `applyStinkCloudTick` (~1241): skip teammates
   - [x] h. Lasso hit (~1406): skip teammates
   - [x] i. Audit any other `for (const target of this.characters)` hit paths and apply the same skip (counter-success on projectiles may still “eat” ally projectiles or not — **skip ally as target** so ally projectiles pass through without counter/damage)
- [x] 6. Physics: no body collisions between teammates (`src/Game.js` `physicsHooks`)
   - [x] a. In `filterContactPair`, when both `charA` and `charB` exist and `areTeammates(charA, charB)`, return `RAPIER.SolverFlags.EMPTY`
   - [x] b. Keep existing dodge/grab/lasso phase rules for non-teammates
- [x] 7. Bots and match end
   - [x] a. `BotController.findTarget`: skip `areTeammates(this.player, char)` (D2)
   - [x] b. `Game.checkMatchEnd`: compute alive characters; end when alive length is 0, or all alive share one `teamColor` (D1)
   - [x] c. `endMatch`: victory label uses team color name or “TEAM (color)” / “PLAYER n” for solo; if multiple alive on winning team, victory pose/confetti on all living winners (or primary lowest slot — prefer all living winners pose)
   - [x] d. Pass a sensible `winnerSlotIndex` (lowest alive index on winning team) into existing UI, or extend victory string to team name
- [x] 8. Smoke-check
   - [x] a. 2v2 pad: two pairs share colors; teammates phase through and cannot damage/grab each other; enemies work as FFA
   - [x] b. 3v1: solo vs three; three share color; last team standing ends match when solo dies or majority wiped
   - [x] c. Keyboard 2v2/3v1: P1+P2 human, CPU fill remaining; bots only chase enemies
   - [x] d. FFA 3/4 still unique colors and individual last-stock win
   - [x] e. Switching PLAYERS / INPUT rebuilds slots and colors without stuck unique/team state
   - [x] f. Rematch preserves team mode
