# Hazard Mode Decisions

### D1 - [x] Toggle, not always-on

**Context:** Hazards can frustrate learning combat feel.

**Decision:** Character-select **HAZARDS** Off (default) / On. Rematch preserves choice.

**Rationale:** Competitive vs party without duplicating every map.

---

### D2 - [x] Two kinds, random per match

**Context:** Fixed single hazard type gets stale; player asked for vents **or** comets.

**Decision:** On enable, `HazardSystem` randomly picks `steam_vent` or `falling_comet` (50/50). One kind per match only (not both at once).

**Rationale:** Variety without stacking chaos; rematch re-rolls kind.

---

### D3 - [x] Soft competitive values

**Context:** Multi-hit death traps ruin stocks.

**Decision:**
- Vent: ~4% damage, soft up-KB, ≥0.55s warn, ~1.1s per-player hit cooldown
- Comet: ~7% damage, moderate outward/up KB, ≥0.7s ground telegraph, ~1.0s hit cooldown
- Both respect invuln / dead via `takeHit`

**Rationale:** Chaos without free KOs at low %.

---

### D4 - [x] Random positions every match (not fixed STAGE_HAZARDS)

**Context:** Fixed coords felt repetitive; player asked for random spots each round.

**Decision:** Drop static per-map coordinate tables. Sample from live stage platforms:
- Vents: random surface top + X within platform half-width (min separation)
- Comets: random X in stage bounds; impact Y from highest surface under X

**Rationale:** Works for all maps (including future ones) without re-authoring placements.

---

### D5 - [x] Hits go through Character.takeHit

**Context:** Separate damage path would ignore shield, invuln, hitstun.

**Decision:** Hazards call `char.takeHit(damage, knockback, …)` and optional `CombatSystem.spawnHitEffect`.

**Rationale:** One combat authority; shield break / counter / iframes stay consistent.

---

### D6 - [x] Comet telegraph is ground-first

**Context:** Falling objects without warning feel unfair.

**Decision:** Orange ring on impact surface pulses during warn phase; comet mesh only appears when fall starts.

**Rationale:** Readable dodge window; matches Smash-style shadow tells.
