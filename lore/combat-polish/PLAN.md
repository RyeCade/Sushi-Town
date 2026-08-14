# Combat Polish — Plan

**Date:** Jul 15 2026  
**Status:** Complete (implementation + docs)

## Goals

1. Directional shield (face-side only) with HP / break / regen
2. Single attack button: tap light, hold heavy
3. Dodge on C / ]
4. Idle motion + victory pose (face camera, arms up)
5. Knockback-scaled camera shake
6. Remember select settings between rounds
7. Victory UI over live battlefield
8. Team-colored combat FX; remove finger nubs

## Steps

- [x] 1. Single attack button
   - [x] a. Map P1 `V` / P2 `\` to `ATTACK` only
   - [x] b. Input: `attack` + `attackHeld`
   - [x] c. Charge path: release early → light; full charge → heavy
   - [x] d. Bot light tap vs heavy hold timing
- [x] 2. Directional shield + HP
   - [x] a. Front-only block via hit position vs facing
   - [x] b. Hemisphere mesh parented to character
   - [x] c. Shield HP drain / break stun / delayed regen
   - [x] d. Mesh warp, bob, scale by HP, team color
- [x] 3. Dodge
   - [x] a. Bind C / ]
   - [x] b. Grounded dash, iframes, cooldown, `FIGHTER_STATE.DODGE`
- [x] 4. Presentation
   - [x] a. Idle bob/sway
   - [x] b. Victory face camera + arms up
   - [x] c. Victory popup over stage (no full-screen cover)
   - [x] d. Remove finger nubs
- [x] 5. Juice + memory
   - [x] a. Camera shake from knockback
   - [x] b. Team-colored attack/shield/particles
   - [x] c. Remember fighter indices + existing mode/color/stage/AI
- [x] 6. Docs
   - [x] a. PROJECT.md / RESEARCH.md updated
   - [x] b. This plan + DECISIONS.md

## Key files

- `src/characters/Character.js`
- `src/moves/MoveSet.js` (`COMBAT_FEEL`)
- `src/utils/constants.js`
- `src/input/InputManager.js`
- `src/combat/CombatSystem.js`
- `src/Game.js`
- `src/ui/UIManager.js`
- `src/ai/BotController.js`
