# Four Controllers Implementation Plan

Support up to 4 local players: gamepad join on character select, per-slot fighter/color/Ready customize, P1-only match settings, FFA 2–4 with AI fill, stock FFA win condition.

> **Agent Reminder:** Update this plan document to mark each step as it is completed.

- [x] 1. Constants and slot model
   - [x] a. In `src/utils/constants.js`, extend `PLAYER_MODES` with FFA sizes
   - [x] b. Add `MAX_PLAYERS = 4`, default slot color ids
   - [x] c. Add helper `getMatchPlayerCount` / `isFfaMode` / `isOneVOne` / `isOneVAi`
   - [x] d. P2 keyboard map kept for 1v1 keyboard fallback
- [x] 2. InputManager — 4 gamepad slots
   - [x] a. `getPlayerState(slot, controls, opts)`
   - [x] b. Wrappers `getPlayer1State` / `getPlayer2State`
   - [x] c. `getConnectedPadCount` / `getLivePads`
   - [x] d. Menu A/Start helpers
   - [x] e. `consumeNewlyConnectedSlots` / `snapshotPads`
- [x] 3. Stage spawn points (4 per layout)
   - [x] a. All layouts expanded to 4 spawn points
   - [x] b. Spread left→right on main platform Y
- [x] 4. Game slot state
   - [x] a. `slots[]` model with human/joined/pad/fighter/color/ready
   - [x] b. Mode change rebuilds slots
   - [x] c. P1 always joined; FFA join via pad
   - [x] d. Mode change → UI refresh
   - [x] e. Cosmetics preserved across rematch via slots
- [x] 5. Character select UI — modes and P1 settings
   - [x] a. PLAYERS dropdown includes FFA 2/3/4
   - [x] b. MAP/HAZARDS/STOCKS P1-only
   - [x] c. No auto-start on card click
   - [x] d. START button force-start
   - [x] e. START for all modes
- [x] 6. Character select UI — per-player panels + join
   - [x] a. N slot cards P1–P4
   - [x] b. Pad join claims open slot + customize focus
   - [x] c. Fighter grid + color + Ready
   - [x] d. Click slot to edit; pad Ready for non-P1
   - [x] e. Open-slot prompt
   - [x] f. Poll join on CHARACTER_SELECT in `Game.update`
- [x] 7. Spawn and match start
   - [x] a. Force-start resolves humans + AI fill
   - [x] b. Spawn at `spawnPoints[i]`, playerIndex i+1
   - [x] c. `botControllers[]`
   - [x] d. Bot nearest living target
   - [x] e. clearMatchEntities clears bots
- [x] 8. Fight loop for N players
   - [x] a. Per-slot input / bot input
   - [x] b. HUD loop all players
   - [x] c–d. KO → last stocks > 0 wins
   - [x] e. Victory labels PLAYER/CPU N
   - [x] f. CombatSystem N-way (unchanged)
- [x] 9. HUD for 3–4 players
   - [x] a–b. `createHUD(stockCount, labels[])` + indexed updates
- [x] 10. Controls help and polish
   - [x] a. Multi help text
   - [x] b. Disconnect safe (no crash)
   - [x] c. Rematch preserves mode/slots
- [x] 11. Docs
   - [x] a. PROJECT.md Phase 21
   - [x] b. Plan marked complete
- [x] 12. Input mode + Switch Pro reliability (Phase 22)
   - [x] a. `INPUT_MODES` Keyboard | Controllers; keyboard limits PLAYERS to 1vAi/1v1
   - [x] b. Controller count badge on character select
   - [x] c. Exclusive pad-only / keyboard-only fight paths (no merge)
   - [x] d. `SwitchProHid.js` WebHID for USB Switch Pro (macOS Chrome Gamepad API gap)
   - [x] e. One-time allow + auto-reopen granted devices (no button every session)
   - [x] f. Trigger axes footgun fixed; bind by `gamepadIndex`
   - [x] g. PROJECT.md / RESEARCH.md / DECISIONS updated

## Key files

- `src/utils/constants.js`
- `src/input/InputManager.js`
- `src/input/SwitchProHid.js`
- `src/stages/Stage.js`
- `src/Game.js`
- `src/ui/UIManager.js`
- `src/ai/BotController.js`

## Out of scope

- Teams mode
- Mid-match hot-join
- Full gamepad UI navigation of dropdowns
- Online multiplayer
- Time / KO-count modes
- Skipping first-time WebHID permission (browser-enforced)

## Related docs

- Decisions: `lore/four-controllers/DECISIONS.md` (D7 / D7b / D7c)
- PROJECT.md Phase 21–22
- RESEARCH.md Phase 22 lessons
- Prior multi: `lore/players-1v1-mode/`
