# Combat Polish — Decisions

**Date:** Jul 15 2026

### D1 - [x] One attack button (tap light / hold heavy)

**Context:** Separate light (V) and heavy (C) keys; user wanted one button.

**Decision:** Single `ATTACK` key. Press starts charge; release before 0.5s = light; hold to full charge = heavy.

**Rationale:** Matches requested scheme; keeps light/heavy kit without a second key. C freed for dodge.

---

### D2 - [x] Shield only blocks facing direction

**Context:** Omnidirectional bubble felt unfair / unreadable.

**Decision:** Block only if hit origin is on the facing side (`isHitFromFront` + small slack). Visual is a front hemisphere.

**Rationale:** Fairer backstab / cross-up space; mesh still reads as a front guard. Collision fairness is facing test, not mesh shape.

---

### D3 - [x] Shield HP with break + regen

**Context:** Infinite turtling with pure block.

**Decision:** Max HP 60; drain on block; 0 → break stun; regen after delay when not shielding.

**Rationale:** Punishes over-shield without removing the tool. Visual shrink/flash sells the state.

---

### D4 - [x] Dodge on C / ]

**Context:** Wanted a dedicated escape button after consolidating attack.

**Decision:** Grounded side dodge with short iframes + cooldown; uses existing `isInvincible` path.

**Rationale:** Simple, readable, reuses combat invuln. Air dodge deferred.

---

### D5 - [x] Victory UI over battlefield

**Context:** Full-screen victory hid pose and stage.

**Decision:** Transparent overlay + bottom panel; keep characters rendering; animate victory pose in `Game.render`.

**Rationale:** Shows celebration and stage context; options still clickable.

---

### D6 - [x] Victory pose faces camera with arms up

**Context:** Pose was weak / not camera-facing.

**Decision:** `targetYaw = -π/2` (face +Z toward camera); raise arms ~π about Z; skip combat facing retarget while posing.

**Rationale:** Built models face +X; −π/2 is the known “look at camera” yaw used elsewhere in turn logic.

---

### D7 - [x] Remember selections between rounds

**Context:** Rematch kept configs but select UI reset highlights.

**Decision:** Store `selectedIndexP1/P2` (+ existing mode/color/stage/AI) and pass into select UI.

**Rationale:** Faster rematch / re-pick loops.

---

### D8 - [x] Team color on combat FX

**Context:** Yellow/red/cyan FX ignored team identity.

**Decision:** Attack swoosh, shield, and hit particles use `teamColor`.

**Rationale:** Readability in 1v1/1vAi without new palette system.

---

### D9 - [x] Camera shake scales with knockback

**Context:** Hits lacked camera juice.

**Decision:** `Game.addCameraShake` from `applyHit`; intensity from knockback × scale; stronger on shield break / KO.

**Rationale:** Cheap feel win; base cam pose already tracked for stage framing.

---

### D10 - [x] No finger nubs

**Context:** User asked to remove fingers from arms.

**Decision:** Hands are spheres only; finger capsule loop removed.

**Rationale:** Cleaner silhouette for food fighters.
