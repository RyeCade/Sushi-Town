# Hazard Mode Implementation Plan

Optional stage hazards toggled from character select (Off by default). When On, each match randomly picks a hazard **kind** and randomizes **positions**.

> **Agent Reminder:** Update this plan document to mark each step as it is completed.

- [x] 1. Design lock-in
   - [x] a. Toggle on select: Hazards Off (default) / On
   - [x] b. Hazard kinds: steam vent (telegraph → up-blast) + falling comet (ground ring → fall → impact)
   - [x] c. Gentle competitive-safe values (small %, soft KB, per-player hit cooldown)
- [x] 2. Constants + system
   - [x] a. Add `HAZARD_KINDS` + `HAZARDS` (STEAM_VENT, FALLING_COMET) in `constants.js`
   - [x] b. Create `src/hazards/HazardSystem.js` (pick kind, spawn, update, hit, dispose)
   - [x] c. Steam vent cycle: idle → warn → active
   - [x] d. Comet cycle: warn (shadow) → fall → impact → cleanup
- [x] 3. Random placements (not fixed per-map coords)
   - [x] a. Collect platform surfaces from live `stage.platforms` each match
   - [x] b. Vents: 2 random tops with min separation
   - [x] c. Comets: random impact X + surface top each spawn; interval re-rolls
- [x] 4. UI + Game state
   - [x] a. Hazards dropdown on character select next to MAP
   - [x] b. `Game.hazardsEnabled` + rematch/return-to-select memory
   - [x] c. Tick system in fight loop; dispose on match clear
- [x] 5. Juice + docs
   - [x] a. Vent / comet VFX + `playHazardWarn` / `playHazardBurst` SFX
   - [x] b. PROJECT.md runtime lessons
   - [x] c. Build verify
- [x] 6. Follow-up polish (post-MVP, not blocking)
   - [ ] a. AI avoid active vent columns / comet shadows on Hard
   - [ ] b. Additional kinds (oil slick, wave push, lantern drop)
