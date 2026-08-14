# Plan: Roster, specials, presentation polish

**Status:** Implemented (Jul 16 2026)

## Goals
1. Expand roster with a second heavy and document full cast + specials
2. Select screen readable by weight class
3. Food silhouettes match fantasy (gyoza half-moon, onigiri triangle)
4. Direction changes rotate on Y cleanly
5. Backdrop lanterns feel alive (candle flicker)
6. Capture balance findings for a later pass

## Steps
1. [x] Balance audit of existing 5-fighter roster
2. [x] Add Onigiri (stats, scales, mesh, command-grab special)
3. [x] Character select: group by LIGHT / MEDIUM / HEAVY
4. [x] Columns side-by-side (not stacked rows of classes)
5. [x] Gyoza solid half-moon mesh + select clip
6. [x] Onigiri blunted triangle mesh + select clip
7. [x] Fix Y-turn snap (`applyFacing` zero-dt path)
8. [x] Lantern per-light candle flicker
9. [x] Update PROJECT.md, RESEARCH.md, this lore folder

## Follow-ups
- [x] Balance pass: Wasabi puddle/CD, Gyoza roll, Onigiri grab risk (Jul 16 weight-class pass)
- [x] Bot uses specials intentionally + Random AI fighter default (Jul 16 AI polish)
- [x] Onigiri grab hold → throw behind; mesh nori wrap; select hover blurbs
- [x] Dodge phase-through only while dodging; shorter dodge; shorter special CDs
- [ ] Optional: shared “weight class” helper used by both UI and AI labels

## Key files
- `src/utils/constants.js`
- `src/moves/MoveSet.js`
- `src/Game.js`
- `src/characters/Character.js`
- `src/combat/CombatSystem.js`
- `src/ui/UIManager.js`
- `src/stages/Stage.js`
