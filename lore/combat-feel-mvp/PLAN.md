# Sushi Town — Combat Feel MVP Implementation Plan

Vertical slice for **Sushi Town** to make 1v1 combat feel fair and fun before expanding to gamepad, multiplayer (2–4p + modes), and specials. Hybrid physics (Rapier ground/collision + custom knockback/hitstun/DI), data-driven hitboxes, per-character frame data, FD only, minimal juice.

> **Agent Reminder:** Update this plan document to mark each step as it is completed.

- [x] 1. Capture baseline combat gaps
   - [x] a. Confirm current attack path: `Character.performAttack` + visible attack meshes + `CombatSystem.checkHitboxCollision` (Three.Box3)
   - [x] b. Confirm current shield path: `isShielding` fully blocks damage with no pushback/stun
   - [x] c. Confirm grounded path: simplified `position.y < 2` (or equivalent) and jump/double-jump/air control interactions
   - [x] d. Confirm multi-hit risk: attacks re-apply while visual is visible with no hit-once or hitlag
   - [x] e. Note files in scope: `src/characters/Character.js`, `src/combat/CombatSystem.js`, `src/utils/constants.js`, `src/Game.js` (only as needed)
- [x] 2. Introduce minimal exclusive combat states
   - [x] a. Add state gating for at least: actionable (idle/move), attack, hitstun, shield, dead (flags or small enum — not a full FSM library)
   - [x] b. Block movement/attacks while in hitstun or dead
   - [x] c. Block attacks while shielding (or define explicit shield-cancel rules if any)
   - [x] d. Ensure attack state ends when `attackDuration` completes and cooldown still applies
- [x] 3. Data-driven hitboxes and hurtboxes
   - [x] a. Define a move data shape: startup frames, active frames, endlag, damage, base knockback, knockback angle, hitbox offset/size
   - [x] b. Put shared light/medium/heavy move definitions in a data module (use empty `src/moves/` or co-locate under combat if simpler)
   - [x] c. Attach a body hurtbox (center + size) on `Character` separate from decorative attack meshes
   - [x] d. Drive collision from hitbox data + active window, not from “mesh is visible”
   - [x] e. Keep optional debug draw of hitbox/hurtbox (off by default) if cheap
- [x] 4. Per-character frame data
   - [x] a. Keep one shared move kit (light/medium/heavy) for MVP
   - [x] b. Override startup/active/endlag/damage/base knockback (and hitbox size if needed) per Cube / Sphere / Pyramid
   - [x] c. Align overrides with character fantasy: Cube slower/harder, Sphere faster/weaker, Pyramid middle
   - [x] d. Remove or stop trusting duplicate size/stats only in `Game.characterConfigs` where they disagree with `Character.getStats()`
- [x] 5. Hit once, hitlag, and hitstun
   - [x] a. Track which defenders a given attack instance has already hit; no re-hit until a new attack starts
   - [x] b. On hit, apply brief hitlag (freeze attacker + defender timers/visuals for a few frames)
   - [x] c. Apply hitstun duration scaled by knockback strength (or fixed tiers for light/medium/heavy)
   - [x] d. During hitstun, ignore attack/jump/move input except optional DI (step 6)
   - [x] e. Clear attack active state cleanly so stale hitboxes cannot land after endlag
- [x] 6. Knockback formula and directional influence (DI)
   - [x] a. Keep hybrid model: Rapier for gravity/platform collision; set linear velocity for knockback impulses
   - [x] b. Standardize formula: base knockback × damage scaling × weight factor, with fixed launch angle from move data
   - [x] c. While in hitstun/launch, allow limited horizontal DI from left/right input
   - [x] d. Cap DI so it helps survival but does not nullify knockback
   - [x] e. Preserve Z lock (`enabledTranslations` / force `z = 0`) when applying velocities
- [x] 7. Grounded detection and jump/land feel
   - [x] a. Replace `y < 2` grounded check with a downward raycast or Rapier contact/ground query against platforms
   - [x] b. Reset double jump on true land; clear grounded only when leaving contact / in air
   - [x] c. Fix broken air-down behavior tied to jump input while airborne (current “fast fall” on jump is incorrect)
   - [x] d. Keep walk / air mobility / double jump using existing constants unless playtest requires retune
   - [x] e. Verify FD platform top (~0.5) and fighter rest center (~1.0) still match after raycast thresholds
- [x] 8. Fairer shield
   - [x] a. Keep hold-to-shield input (`inputState.shield`)
   - [x] b. On blocked hit: no damage (or optional tiny chip later — default no damage for MVP), apply shield pushback to defender
   - [x] c. Do not grant full invulnerability without feedback — show a simple shield visual (bubble/tint)
   - [x] d. Optional light shieldstun so attacker/defender cannot ignore the exchange completely
   - [x] e. Leave shield break / stamina for a later pass unless trivial
- [x] 9. Wire combat loop in Game update
   - [x] a. Order update: input → state/timers → physics step → mesh sync → hit detection → apply hits → blast zones / stocks
   - [x] b. Ensure `CombatSystem.checkAllCollisions` / `applyHit` use new hit-once + hitstun path
   - [x] c. Update HUD damage/stocks only when values change (existing UI is fine)
   - [x] d. Touch stage dispose/rematch cleanup only if it blocks playtesting the feel slice
- [x] 10. AI sparring partner (barely competent)
   - [x] a. Keep bot simple: approach when far, attack in range, occasional shield
   - [x] b. Do not invest in advanced punish/edgeguard for MVP
   - [x] c. Ensure bot respects hitstun/shield so it is not immune to new systems
- [ ] 11. Playtest checklist (done criteria)
   - [ ] a. Light can start short juggles / confirm multi-hit spam is gone
   - [ ] b. Slight DI changes launch survival at high %
   - [ ] c. Shield reduces/blocks and pushes without pure invuln spam feeling broken
   - [ ] d. Jump, land, and double jump feel clean on FD
   - [ ] e. Stocks/KO still work; respawn invuln still works
   - [ ] f. Cube vs Sphere vs Pyramid frame differences are noticeable
- [ ] 12. Document completion and handoff
   - [ ] a. Mark this plan complete and note residual bugs in PROJECT.md known follow-ups
   - [ ] b. Point next work at post-MVP order: gamepad → multi (2–4p + modes) → specials/grab/dash

## Out of scope for this plan

- Specials, grab, dash, chargable smash, tilt angles as separate moves
- Gamepad API as primary input
- Local 2–4 player slots, FFA/teams mode select
- Multi-platform stages (Battlefield/Fountain) as defaults
- SFX/music, bloom, chromatic KO polish beyond existing particles/shake
- Full fighter FSM library, training dummy mode, deep AI

## Post-MVP roadmap (reference only)

1. Gamepad-first + keyboard
2. Multiplayer scaffolding (up to 4 players, AI fill empty slots)
3. Selectable modes: 1v1, free-for-all, teams
4. Specials and remaining documented systems (grab, dash, fast-fall as designed, etc.)

## Related docs

- Decisions: `lore/combat-feel-mvp/DECISIONS.md`
- Design: `PROJECT.md`
- Research: `RESEARCH.md`

## Implementation notes (2026-07-15)

- Project title: **Sushi Town** (see `index.html`, select UI, `PROJECT.md`)
- New: `src/moves/MoveSet.js` — base moves + per-character scales
- `FIGHTER_STATE` enum in `constants.js`
- Character: hitstun/hitlag freeze, DI, shield bubble, Rapier raycast grounded
- CombatSystem: AABB hitbox vs hurtbox, hit-once per attack instance
- Bot idles during hitstun/hitlag
