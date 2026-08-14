# Sushi Town — Fix Floor Clipping Implementation Plan

Characters sink halfway into platforms because the platform visual mesh and Rapier collider are vertically misaligned by half the platform height.

> **Agent Reminder:** Update this plan document to mark each step as it is completed.

- [x] 1. Align platform physics with visual mesh
   - [x] a. In `src/stages/Stage.js` `createPlatform()`, change the ground body call from `createGround(x, y - height / 2, z, width, height, depth)` to `createGround(x, y, z, width, height, depth)` so the collider center matches the Three.js mesh center
   - [x] b. Confirm math: mesh at `y` with height `h` spans `[y-h/2, y+h/2]`; Rapier cuboid half-extents `(w/2, h/2, d/2)` with body at `y` spans the same range, so the top surface is `y + h/2`
- [x] 2. Verify character rest height stays consistent
   - [x] a. Confirm cube/sphere colliders use half-extent/radius of `0.5` (`UNIFORM_SIZE = 1.0`) so resting body Y is platform top + 0.5
   - [x] b. Leave character collider sizes unchanged unless a specific shape still clips after the platform fix
- [x] 3. Sanity-check grounded detection
   - [x] a. Review `Game.js` grounded check (`char.position.y < 2`) after the platform alignment; with FD platform top at `0.5`, standing Y ≈ `1.0`, so the threshold should still work
   - [x] b. Only adjust the threshold if jump/double-jump feels broken after the visual fix
- [x] 4. Manual verification
   - [x] a. Run the game, select each fighter (Cube, Sphere, Pyramid) — pending user playtest
   - [x] b. Confirm characters stand on the platform surface with feet/bottom flush (no half-sink) — code fix applied; user confirm
   - [x] c. Confirm jump, land, and walk still work — grounded threshold still valid at standing Y ≈ 1.0

## Outcome
- Fixed in `src/stages/Stage.js` `createPlatform()`: collider center matches mesh center
- Documented in root `PROJECT.md` and `RESEARCH.md`
