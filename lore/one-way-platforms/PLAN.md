# One-Way (Jump-Through) Platforms

Make elevated platforms in every stage **jump-through from below** while remaining **solid from the top**. Ground floor stays solid. Tap-jump-or-rise from below passes through; fall-onto-top lands. Implementation uses Rapier's `PhysicsHooks.filterContactPair` per-platform-pair and a per-character pre-step feet Y for crossing detection.

> **Agent Reminder:** Update this plan as steps complete.

- [x] 1. Geometry & state hooks
  - [x] a. Expose `Character._halfHeight` once in `createBody` (LIGHT cuboid y-extent 0.75, MEDIUM ball radius 0.5, HEAVY cuboid 0.5)
  - [x] b. Have `Game.createGround` accept `{ oneWay }` and tag the resulting collider with `RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS`
  - [x] c. Maintain `Game.platformsByHandle: Map<bodyHandle, { top, isOneWay }>` populated in `createGround`; cleared by `resetPhysicsWorld`
- [x] 2. Stage wiring
  - [x] a. Add `{ oneWay }` option to `Stage.addPlatform`
  - [x] b. Pass `{ oneWay: true }` for every thin (height === THIN) elevated platform across all 4 stage builders; keep ground floor (height 1) solid
- [x] 3. Smash-style contact filter
  - [x] a. Snapshot each character's pre-step feet Y (`body.translation().y - _halfHeight`) before `world.step`
  - [x] b. Pass `physicsHooks = { filterContactPair }` into `world.step(eventQueue, hooks)`
  - [x] c. Filter logic per character–platform pair:
    - `feetY >= top`: solid except when `prevFeetY < top && vy > 0` (rising through) → EMPTY
    - `prevFeetY >= top && feetY < top`: solid (falling onto top)
    - otherwise: empty (pass through)
- [x] 4. Verify
  - [x] a. Update PROJECT.md notes calling out one-way soft platforms (lines 446/478/481 area)
  - [x] b. Run `npm run build` (no Rapier init errors; vite compiled clean)
- [ ] 5. Playtest gate (user)
  - [ ] a. Confirm jump-up passes through low platforms, fall-onto-top lands solidly, ground floor unchanged
  - [ ] b. Confirm knockback hits still send characters through ceilings of platforms and back down through them
</content>
