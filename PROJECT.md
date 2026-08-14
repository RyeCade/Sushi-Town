# Sushi Town - Game Design Document

**Game title:** Sushi Town  
**Package:** `sushi-town`  
**Repo folder:** `sushi_town`

## 1. Concept & Vision

**Sushi Town** is a browser-based 3D platform fighter inspired by Super Smash Bros. 2–4 players battle on floating platforms, using attacks and specials to knock opponents off the stage. The game emphasizes aerial mobility, knockback-based combat, and chaotic fun. Art direction is **food fighters only** (tempura, California roll, dumpling, wasabi, gyoza, onigiri) with stylized limbs, square face plate, and procedural body motion — not realistic models unless explicitly requested.

**Core Feel:** Fast, floaty, and explosive. Every hit should feel consequential with escalating knockback as damage increases.

---

## 2. Technical Architecture

### Stack
- **Rendering:** Three.js (WebGL)
- **Physics:** Rapier (WebAssembly, @dimforge/rapier3d)
- **Build Tool:** Vite
- **Input:** Keyboard + Gamepad API + WebHID (Switch Pro USB fallback)
- **Language:** JavaScript (ES modules)

### Project Structure
```
sushi_town/
├── index.html                 # Title: Sushi Town
├── package.json               # name: sushi-town
├── vite.config.js             # dev server port 3000
├── start-game.sh              # starts Vite + opens http://localhost:3000
├── SushiTown.command          # macOS double-click launcher (drag to Desktop)
├── PROJECT.md
├── RESEARCH.md
├── lore/
│   ├── combat-feel-mvp/
│   ├── combat-polish/
│   ├── fix-floor-clipping/
│   ├── hazard-mode/
│   ├── koi-pond-background/
│   ├── one-way-platforms/
│   ├── players-1v1-mode/
│   └── roster-specials-polish/
└── src/
    ├── main.js                # Entry point, game loop
    ├── Game.js                # Core game state manager
    ├── input/
    │   ├── InputManager.js     # Keyboard + Gamepad API + WebHID bridge
    │   └── SwitchProHid.js     # Nintendo Switch Pro via WebHID (USB Mac/Chrome)
    ├── physics/
    │   └── PhysicsWorld.js    # Legacy helpers (world lives on Game)
    ├── characters/
    │   └── Character.js       # Food mesh, body motion, combat, charge
    ├── combat/
    │   └── CombatSystem.js    # Hit detection, knockback apply, VFX
    ├── hazards/
    │   └── HazardSystem.js    # Optional steam vents / falling comets
    ├── moves/
    │   └── MoveSet.js         # Frame data + per-character scales
    ├── stages/
    │   └── Stage.js           # Maps, stone ground, wood platforms, backdrop
    ├── ui/
    │   └── UIManager.js       # Select, HUD, victory
    ├── ai/
    │   └── BotController.js   # AI + heavy charge hold
    ├── audio/
    │   └── AudioManager.js    # Procedural SFX + music
    └── utils/
        └── constants.js       # States, controls, combat, hazards, stocks
```

### Local launcher (macOS)
- **`SushiTown.command`** → runs `start-game.sh` (loads **nvm** so Finder double-click finds `npm`)
- Opens `http://localhost:3000` when Vite is ready; if already running, just reopens the URL
- Drag the `.command` file to Desktop for a one-click start

---

## 3. Game Mechanics

### Damage & Knockback System (Smash-style)
- Each player has a **damage percentage** (starts at 0%)
- Taking hits increases damage %
- Higher damage = more knockback received
- **Knockback formula:** `knockback = baseKnockback * (1 + damage/100) * weightFactor`
- KO occurs when player is knocked past the **blast zone**

### Movement
| Action | Speed/Force |
|--------|-------------|
| Walk | 5 units/s |
| Dash | 12 units/s (initial), decays |
| Jump | 15 units impulse |
| Double Jump | 12 units impulse |
| Air Mobility | 6 units/s horizontal control |
| Fast Fall | 20 units/s (1.5x gravity) |
| Shield | Front-only block; HP/break/regen (see §3 Shield & dodge) |
| Dodge | Grounded iframes dash |

### Controls (Player 1) — always split (both 1vAi and 1v1)
| Action | Key |
|--------|-----|
| Move | A / D |
| Jump | W |
| Attack (tap light / hold heavy) | **V** |
| Dodge | **C** |
| Special | **Left Shift** (per-class special) |
| Shield | S |
| Grab | G *(input exists; combat grab is Onigiri special only)* |

### Controls (Player 2 / human local)
| Action | Key |
|--------|-----|
| Move | Arrow Left / Right |
| Jump | Arrow Up |
| Attack (tap light / hold heavy) | **\\** (`Backslash`) |
| Dodge | **]** (`BracketRight`) |
| Special | Numpad 0 *(stub)* |
| Shield | Arrow Down |
| Grab | Numpad . *(stub)* |

In **1vAi**, P2 is a bot (`BotController`); keyboard P2 binds still apply when not bot-driven.

### Attack aiming
| Input | Result |
|-------|--------|
| Tap attack (V / `\\`) | Light strike (release before charge finishes) |
| Hold attack 0.5s | Heavy strike (auto-fires at full charge) |
| **Hold jump (W / ↑) + Attack** | Up-aimed strike (aerial kit: higher hitbox, steeper knockback) |

`jumpHeld` and `attackHeld` are continuous key-hold flags. Single attack button: charge path starts on press; early release = light, full charge = heavy.

### Shield & dodge
| System | Behavior |
|--------|----------|
| Shield direction | Blocks **only hits from facing side** (front bubble mesh) |
| Shield HP | Max 60; drains on block (`damage × 1.35`); shrinks/flashes as HP drops |
| Shield regen | After 0.85s off-shield, regen ~10 HP/s |
| Shield break | 0 HP → stun (~1.35s) + reduced launch; then partial HP restore |
| Dodge | Grounded side dash, iframes ~0.18s, duration ~0.28s, cooldown ~0.55s |

### Heavy charge (Jul 15 2026)
- Constant: `HEAVY_CHARGE_TIME = 0.5` in `Character.js`
- While charging: slow crawl, arms wind back, body leans + shakes
- Hitstun / shield / respawn cancels charge
- Bot holds heavy ~0.6s when choosing heavy so charge completes

### Heavy knockback (tuned Jul 15 2026 play)
- Base heavy `baseKnockback` reduced **22 → 8** (was over-launching); light stays **5**
- Mirror constant `HEAVY_KNOCKBACK` in `constants.js` for docs/legacy = **8**

---

## 4. Character Roster

**Note:** All characters share **uniform body size (1.0)** for balance. Select UI shows **food names** and groups by weight class (**LIGHT / MEDIUM / HEAVY** columns).

Each fighter is a **Three.js Group**: food body mesh + **face group** (square white plate + pupils + brows/blush/smile) + segmented arms/hands + legs/feet (shoulder/hip pivots).

**Art direction:** **Food only**. Restaurant backdrop always on. Silhouettes should read as the food (half-moon gyoza, blunted-triangle onigiri, etc.).

### Weight classes (select layout)

| Class | Fighters | Role |
|-------|----------|------|
| **LIGHT** | Tempura, Wasabi | Fast, floaty, weaker normals |
| **MEDIUM** | California, Gyoza | Baseline + slight variants |
| **HEAVY** | Dumpling, Onigiri | Slow, tanky, hard-hitting |

### Full roster (stats + body + special)

| Name | Type id | Weight | Speed | Jump | Body silhouette | Special (`SPECIALS.*`) |
|------|---------|--------|-------|------|-----------------|------------------------|
| **Tempura** | `light` | 0.8 | 1.2 | 16 | Fried shrimp tempura | **Hot Oil Splash** — forward projectile (`OIL_PROJECTILE`) |
| **California** | `medium` | 1.0 | 1.0 | 14 | Inside-out Cali roll | **Counter** — 0.5s window, 1.25× reflect (`COUNTER`) |
| **Dumpling** | `heavy` | 1.2 | 0.8 | 12 | Bao / dumpling (pleats) | **Ground Pound** — hop + shield-bypass AoE (`GROUND_POUND`) |
| **Wasabi** | `wasabi` | 0.75 | 1.15 | 15 | Green teardrop blob | **Wasabi Drop** — arcing blob + burn puddle (`WASABI_DROP`) |
| **Gyoza** | `gyoza` | 1.02 | 0.98 | 13.5 | **Solid half-moon** (flat fold + curved belly) | **Takoyaki Roll** — short dash charge (`TAKOYAKI_ROLL`) |
| **Onigiri** | `onigiri` | **1.28** | **0.75** | **11** | **Large blunted triangle** rice ball + nori | **Command grab** — short lunge, shield-bypass throw (`ONIGIRI_GRAB`) |

- Face/eyes **parented to `bodyMesh`**; blink via `faceGroup` Y-scale squash
- Food materials → `meshMaterials` via `userData.foodMats`
- Team color tints **limbs + marker only**
- Move scales live in `CHARACTER_SCALE` in `MoveSet.js` (Onigiri slightly slower/harder than Dumpling)

### Balance notes (Jul 16 2026 pass)
- Peers trade **tools**, not strict stat upgrades within a weight class.
- **LIGHT:** Tempura = faster + oil poke; Wasabi = slightly slower, full-strength puddle zone (CD **7s**).
- **MEDIUM:** California = baseline + counter; Gyoza = slightly denser/slower, commit roll (CD **7s**).
- **HEAVY:** Dumpling = mobility + ground-pound AoE; Onigiri = denser tank + grab (pick-up → throw **behind**, CD **7s**).
- Base specials (oil / counter / pound) CD **6s**.

### Coordinate system (2.5D fight plane)

| Axis | Direction | Role in Sushi Town |
|------|-----------|--------------------|
| **X** | Left ↔ right | Primary fight axis: walk, facing (`±1`), hitboxes, horizontal KB, horizontal blast zones |
| **Y** | Down ↔ up | Vertical: jump, gravity (`World y: -30`), platforms, vertical KB / blast zones |
| **Z** | Toward camera ↔ into stage | Depth only. Camera at **+Z** looking at origin. Fighters locked to **z = 0**. Backdrop props at negative Z |

### Facing & body motion (visual only — combat still uses `facing` ±1)
- Built facing **+X** (right). Left is yaw **−π**.
- Turns are continuous **Y-axis** rotation (`mesh.rotation.y` via `visualYaw` / `targetYaw`).
- **`TURN_RATE = 11` rad/s** (~0.28s for 180°) — face sweeps **toward the camera** (+Z), not instant flip.
- **Critical:** `applyFacing(0)` must **not** snap mid-turn. Post-physics `syncMeshPosition(0)` only re-applies current yaw; real steps need `deltaTime > 0` from `Character.update`.
- **Spawn / respawn:** face stage center. P1 `playerIndex` 1, P2 `2` — treat `<= 1` as right-facing.
- **Run / jump / flinch / attack / shield / charge** motion unchanged (see prior phases).

---

## 5. Attack Moves

### Basic Moves (Light / Heavy only)
Shared kit in `src/moves/MoveSet.js` with per-character `CHARACTER_SCALE`.

| Move | Key | Startup | Damage | Knockback | Notes |
|------|-----|---------|--------|-----------|-------|
| Light | V / `\` (tap) | ~2f base | 5% base | Low | Quick poke |
| Heavy | V / `\` (hold 0.5s) | charge + ~12f | 20% base | High | Release early → light |

Hitboxes are data-driven AABBs. Arm swing is decorative.

### Special Moves (implemented)
Input: **Special** key (`ShiftLeft` / P2 special bind). Cooldown flashes team marker triangle.

| Fighter | Special | Key data | Notes |
|---------|---------|----------|-------|
| Tempura | Oil projectile | dmg 8, KB 5, CD **6s** | Direct hit only |
| California | Counter | window 0.5s, 1.25× reflect, CD **6s** | Absorbs then reflects |
| Dumpling | Ground pound | dmg 14, AoE r 2.4, **bypass shield**, CD **6s** | Hop + shockwave |
| Wasabi | Wasabi drop | dmg 7 + full puddle DoT, CD **7s** | Zone tool vs Tempura oil |
| Gyoza | Takoyaki roll | dmg 12, dash 0.2s, CD **7s** | Commit mobility vs counter |
| Onigiri | Command grab | hold + throw behind, dmg 13, KB 7.5, CD **7s** | Anti-shield; phases during grab |

Grab path: lunge → active box → **hold** (snap in front) → **throw behind** Onigiri (`bypassShield: true`). Whiff pays full endlag.

---

## 6. Stage Designs

### Map picker flow
```
CHARACTER_SELECT (map dropdown + fighters) → FIGHT (no countdown)
```
- Map is a **dropdown** on the character select screen (`<select id="stage-select">`)
- Catalog: `STAGE_CATALOG` / ids in `src/stages/Stage.js`
- Fighter click starts match immediately (`Game.startGame` → `GAME_STATES.FIGHT`)
- Rematch keeps map + fighter + colors; **Character Select** returns to the same screen
- Soft platforms thickness **0.2** (`THIN`)
- Soft platforms are **one-way** (jump-through from below, solid from top); ground floor stays solid
- Shared layer heights: `LAYER_LOW = 2.6`, `LAYER_MID = 4.5` (center Y of thin platforms)
- Ground top ≈ y=0.5; fighter height ≈ 1.5 → low platforms leave pass-under room
- Jump budget (~v²/2g, g≈30): Heavy 12→~2.4, Medium 14→~3.3, Light 16→~4.3
- **Chain rule:** ground → low (single jump all chars) → mid from low (~1.9 vertical, all chars)

### Four maps

| Id | Name | Theme accent | Layout |
|----|------|--------------|--------|
| `DOJO` | Sushi Dojo | Warm brown / orange | Ground; low sides ±7; mid center |
| `BATTLEFIELD` | Wasabi Field | Green | Ground; three low platforms at x=±6, 0 |
| `HARBOR` | Harbor Night | Deep blue | Ground; low outer ±7; mid inner ±3 |
| `ROOFTOP` | Neon Rooftop | Purple / pink | Ground; low sides ±6.5; mid center |

### Platform visuals (all maps)
- **Ground** (`!oneWay`, thick): procedural **stone tiles** + mortar + edge chips (`createStoneGroundMesh`)
- **Soft platforms** (one-way): **wooden planks**, grain lines, nails, support beams (`createWoodPlatformMesh`)
- Theme colors still drive map identity in the select UI; fight floor/planks are shared stone/wood look

### Stage presentation (randomized backdrop per match)
- `Stage.addBackdrop(id)` is selected from a pool of registered backdrops (`BACKDROP_BUILDERS`):
  - `sushiRestaurant` — wood walls/planks, shoji, tatami, counter, shelves, lanterns, noren (warm `bg ≈ 0x2c1810`)
  - `koiPond` — bamboo grove, red torii gate, round koi pond (`CylinderGeometry`, radius 6.5), lily pads, animated koi fish, grass tufts + ring, stone lantern (cool `bg ≈ 0x0e2233`)
- Each `new Stage(...)` randomly picks one backdrop (`Stage._pickBackdropId`) so rematches re-roll fresh
- Backdrop visual only (no colliders); room width ~32, back wall z≈−12
- **Sushi restaurant lanterns (candle flicker):** each lantern has its own `breatheSpeed` / `flickerSpeed` / phase; `Stage._updateLanterns` pulses `PointLight.intensity` + bulb `emissiveIntensity` every frame
- **Koi pond lift:** the whole koi-pond group is shifted up via `group.position.y = 1.2` at build time so the pond reads higher in the camera frame
- **Koi pond motion:**
  - `_updateKoiFish` drifts each fish between `startX ± swimRange`, y-bobs slightly, and toggles `mesh.rotation.y` between `0` and `π` whenever `dir` flips (whole-group flip, parts in fixed local frame)
  - `_updateLilyPads` bobs each pad (`sin` over `t`)
  - `_updateBamboo` reads optional per-entry `swayAmount` / `swaySpeed` so dense grove leaves can gust more freely than the side stalks
- **Koi pond visuals details:** fish sit just under the water surface (`baseY = -0.58`) and read through the 0.72-opacity water; lily pads are flat `CylinderGeometry` (default Y axis — no `rotation.x = π/2`); fish, dorsal, pectoral fins, tail, and kohaku spots all live in a local +X-facing frame
- Noren sway only on the sushi-restaurant backdrop; koi-pond backdrop uses empty curtains list

### Blast Zones
- **Horizontal:** 40 units from center
- **Vertical (up):** 30 units above highest platform
- **Vertical (down):** 20 units below ground level

---

## 7. Game Flow

### States
```
CHARACTER_SELECT → FIGHT → KO → RESPAWN → (loop or) VICTORY
```
(`GAME_STATES.COUNTDOWN` remains in constants for legacy; match start skips countdown UI.)

### Round System
- **Stock Mode (default):** stocks per player from character-select **STOCKS** (1–5, default **3**)
  - `Game.stockCount` → `Character.stocks` at spawn; HUD draws that many icons
  - Rematch / return-to-select preserves the choice
- **Time Mode (optional):** 3-minute timer, most KOs wins *(not implemented yet)*
- First to eliminate all opponent stocks wins

### Respawn
- 2-second invincibility after KO
- Respawn at original spawn point
- Damage % resets to 0% after respawn

---

## 8. UI/HUD Design

### In-Game HUD
```
[P1 %: 45%]                    [P2 %: 120%]
[P1 STOCK: ●●●]               [P2 STOCK: ●●]
```
- Damage % displayed prominently per player
- Stock icons (filled/empty circles)
- Timer (if time mode active)

### Controls Help
- Displayed at bottom of screen during gameplay
- **1vAi:** P1 binds — A/D Move, W Jump, **V Light, C Heavy**, S Shield
- **1v1:** dual columns for P1 and P2 (arrows + `\` / `]`)

### Character Select Screen
- **PLAYERS** dropdown: `1vAi` (default) | `1v1`
- **MAP** dropdown (Random + playable maps: Dojo, Wasabi Field, Harbor, Soy River, Tempura Tower, Bento Box)
- **HAZARDS** dropdown: Off (default) | On — optional stage chaos (see § Hazard mode)
- **STOCKS** dropdown: 1–5 (default 3) — lives per player for the match
- **Weight-class columns side by side:** LIGHT | MEDIUM | HEAVY (`_createClassedCharacterGrid`)
  - Cards stacked **under** each class label
  - Class map: light+wasabi → LIGHT; medium+gyoza → MEDIUM; heavy+onigiri → HEAVY
- Display **food names** (Tempura, California, …); preview shapes use palette + optional `clip-path` (gyoza half-moon, onigiri blunt triangle)
- **Hover description:** each card shows role, playstyle blurb, WT/SPD/JMP (`_characterBlurb`)
- **Team color swatches:** red, blue, yellow, orange, green, cyan, black, white, grey
  - Colors limbs + overhead triangle marker in-match
  - P1/P2 cannot share a color
  - **1vAi:** all swatches pickable; taking AI’s color reassigns the bot
  - **1v1:** opponent’s color is disabled on each panel’s swatch row
- **1vAi:** classed grid + AI SETTINGS (difficulty, fighter = **Random** default or specific, AI color)
- **1v1:** side-by-side **P1** / **P2** classed panels; same type allowed; match starts when both have picked

### Victory Screen
- Winner announcement
- Final damage % stats
- "REMATCH" / "CHARACTER SELECT" buttons

---

## 9. AI Bot System

### Difficulty (`AI_DIFFICULTY_SETTINGS`)
| Level | Reaction | Special chance | Notes |
|-------|----------|----------------|-------|
| Easy | ~420ms | low | Slower defense, light spam |
| Mid | ~220ms | medium | Balanced specials + dodge |
| Hard | ~90ms | high | Aggressive specials, stronger defense |

### Loadout
- **Fighter:** default **Random** (`selectedAiType = 'random'`) → `_resolveAiFighterConfig()` picks any roster type at match start
- Specific fighter still selectable in AI SETTINGS dropdown
- Difficulty + AI color rematch-preserved

### Bot Behaviors
- **Approach / position / attack** states by distance (`approachRange` / `attackRange` / `meleeRange`)
- **Specials by kit:** oil/puddle mid-range, counter vs attack, roll to close, pound/grab vs shield
- **Defense:** dodge or shield when opponent is swinging nearby
- **Normals:** light tap / heavy hold; up-aim when target is above
- **Recover:** jump toward stage when low

### Bot Decision Loop
```
1. Evaluate distance + target state
2. If off stage: recover jump
3. If opponent attacking close: dodge or shield
4. If special situation fits kit + CD ready: special
5. Else approach / walk-in / light-heavy mix
```

---

## 10. Visual & Rendering

### Camera
- **Type:** Perspective (`fov` 50), fixed stage frame (not player-follow yet)
- **Framing:** `Game.frameCameraToStage()` after stage build — horizontal view just clears furthest platform edge (`max |x|+halfWidth + ~1.2` margin)
- Distance from FOV/aspect; clamp cam Z ~14–24; look-at near mid platform height
- Re-run on window resize while a stage is loaded

### Lighting
- Ambient light (soft fill)
- Directional light (sun, slight shadow)
- Lantern point lights on restaurant backdrop

### Character Rendering (food only)
- Food bodies always: `_createTempuraShrimpBody` / `_createCaliforniaRollBody` / `_createDumplingBody`
- Segmented limbs (upper/lower + hands with nubs / feet with toes); team-colored
- Face: square plate + pupils + brows/blush/shine/smile in `faceGroup` parented to body
- Random blink squashes whole face group; materials include face/limb mats for invuln flash
- Select card titles **Light / Medium / Heavy**; previews use food palette colors

### Stage surfaces + backdrop
- Ground: stone tile mesh; soft platforms: wood plank mesh
- Wooden sushi restaurant set always (`Stage.addSushiRestaurantBackdrop`)
- Dispose via decoration / platform group traverse on stage teardown

### Post-Processing
- Subtle bloom on hit effects
- Screen shake on big hits
- Chromatic aberration on KO

### Hit Effects
- Particle burst on impact
- Flash on hit character
- Knockback direction indicator (trajectory line)

---

## 11. Audio (Future)

Placeholder audio cues via Web Audio API:
- Attack whoosh sounds
- Hit impact sounds
- KO explosion sound
- Background music track

---

## 12. Implementation Priority

### Phase 1: Core Foundation
1. Project setup (Vite + Three.js + Rapier) ✓
2. Basic scene with camera and lighting ✓
3. Single character with physics (gravity, collide with ground) ✓
4. Movement (walk, jump, double jump) ✓

### Phase 2: Combat
5. Hitbox/hurtbox collision system ✓
6. Basic attacks (light + heavy; medium removed) ✓
7. Damage and knockback calculation ✓
8. Blast zone detection ✓

### Phase 3: Multiplayer
9. Second player input ✓ (AI bot + local human P2)
10. Local multiplayer: **PLAYERS** `1vAi` / `1v1` ✓
11. HUD (damage %, stocks) ✓

### Phase 4: Content
12. Character selection screen ✓
13. Multiple characters (**Light / Medium / Heavy**) ✓
14. Stages: FD with ground + 3 platforms (Battlefield/Fountain still in code) ✓
15. AI bot opponent ✓

### Phase 5: Polish
16. Visual effects (hit sparks, screen shake) ✓
17. Sound effects (planned)
18. Victory screen ✓
19. Game flow (countdown, rematch) ✓

### Phase 6: Bugfixes / Lessons Applied
20. Rapier import (`import * as RAPIER`) without `init()` for 0.14 ✓
21. Lock fighters to XY plane (no Z layer drift) ✓
22. Cube mesh/collider is square (1x1x1) ✓
23. Character select actually spawns the chosen fighter ✓
24. CSS hex conversion for select-screen colors ✓
25. Init `attackVisuals` before mesh creation ✓
26. Align platform collider with visual mesh (no floor clipping) ✓

### Phase 7: Combat Feel MVP
**Goal:** 1v1 combat feels fair and fun before multiplayer expansion.  
**Plan:** `lore/combat-feel-mvp/PLAN.md` · **Decisions:** `lore/combat-feel-mvp/DECISIONS.md`

27. Minimal exclusive states (attack / hitstun / shield / dead) ✓
28. Data-driven hitboxes + body hurtbox (not visual-mesh-as-hitbox) ✓
29. Per-character frame data on shared **light/heavy** kit ✓
30. Hit-once, hitlag, hitstun ✓
31. Knockback formula + limited DI (hybrid: Rapier ground + custom launch velocity) ✓
32. Raycast grounded detection; fix jump/land/air control ✓
33. Fairer shield (bubble visual + pushback + shieldstun) ✓
34. Playtest gate: juggles, no multi-hit spam, DI, shield pushback, clean land/jump, fair stocks — *pending user playtest*

### Phase 8: Branding
35. Official game title **Sushi Town** (HTML title, select screen, docs) ✓

### Phase 9: Character presentation & stage (Jul 15 2026 play session)
36. Limb models (arms/legs) on character groups ✓
37. Continuous face-turn through camera (no instant 180 flip) ✓
38. Attack arm punch swing + walk cycle ✓
39. Roster rename Light/Medium/Heavy (triangle/circle/square) ✓
40. Attacks reduced to Light/Heavy only (keys later: V/C P1; see Phase 11) ✓
41. Spawn/respawn face center; fix playerIndex facing ✓
42. Soft multi-platform layouts tuned for jump height + thin platforms ✓

### Phase 10: Multi-map system
43. Four themed stages (Dojo / Wasabi / Harbor / Rooftop) with color schemes ✓
44. Map dropdown on character select (not a separate screen) ✓
45. Stage dispose + physics world reset on rematch/return ✓
46. Platform spacing: pass-under headroom + chainable jump heights ✓

### Phase 11: Local 1v1 + team colors (Jul 15 2026)
47. PLAYERS mode toggle `1vAi` | `1v1` on character select ✓
48. Split keyboard layouts (P1 WASD+V/C, P2 arrows+`\`/`]`) always, not mode-aware ✓
49. Dual P1/P2 fighter grids; auto-start when both selected; same type OK ✓
50. Team colors (9 swatches) → limb material + overhead triangle marker ✓
51. Unique colors: 1v1 blocks opponent swatch; 1vAi reassigns AI when player takes its color ✓
52. Victory labels: PLAYER 1 / BOT vs PLAYER 1 / PLAYER 2 by mode ✓
53. Plan/decisions: `lore/players-1v1-mode/` ✓

### Phase 12: AI settings + combat polish (Jul 15 2026)
54. AI SETTINGS on 1vAi select: Easy / Mid / Hard, fighter type, AI color ✓
55. Bot uses selected type/color; difficulty tunes reaction delay, ranges, attack mix ✓
56. Bot meleeRange so AI walks in before swinging (no far-range whiffs) ✓
57. Hold-jump up-attacks (`jumpHeld` + `move.aerial` kit) ✓
58. Heavy knockback retuned (baseKnockback 8) ✓
59. Attack FX: ball + curved swoosh (replaces box); wraps body; up-attacks over crown ✓

### Phase 13: Combat polish (Jul 15 2026, later session)
60. Single attack button: V / `\\` — tap light, hold 0.5s heavy ✓
61. Directional shield (front-only block + hemisphere mesh) ✓
62. Shield HP, break stun, regen; mesh warp/bob + team color ✓
63. Dodge (C / `]`) with iframes + cooldown ✓
64. Attack/shield/hit FX use team color ✓
65. Camera shake scaled by knockback (stronger on shield break / KO) ✓
66. Idle bob/sway; victory arms-up + face camera ✓
67. Victory UI is bottom popup over live battlefield (not full-screen cover) ✓
68. Remember selections between rounds (fighters, colors, stage, mode, AI) ✓
69. Remove finger nubs from hand meshes ✓
70. Plan/decisions: `lore/combat-polish/` ✓

### Phase 14: Roster expansion + specials + presentation (Jul 16 2026)
  71. Wasabi + Gyoza roster entries (stats, scales, specials, meshes) ✓
  72. **Onigiri** second heavy: weight 1.28 / speed 0.75 / jump 11; command-grab special ✓
  73. Select UI grouped by weight class; columns side-by-side (LIGHT | MEDIUM | HEAVY) ✓
  74. Gyoza mesh = solid half-moon; Onigiri mesh = large blunted triangle ✓
  75. Y-axis turn fix: no snap on post-physics sync; `TURN_RATE = 11` ✓
  76. Backdrop lantern candle flicker (per-light rates) ✓
  77. Balance audit documented (Wasabi / Gyoza overtuned) ✓

### Phase 15: Weight-class balance pass (Jul 16 2026)
  78. Peers trade tools within class (Wasabi/Gyoza nerfs, Onigiri grab risk) ✓

### Phase 16: Combat + AI + presentation polish (Jul 16 2026, later)
  79. Dodge shorter; phase through fighters only while dodging ✓
  80. Special CDs shortened (base 6s / alt 7s) ✓
  81. Onigiri grab: hold → throw behind; smoother mesh + nori wrap ✓
  82. Select hover blurbs; AI uses specials; AI fighter Random default ✓

### Phase 18: Random backdrop pool (Jul 16 2026)
  83. Backdrop registry (`BACKDROP_BUILDERS`) — `sushiRestaurant` + `koiPond` ✓
  84. Each `new Stage(...)` re-rolls backdrop via `_pickBackdropId` (50/50 over 50 trials) ✓
  85. Koi pond backdrop: bamboo grove back wall (vertical cylinders + joint rings + leaf canopies); red torii gate; round pond basin (`CylinderGeometry`, radius 6.5) with deeper mud disk and rim-shadow ring; stone perimeter + front-edge boulders; grass ring + mowed-stripe rings + 36 tufts on golden angle + back reeds; 6 koi fish under the water surface; 12 lily pads floating flat; stone lantern borrowing the `_updateLanterns` flicker ✓
  86. Fish flip with direction via single `mesh.rotation.y` group toggle (parts in fixed local +X frame) — no per-mesh sign juggling ✓
  87. Lily pads keep default Y-axis orientation (no `rotation.x = π/2`) so the disc lies flat, not standing vertical ✓
  88. `_updateBamboo` reads optional `swayAmount` / `swaySpeed` per entry (defaults `0.025` / `0.6`) so dense grove leaves gust while side stalks stay subtle ✓
  89. Whole koi-pond backdrop group is lifted via `group.position.y = 1.2` so the pond reads higher in the camera framing ✓
  90. Lore: `lore/koi-pond-background/{PLAN,DECISIONS,RESEARCH}.md` ✓

### Phase 19: Hazard mode (Jul 16 2026)
  91. HAZARDS Off/On on character select (default Off) ✓
  92. `HazardSystem` — steam vents + falling comets ✓
  93. Per match: random hazard **kind** (50/50 vent vs comet) ✓
  94. Per match / spawn: random **positions** (vents on platform tops; comets random X) ✓
  95. Soft damage/KB, telegraph, per-player hit cooldown; warn/burst SFX ✓
  96. Plan: `lore/hazard-mode/` ✓

### Phase 20: Match settings — stocks (Jul 16 2026)
  97. STOCKS dropdown 1–5 on character select (default 3) ✓
  98. `Game.stockCount` drives Character spawn + HUD icon count ✓
  99. Rematch preserves stock count ✓

### Phase 17: Post-MVP Expansion (ordered)
  100. Gamepad-first + keyboard
  101. Multiplayer scaffolding (up to 4 players, AI fill empty slots)
  102. Selectable modes: free-for-all, teams (beyond 1v1 stocks)
  103. Dash and remaining documented systems
  104. Further juice / more hazard types (oil slick, wave, lantern drop)

---

## 13. Performance Targets

- 60 FPS on modern browsers
- < 3 second initial load
- Responsive controls (input latency < 16ms)

---

## 14. Future Expansion (Post-Prototype)

- GLB/GLTF character models (optional; procedural food is intentional for now)
- Balance pass + more characters if needed
- More stages with hazards
- Online multiplayer (WebRTC or relay server)
- Replay system
- Training mode

### North star (grill session, Jul 2026)
- **Title:** Sushi Town
- **Ship target:** Polished, feature-complete Smash-like demo (placeholder art OK)
- **Players:** Gamepad-first + keyboard; up to 4 humans; custom AI
- **Modes:** Selectable 1v1, FFA, teams
- **Delivery:** MVP slices — combat feel first, then gamepad → multi → specials

---

## 15. Runtime Lessons (Implementation Notes)

### How to run
1. `npm install`
2. `npm run dev`
3. Open the Vite URL (usually `http://localhost:3000/`)

### Rapier 0.14 + Vite
- Import as namespace: `import * as RAPIER from '@dimforge/rapier3d'`
- Do **not** call `RAPIER.init()` for this package version (it is not a function / not required)
- Vite plugins in use: `vite-plugin-wasm`, `vite-plugin-top-level-await`
- Avoid excluding `@dimforge/rapier3d` from Vite optimizeDeps unless you have a specific reason

### Side-scroller plane lock (2.5D)
- Characters were drifting on Z and looked like different “layers”
- Fix: lock rigid bodies to XY only:
  - `.enabledTranslations(true, true, false)`
  - `.enabledRotations(false, false, false)`
- Also force `z = 0` when syncing mesh position from physics

### Character constructor order
- Initialize `attackVisuals` **before** `createMesh()` / `createAttackVisuals()`
- Bug symptom: black/frozen screen after select with  
  `Cannot set properties of undefined (setting 'light')`

### Character select must drive spawn
- Store selection: `this.selectedCharacter = this.characterConfigs[index]`
- Spawn P1 from `this.selectedCharacter`, not a hard-coded config index
- UI colors from numeric Three.js colors need CSS hex conversion:  
  `'#' + color.toString(16).padStart(6, '0')`

### Stages (Phase 10)
- Four maps: `DOJO`, `BATTLEFIELD`, `HARBOR`, `ROOFTOP` in `STAGE_IDS` / `STAGE_CATALOG`
- Default: `STAGE_IDS.DOJO` (`Game.currentStage`)
- Soft platform thickness **0.2**; layer centers **2.6** (low) and **4.5** (mid)
- Map picker: dropdown on character select, not a separate full-screen step
- Rematch: `clearMatchEntities()` disposes stage meshes + rebuilds Rapier world (no stacked platforms)
- Platforms are solid (not drop-through); true soft platforms later if desired

### Platform mesh/collider alignment
- Bug: fighters sank halfway into the floor
- Cause: visual mesh at `y` but Rapier body at `y - height/2`
- Fix: `createGround(x, y, z, …)` uses the **same center** as the mesh
- Both Three.js `BoxGeometry` and Rapier `cuboid(halfExtents)` are center-based

### Platform layout tuning (play session)
- Too high: Heavy cannot land single jump → lower layers to jump budget
- Too close vertically: cannot walk under → raise low layer for headroom (~2+ under)
- Too far vertically between layers: cannot chain → keep mid−low ≤ ~2.0
- Too close horizontally: blocked / awkward hops → space columns with small walk-under gaps
- Final balance: pass under low platforms **and** Heavy can chain ground → low → mid

### Combat feel (Phase 7 + 13) — implemented
- `FIGHTER_STATE` gating: actionable / attack / hitstun / shield / **dodge** / **shield_break** / dead
- `src/moves/MoveSet.js` data-driven startup/active/endlag, hitboxes, per-char scales (**light + heavy only**)
- Hit-once per attack instance, hitlag freeze, hitstun + DI
- **Single attack button** (`ATTACK` + `attackHeld`): charge → heavy; release early → light
- **Directional shield**: front-only block via hit position vs facing; hemisphere mesh parented to character
- **Shield HP** (`COMBAT_FEEL.SHIELD_*`): drain on block, break stun, delayed regen; visual scale/color by HP
- **Dodge**: grounded, direction from left/right or facing; iframes + cooldown (`DODGE_DURATION` 0.2s, speed 11)
- **Dodge phase-through:** fighter–fighter contacts use `filterContactPair`; `EMPTY` only while `isDodging` (or mid-grab); solid walk otherwise
- Team-colored attack swoosh, shield, and hit particles
- Camera shake from `CombatSystem.applyHit` via `Game.addCameraShake`
- Rapier downward raycast for grounded (excludes self body)
- Bot: specials by kit, dodge/shield defense, light/heavy, Random fighter option

### Character presentation (Phase 9)
- Mesh is a `THREE.Group` — do not assume `mesh.material` exists; use `meshMaterials[]` for opacity/flash
- Facing logic uses continuous `visualYaw` / `targetYaw`; combat `facing` is still ±1 for hitboxes
- Turn path: always through camera (−π/2) so faces sweep past the screen
- Limb pivots: hang down on local −Y; **+Z rotation** swings limb forward (+X)
- **Arm shoulder z = ±0.55, rest rotation.x = ∓0.40** (handed outward in idle). Older `±0.45 / ±0.15` made arms clip into Dumpling/Onigiri/Gyoza bodies.
- Spawn facing bug: `playerIndex` is **1 and 2** from `Game.startGame`, not 0 and 1 — use `playerIndex <= 1` for right-facing

### Local 1v1 + team colors (Phase 11)
- `PLAYER_MODES` / `PLAYER_COLORS` / `PLAYER_COLOR_IDS` in `constants.js`
- `Character(…, teamColor)` tints limbs; `_createTeamMarker()` adds inverted cone above head
- `Game.selectedColorP1` / `selectedColorP2` (defaults red / blue); spawn passes hex into Character
- Select UI rebuilds fighter area on mode/style/color change via `_fighterArea` + `_renderFighterArea`

### AI settings (Phase 12 + 16)
- `AI_DIFFICULTY` + `AI_DIFFICULTY_SETTINGS` in `constants.js` (easy/mid/hard)
- Tuning: `reactionDelay`, ranges, `specialChance`, `dodgeVsAttackChance`, jump/shield/attack chances
- `BotController` uses specials by `CHARACTER_TYPES` situation; defense dodge/shield; melee walk-in
- Select: AI panel (level, **Random**/specific fighter, color); `Game._resolveAiFighterConfig()`
- Rematch preserves AI settings with mode/colors

### Up-attacks (hold jump)
- `InputManager`: `jumpHeld = isKeyHeld(JUMP)` on both players
- `handleAttacks`: `aimUp = inputState.jumpHeld` → `performAttack(type, aimUp)`
- `resolveMoveForStance(move, isForward)` clones `move.aerial` when aiming up (hitbox + angle)
- Arm anim: overhead when `attackIsUp`; forward punch otherwise

### Attack FX (swoosh)
- Replaced box mesh with bead trail + tip ball (`_createSwooshAttackVisual`)
- **Forward:** arc wraps torso (over top or camera-side; **never under** the model)
- **Up (W):** dedicated `_layoutSwooshOverTop` — always over crown → tip above head
- Random path each swing via `_randomizeSwooshCurve(visual, aimUp)`
- Group origin = body center; scale from hitbox reach; hitboxes still AABB (FX is cosmetic)
- Colors: attack + shield + hit sparks use `teamColor`

### Victory + selection memory
- Victory is a **transparent bottom panel** over the live stage (do not `clearScreen` with opaque full cover)
- Winner `startVictoryPose()`: yaw → camera (`targetYaw = -π/2`), arms raise overhead, bounce
- `Game.render` keeps animating victory pose while `GAME_STATES.VICTORY`
- Remembered: `selectedIndexP1/P2`, colors, stage, mode, AI difficulty/type — rematch and return-to-select restore them
- Dual-start uses `_dualStarted` to avoid double `startGame` after both panels pick

### Specials + roster (Phase 14 + 16)
- Types in `CHARACTER_TYPES`: `light`, `medium`, `heavy`, `wasabi`, `gyoza`, `onigiri`
- Definitions in `SPECIALS` (`constants.js`); wiring in `Character.handleSpecial` + `CombatSystem`
- Onigiri grab: `startup` → `active` → **`hold`** → throw via `throwGrabTarget` (behind, reverse KB); phases with opponent while grabbing
- Select class map + hover blurbs: `_characterClass` / `_characterBlurb` / `_createClassedCharacterGrid` in `UIManager.js`
- Onigiri mesh: smooth extruded blunt triangle + nori wrap on lower front/back (not between legs)
- Silhouette previews: optional `clip` on palette entries (CSS `clip-path`)

### Facing Y-turn (Phase 14 fix)
- Symptom: direction changes looked like instant flips
- Cause: `Game.update` called `syncMeshPosition()` with no `dt` → `applyFacing(0)` snapped to `targetYaw`
- Fix: `applyFacing` only advances when `deltaTime > 0`; zero-dt path re-applies `visualYaw` only
- Tunable: `TURN_RATE` in `Character.js` (currently **11**)

### Lantern flicker (Phase 14)
- `Stage.lanterns[]` stores per-light speeds/phases; `_updateLanterns(dt)` from `Stage.update`
- Combines slow sine “breathe” + multi-sine flicker on light intensity + bulb emissive
- Same driver works for the koi-pond stone lantern (just an entry pushed into `lanterns[]`)

### Random backdrop pool (Phase 18)
- `BACKDROP_BUILDERS` registry at the top of `src/stages/Stage.js`; `addXxxBackdrop()` methods on Stage implement each entry
- `Stage._pickBackdropId()` re-rolls per instance; `Stage.addBackdrop(id)` is the dispatcher
- Lifting the whole backdrop is one `group.position.y` change — no per-child math

### Three.js geometry pitfalls (Phase 18 lessons)
- `CylinderGeometry` axis is **Y** by default. Do **not** set `rotation.x = π/2` on lily pads; that stands them up perpendicular like a coin facing the camera. Keep default orientation so the disc lies flat in the XZ plane.
- For a fish facing +X, place the tail cone at `position.x = -0.85` with `rotation.z = +π/2` so the cone tip points further −X. The dorsal fin needs no rotation (tip +Y, naturally up). Pectoral fins use `rotation.x = sideZ * π/2` to point outward along ±Z.
- Whole-group rotation avoids per-mesh direction-sign juggling. Place body parts in a fixed local +X frame and toggle `mesh.rotation.y` between `0` and `π` to flip the fish.

### Hazard mode (Phase 19) — runtime lessons
- **Toggle only:** `Game.hazardsEnabled`; never spawn `HazardSystem` when Off
- **Kind pick:** constructor `_pickKind()` → `HAZARD_KINDS.STEAM_VENT` | `FALLING_COMET` (equal weight); rematch re-rolls
- **Do not use fixed `STAGE_HAZARDS` coords** — positions must re-roll from live stage geometry:
  - Vents: `_collectSurfaces()` from `stage.platforms` (mesh center + half height → top Y); sample X within `halfW − margin`; enforce min separation
  - Comets: random `targetX` in stage X bounds; `impactY` = highest surface top under that X; warn ring on ground then fall from `spawnHeight`
- **Hit path:** always `char.takeHit(...)` (same as combat) so shield / invuln / hitstun behave correctly; `WeakMap` per-player hit cooldown
- **Balance defaults** (`constants.js` `HAZARDS`):
  - Vent: dmg 4, KB 7.5 up, warn 0.55s, active 0.85s, period 5.5s, hit CD 1.1s
  - Comet: dmg 7, KB 8.5, warn 0.7s, fall speed 16, spawn interval 3.2–5.5s, max 2 active, hit CD 1.0s
- **VFX:** vent grate emissive pulse + steam particles; comet orange ring pulse → sphere trail → impact burst
- **SFX:** `AudioManager.playHazardWarn` / `playHazardBurst` (procedural noise + tones)
- **Dispose:** clear vents/comets/particles on `clearMatchEntities` so rematch does not leak meshes
- Plan/decisions: `lore/hazard-mode/{PLAN,DECISIONS}.md`

### Match stocks (Phase 20) — runtime lessons
- `STOCK_OPTIONS = [1,2,3,4,5]`; default `Game.stockCount = 3`
- Character: `this.stocks = game?.stockCount ?? 3` (not a hard-coded 3)
- HUD: `createHUD(stockCount)` builds N icons; `updateStocks` still toggles filled/empty by remaining count
- Select UI pattern matches HAZARDS/MAP: dropdown + callback into `Game`, remembered across rematch

### Four controllers + FFA (Phase 21)
- PLAYERS: `1vAi` | `1v1` | `FFA 2` | `FFA 3` | `FFA 4`
- Slot model on character select: fighter + color + Ready; P1 owns MAP/STOCKS/HAZARDS/mode; START force-starts
- Pad join on select only; empty FFA slots → CPU; unready humans keep pick
- Stages: 4 spawn points; HUD N player boxes; win = last with stocks > 0
- Lore: `lore/four-controllers/{PLAN,DECISIONS}.md`

### Input modes + Switch Pro WebHID (Phase 22)
- **`INPUT_MODES`:** explicit **Keyboard** vs **Controllers** on character select (not auto-merge)
  - Keyboard → PLAYERS limited to `1vAi` / `1v1` only (no FFA)
  - Controllers → full mode list including FFA 2/3/4; fight input is pad-only
  - Preference persisted in `localStorage` key `sushiTown.inputMode`
- **Controller count badge** on select: `CONTROLLERS CONNECTED: N · KEYBOARD|CONTROLLER MODE`
- **Pad ownership:** store stable browser `gamepad.index` (or HID virtual index ≥ 100) on slot/character; re-poll every frame (never cache `Gamepad` objects)
- **Xbox / standard Gamepad API mapping:** LS/D-pad move · A jump · X attack · Y dodge · RB special · RT/LT shield · B/LB grab
- **Switch Pro (USB) on macOS Chrome:**
  - OS sees pads (`system_profiler` / IOUSB) but `navigator.getGamepads()` often stays all-null
  - Fix: `src/input/SwitchProHid.js` WebHID driver (VID `0x057e` PID `0x2009`)
  - USB handshake `0x80` cmds + subcommand `0x03` → full reports `0x30`; parse buttons/sticks per dekuNukem notes
  - Face map (Nintendo layout → game): **A** jump · **X** attack · **Y** dodge · **R** special · **ZR/ZL** shield · **B/L** grab
  - Virtual indices start at **100** so they never collide with sparse Gamepad API slots
- **Permission UX:**
  - First visit may need one-time **ALLOW SWITCH PROS** (browser security; cannot skip forever)
  - After grant: `navigator.hid.getDevices()` + `connect` events + ~2s poll **auto-reopen** — no button every session
  - Button hidden while any pad is already live
- **Lessons / footguns:**
  - Never treat stick axes 0–3 as LT/RT (drift locks shield forever)
  - Do not OR keyboard into pad players while any controller is active
  - `buttonPressed` edges must commit once per frame (`beginFrame`/`endFrame`) so multi-readers see the same edge
  - Fresh `getGamepads()` / HID state every frame; snapshots go stale
- Key files: `InputManager.js`, `SwitchProHid.js`, `Game.js` (`inputMode`, HID bind), `UIManager.js` (INPUT dropdown, badge), `constants.js` (`INPUT_MODES`)

### Known follow-ups
- User playtest of combat-feel checklist (`lore/combat-feel-mvp/PLAN.md` step 11)
- Soft platforms are one-way (Rapier `filterContactPair`; ground solid)
- Teams mode; mid-match hot-join
- Gamepad navigation of MAP/STOCKS dropdowns
- Hazard AI awareness (Hard bots avoid active vents / comet shadows)
- More hazard types (oil slick, wave, falling lantern)
- Time mode (timer + KO count)
- Multi-select WebHID picker if Chrome exposes it consistently; Bluetooth Pro path validation
- Recent plans: `lore/four-controllers/`, `lore/hazard-mode/`, `lore/match-stocks/`, `lore/combat-polish/`, `lore/players-1v1-mode/`, `lore/combat-feel-mvp/`, `lore/koi-pond-background/`