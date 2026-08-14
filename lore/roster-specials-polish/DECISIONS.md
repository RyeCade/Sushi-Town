# Decisions: Roster, specials, presentation polish

**Date:** Jul 16 2026

### D1 - [x] Second heavy is Onigiri (denser than Dumpling)
**Context:** Need another heavy without cloning Dumpling.
**Decision:** Onigiri — weight 1.28, speed 0.75, jump 11; slightly stronger/slower normals than Dumpling.
**Rationale:** Differentiates by being the pure tank; Dumpling keeps better mobility + ground-pound AoE.

### D2 - [x] Onigiri special = command grab (shield bypass)
**Context:** Dumpling already has ground-pound AoE; need a distinct heavy tool.
**Decision:** Short lunge → grab box → snap + throw; `bypassShield: true`; CD 11s.
**Rationale:** Classic heavy anti-shield tool; distinct from Gyoza roll and Dumpling pound.

### D3 - [x] Select UI groups by weight class in side-by-side columns
**Context:** Six fighters in a flat row are hard to parse.
**Decision:** LIGHT | MEDIUM | HEAVY columns; fighters stacked under labels; AI dropdown uses optgroups.
**Rationale:** Matches Smash-style weight reading; class map: light/wasabi, medium/gyoza, heavy/onigiri.

### D4 - [x] Gyoza silhouette = solid half-moon (not hollow crescent)
**Context:** User rejected circle and C-crescent; wanted half-moon.
**Decision:** Half-sphere body (flat fold back, curved belly front) + select `clip-path` ellipse.
**Rationale:** Reads as pan-fried gyoza D-shape; still medium-class sphere collider.

### D5 - [x] Onigiri silhouette = large blunted triangle
**Context:** User wanted classic rice-ball shape, not a sphere+cone blob.
**Decision:** 3-sided cone core, rounded tip/corners, nori wrap; blunt triangle clip on select card.
**Rationale:** Instant onigiri read in roster and in-match.

### D6 - [x] Facing turns are Y-axis continuous; never snap on zero-dt sync
**Context:** Turns looked instant; user required Y rotation on direction change.
**Decision:** `applyFacing` only advances yaw when `deltaTime > 0`; post-physics sync uses `dt=0` re-apply only; `TURN_RATE = 11`.
**Rationale:** `Game.update` was snapping turns every frame after physics.

### D7 - [x] Backdrop lanterns candle-flicker independently
**Context:** Background lights felt static.
**Decision:** Per-lantern breathe + multi-sine flicker on PointLight + bulb emissive.
**Rationale:** Warm restaurant mood; desynced rates avoid uniform pulsing.

### D8 - [x] Weight-class peers trade tools, not strict upgrades
**Context:** Wasabi and Gyoza were soft upgrades over Tempura / California.
**Decision:** Nerf Wasabi mobility (keep full-strength puddle); peer Gyoza stats/roll; Onigiri grab risk then reworked to hold → throw behind. Special CDs later shortened to 6s/7s for fun.
**Rationale:** Each class has two playstyles (poke vs zone, counter vs commit, AoE vs grab) without a free win pick.

### D9 - [x] Dodge phases through fighters only while dodging
**Context:** Players wanted invuln dash to pass through opponents, not walk-through always.
**Decision:** Character colliders use `FILTER_CONTACT_PAIRS`; `EMPTY` if either is dodging (or grabbing); else `COMPUTE_IMPULSE`. Never return `null` for char–char pairs.
**Rationale:** `null` from the filter disables contact entirely.

### D10 - [x] Onigiri grab = pick up then throw behind
**Context:** Instant forward toss did not read as a command grab.
**Decision:** `hold` phase snaps target in front; `throwGrabTarget` launches opposite facing.
**Rationale:** Classic heavy anti-turtle fantasy; body phase during grab avoids bounce.

### D11 - [x] AI uses specials; Random fighter default
**Context:** Bot never set `special`; default AI was always California.
**Decision:** Kit-aware `wantsSpecial` in `BotController`; `selectedAiType = 'random'` + `_resolveAiFighterConfig`.
**Rationale:** Sparring variety and specials are core to the roster.
