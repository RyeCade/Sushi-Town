# Research: Sushi Town

**Date:** July 14, 2026 (updated July 16, 2026)  
**Project:** **Sushi Town** — browser-based Smash Bros-style 3D platform fighter

---

## 1. Technology Stack

### 3D Rendering Libraries

#### Three.js
- **GitHub:** https://github.com/mrdoob/three.js
- **Stars:** 114k | **Forks:** 36.4k
- **License:** MIT

**Pros:**
- Most popular WebGL library with massive community support
- Excellent documentation and manual (threejs.org/manual)
- Huge ecosystem of examples, tutorials, and plugins
- Clean, intuitive API for 3D graphics
- Supports WebGL and WebGPU renderers
- Regular updates (latest release r185, July 2026)
- Well-integrated with physics engines (Cannon.js, Ammo.js, Rapier)

**Cons:**
- No built-in physics - requires separate library
- No built-in game logic or input handling
- Can be verbose for simple scenes

#### Babylon.js
- **GitHub:** https://github.com/BabylonJS/Babylon.js
- **Stars:** 25.8k | **Forks:** 3.7k
- **License:** Apache-2.0

**Pros:**
- More feature-rich out-of-the-box than Three.js
- Built-in physics support (via Havok or Ammo.js plugins)
- Excellent WebXR support out of the box
- Great documentation with interactive playground
- Built-in particle system, audio, and advanced materials
- Strong enterprise adoption and corporate backing (Microsoft)
- Ships with TypeScript definitions

**Cons:**
- Heavier library than Three.js (more features = larger bundle)
- Steeper learning curve than Three.js
- Smaller community than Three.js

---

### Physics Engines

#### Rapier (dimforge/rapier)
- **GitHub:** https://github.com/dimforge/rapier
- **Stars:** 5.5k | **Forks:** 365
- **License:** Apache-2.0
- **Website:** https://rapier.rs/

**Pros:**
- **Actively maintained** by Dimforge (professional team)
- Rust-based for performance (WebAssembly)
- Modern API design
- Excellent documentation
- Both 2D and 3D physics support
- NPM packages available (@dimforge/rapier3d, @dimforge/rapier2d)
- Discord community for support
- Good TypeScript support
- **Recommended for new projects**

**Cons:**
- JavaScript bindings are generated - API may feel less JS-native
- Newer library means smaller community

#### Cannon.js
- **GitHub:** https://github.com/schteppe/cannon.js
- **Stars:** 5k | **Forks:** 739
- **License:** MIT

**Pros:**
- Lightweight and fast - ideal for browser performance
- Simple, straightforward API
- Good integration with Three.js
- Supports constraints (hinge, distance, lock, point-to-point)

**Cons:**
- **Last release was 2015** - appears unmaintained
- No soft body physics
- Limited documentation
- No WebAssembly version

#### Ammo.js
- **GitHub:** https://github.com/kripken/ammo.js
- **Stars:** 4.5k | **Forks:** 581
- **License:** zlib

**Pros:**
- Direct port of Bullet physics engine (feature-complete)
- Feature-rich: soft bodies, vehicles, constraints
- Both asm.js and WebAssembly builds available

**Cons:**
- Large file size
- Complex API due to being auto-translated from C++
- Memory management can be tricky
- Steep learning curve

---

### Input Handling

#### gamecontroller.js
- **GitHub:** https://github.com/alvaromontoro/gamecontroller.js
- **License:** MIT

**Pros:**
- Lightweight (~6KB)
- Event-driven architecture
- Maps standard gamepad layout consistently
- Works with Edge, Firefox, Chrome, Safari, Opera

**Cons:**
- Small community
- Focused only on gamepads

#### Native Gamepad API
- **W3C Spec:** https://w3c.github.io/gamepad/

The browser's native Gamepad API is well-supported across all modern browsers. Recommended approach for a fighting game: native Gamepad API + keyboard events directly, no abstraction library needed.

---

## 2. Existing Fighting Game Engines

**Finding:** There are no significant open-source Super Smash Bros clone engines in JavaScript. This is actually an opportunity — building from a solid foundation rather than adapting a poorly-maintained template.

---

## 3. Recommended Stack

### Option A: Maximum Community & Resources (SELECTED)
- **Rendering:** Three.js
- **Physics:** Rapier
- **Input:** Native Gamepad API + gamecontroller.js (optional abstraction)
- **Audio:** Howler.js or Web Audio API
- **Bundler:** Vite

### Option B: Most Feature-Rich
- **Rendering:** Babylon.js
- **Physics:** Babylon.js Havok plugin OR Rapier
- **Extras:** Built-in particle system, audio, post-processing

---

## 4. Key Links

| Category | Library | Link |
|----------|---------|------|
| 3D Rendering | Three.js | https://github.com/mrdoob/three.js |
| 3D Rendering | Babylon.js | https://github.com/BabylonJS/Babylon.js |
| Physics | Rapier | https://github.com/dimforge/rapier |
| Physics | Cannon.js | https://github.com/schteppe/cannon.js |
| Physics | Ammo.js | https://github.com/kripken/ammo.js |
| Input | gamecontroller.js | https://github.com/alvaromontoro/gamecontroller.js |
| Gamepad API | W3C Spec | https://w3c.github.io/gamepad/ |
| Physics Docs | Rapier | https://rapier.rs/docs/ |
| Three.js Examples | Three.js | https://threejs.org/examples/ |

---

## 5. Side-Scrolling 3D Fighting Game Considerations

1. Full 3D physics may be overkill — simple AABB collision detection + custom knockback physics can work well
2. Character movement/combat is often better handled with custom game logic rather than physics simulation
3. Rapier's constraint system could help with character linking/attachment mechanics
4. For Smash Bros-style combat, the physics engine handles gravity/collisions, but knockback vectors are calculated manually based on damage %

---

## 6. Active Maintenance Status

| Library | Status |
|---------|--------|
| Three.js | **Active** (updated hours ago) |
| Babylon.js | **Active** (updated 2 hours ago) |
| Cannon.js | **Unmaintained** (last release 2015) |
| Ammo.js | **Minimal maintenance** (functional but old) |
| Rapier | **Active** (regular updates from Dimforge) |

---

## 7. Implementation Findings (July 15, 2026)

Practical notes from debugging the live prototype.

### Rapier (`@dimforge/rapier3d` ^0.14.0)
- **Import:** use `import * as RAPIER from '@dimforge/rapier3d'`
- **Init:** `RAPIER.init` is **not** a function in this setup; creating `new RAPIER.World(...)` works after module load
- Default import (`import RAPIER from ...`) + `await RAPIER.init()` caused black screen / uncaught promise errors
- Vite setup that worked:
  - `vite-plugin-wasm`
  - `vite-plugin-top-level-await`
  - no special `optimizeDeps.exclude` needed for Rapier in this project

### 2.5D / side-scroller constraints
- Full 3D dynamics let fighters separate on Z, which reads as “different map layers”
- Lock movement to the play plane with RigidBodyDesc:
  - `enabledTranslations(true, true, false)` — X/Y free, Z locked
  - `enabledRotations(false, false, false)` — no tumbling
- Keep mesh sync forced to `z = 0` as a safety net

### Three.js UI color values
- Character config colors are numeric (`0xFF4444`)
- CSS `background` / `box-shadow` need hex strings (`#ff4444`)
- Convert with: `'#' + n.toString(16).padStart(6, '0')`

### Object construction order
- Fields used by mesh setup (e.g. `attackVisuals`) must be allocated before mesh creation
- Failure mode: click character → crash mid-spawn → frozen/black state

### Game flow bug class
- UI selection callbacks can succeed while spawn logic still hard-codes fighter index
- Always pass selected config into character construction for P1 (and pick bot as a different type)

### Stage complexity → multi-map system
- Four selectable stages: Dojo, Wasabi Field (Battlefield), Harbor Night, Neon Rooftop
- Soft platforms: thickness **0.2**; shared layers **low y=2.6**, **mid y=4.5**
- Jump budget (~v²/2g with gravity ~30): forces 12/14/16 → ~2.4 / 3.3 / 4.3
- Layout goals (iterated with playtest):
  1. Pass under soft platforms (headroom ≥ fighter height)
  2. Every platform reachable by **Heavy** via single-jump chains (ground → low → mid)
  3. Horizontal spacing: walk-under columns without stacking platforms on top of each other
- Match cleanup: dispose stage meshes + **new Rapier World** on rematch/return so colliders do not stack

### Platform visual vs physics offset
- Symptom: characters clip halfway through the floor when standing
- Root cause: mesh at `y`, collider body at `y - height/2`
- Three.js box meshes and Rapier cuboids are both **center-origin**; half-height offsets double-count
- Correct pattern: same `(x, y, z)` for mesh and `createGround` / fixed body
- After fix (ground height `1` at `y=0`): top surface at `0.5`, fighter rest center ≈ `1.0`

### Map picker UX
- Separate full-screen stage select was replaced by a **dropdown on character select**
- Dropdown change only sets `currentStage`; fighter click still starts the match
- Rematch preserves map + fighter selection

---

## 8. Character Presentation Findings (Jul 15 2026 play session)

### Roster rename
| Name | Type key | Body (current) | Role |
|------|----------|----------------|------|
| Light | `light` | Tempura shrimp | Fast / light |
| Medium | `medium` | California roll | Balanced |
| Heavy | `heavy` | Dumpling | Slow / heavy |

- Old names Cube/Sphere/Pyramid retired; classic shape skins later **removed entirely**
- Select cards show `character.name`; previews use food palette (gold / rice / dough)

### Limb / face model
- Character mesh is a **Group**, not a single Mesh
- Segmented arms (upper/lower + hand nubs) and legs (thigh/shin + foot/toe) on pivots
- Square face plate + pupils (+ brows/blush/shine/smile) on +X for readable facing
- **Implication:** invincibility / flash must iterate `meshMaterials`, not `mesh.material`
- **User feedback:** likes limb/face presentation; wants more detail and dynamic motion, not realistic models

### Food bodies only (classic removed later same day)
- Mapping locked:
  - Light → fried shrimp tempura (batter segments + pink tail + sheen/grooves)
  - Medium → inside-out Cali roll (rice, full-top tobiko, cut-face fillings, sesame)
  - Heavy → dumpling (pleats + knot + freckles; **steam removed** per request)
- Classic LOOK / `CHARACTER_STYLES` / `_createClassicBodyMesh` deleted; no style dropdown
- Food mats on `group.userData.foodMats` → `meshMaterials`
- Tobiko on **+Y (opposite legs)**; full arc + dense pearls (not a thin line)
- Legs hang below physics half-height → `_visualFootDepth` + mesh lift

### Face parented to body + blink
- Face/eyes used to sit on root `mesh` while body sway ran on `bodyMesh` → face floated
- Fix: parent `faceGroup` to body; blink scales **whole face group** (white plate + pupils), not pupils alone
- Blink cadence: ~**0.5–1.8s** open gap (user wanted more frequent)

### Dynamic body motion (user request)
- Run sway, hit flinch, jump squash/stretch, attack body twist, shield crouch+shake
- Attack arms: keep punches **mostly forward** (user: arms lifted too much)
- Heavy charge: lean/shake/wind-up while holding

### Restaurant backdrop + camera frame
- Restaurant backdrop **always** (no longer gated on food LOOK)
- Warm interior sky + fog near/far ≈ 14/42
- `Game.frameCameraToStage()`: just past furthest platform edge; cam Z clamp 14–24; FOV 50
- Backdrop visual only behind z=0

### Facing rotation (not scale flip)
- Symmetric limbs made `scale.x = -1` useless — need a face + real yaw
- Instant flip felt bad; continuous yaw through **+Z (camera)** so eyes pass the screen
- Combat still uses discrete `facing` ±1 for hitbox offset; visual yaw independent

### Spawn facing bug
- `playerIndex` **1** and **2**; `=== 0 ? 1 : -1` made both face left
- Fix: `playerIndex <= 1 ? 1 : -1`; respawn faces center via `position.x <= 0`

### Attack / walk animation
- Forward swing: **+Z rotation** on shoulder/hip (toward +X face direction)
- **Single attack button** P1 **V**, P2 **\\**; medium removed; C/] repurposed to dodge
- Walk: `sin(walkPhase)` opposite legs; arms counter-swing when not attacking
- Heavy: hold **0.5s** (`HEAVY_CHARGE_TIME`) then fire; early release = **light** (not cancel)

### Attack kit simplification
- Only light + heavy for prototype feel; medium dropped
- One physical button: charge-on-press → light on release or heavy at full charge

---

## 9. Local 1v1 + Team Colors (Jul 15 2026)

### Modes
- Select **PLAYERS** dropdown: `1vAi` (default) | `1v1`
- **1vAi:** single fighter grid for human + **AI SETTINGS** panel (difficulty, fighter type, AI color); bot uses those picks
- **1v1:** two side-by-side panels **P1** / **P2**; same type allowed; match auto-starts when both have a fighter
- Victory copy: `PLAYER 1` / `BOT` vs `PLAYER 1` / `PLAYER 2` depending on mode
- Rematch preserves mode, colors, map, AI settings

### Keyboard (always split — not mode-aware)
| Slot | Move | Jump | Shield | Attack | Dodge |
|------|------|------|--------|--------|-------|
| P1 | A/D | W | S | V (tap light / hold heavy) | C |
| P2 | ←/→ | ↑ | ↓ | `\` (`Backslash`) | `]` (`BracketRight`) |

- Earlier P1 shared arrows with P2; that blocked local 1v1 — fixed by permanent split
- Controls help shows P1 only in 1vAi; dual blocks in 1v1
- C / `]` moved from heavy to **dodge** when attack became one-button

### Team colors
- Palette IDs: `red, blue, yellow, orange, green, cyan, black, white, grey` → `PLAYER_COLORS` hex map
- Applied to **limb material only** (body keeps type/food look) + **overhead inverted triangle** (`ConeGeometry`, tip down)
- Defaults: P1 `red`, P2/AI `blue`
- **Uniqueness:** P1 and P2 must not share a color
  - **1v1:** other panel’s color is a disabled swatch
  - **1vAi:** all swatches enabled; if player picks AI’s color, AI is reassigned to first free id; UI shows “AI color: …”
- Character ctor: `new Character(scene, game, pos, type, playerIndex, teamColorHex)`

### Select UI architecture lessons
- Keep a stable `_fighterArea` ref; rebuild with `_renderFighterArea` on mode / LOOK / color change
- Dual pick: track `_selectedP1Index` / `_selectedP2Index`; set `_dualStarted` before calling `onDualSelect` to avoid double start
- Color pick handlers update Game state via callbacks; uniqueness reassignment lives in UI for 1vAi, with Game spawn still safety-checking duplicate hex

### Files touched
- `src/utils/constants.js` — `PLAYER_MODES`, `PLAYER_COLORS`, `PLAYER_COLOR_IDS`, control maps
- `src/ui/UIManager.js` — PLAYERS dropdown, dual grids, color swatches, controls help
- `src/Game.js` — mode/color state, spawn paths, victory labels
- `src/characters/Character.js` — `teamColor`, limb tint, team marker
- Lore: `lore/players-1v1-mode/PLAN.md`, `DECISIONS.md`

---

## 10. AI Settings, Up-Attacks, Knockback, Attack FX (Jul 15 2026)

### AI difficulty + loadout
- Levels: **Easy / Mid / Hard** (`AI_DIFFICULTY` + `AI_DIFFICULTY_SETTINGS`)
- Per level: reaction delay, ranges, **meleeRange**, **specialChance**, **dodgeVsAttackChance**, jump/shield/attack probs
- Select UI panel on 1vAi only: LEVEL, FIGHTER (**Random** default + optgroups), AI color swatches
- Spawn: `BotController` + `_resolveAiFighterConfig()` — random roster pick when type is `random`/unset
- Bot uses specials by kit (zone mid-range, counter on attack, roll approach, pound/grab vs shield)

### Bot spacing bug
- Symptom: bot stood far away and “attacked” into empty space
- Cause: `attackRange` ~3.5–4 while light/heavy hitboxes only reach ~1.4–2.1
- Fix: lower `attackRange`; add `meleeRange`; in attack state walk in until `distance <= meleeRange` before swinging; mid-range always walks in (no far pokes)

### Heavy knockback
- User feedback: heavy launch too strong twice
- Tuned `BASE_MOVES.heavy.baseKnockback` **22 → 13 → 8**; angle/hitstun slightly reduced
- Formula still `kb * (1 + damage/100) / weight` in `Character.takeHit`

### Up-attacks (hold jump, not “in air”)
- First design aimed up only when airborne; user wanted **hold W / ↑** instead
- `jumpHeld` continuous hold on input state; `aimUp` at attack start freezes kit for that move instance
- `move.aerial` on light/heavy: higher `offsetY`, steeper `angle`; `resolveMoveForStance(move, isForward)`
- Arm: overhead rotation when `attackIsUp`

### Attack visual FX
- Box hitbox mesh replaced by **ball + swoosh bead trail** (cosmetic only; collision still AABB)
- Forward: arc wraps body (over top or camera-side); **never under** the model (`Math.abs` / lift on y)
- Up (W): separate `_layoutSwooshOverTop` — shoulder → crown → tip above head; group not rotated 90° (local +Y = world up)
- Each swing randomizes path via `_randomizeSwooshCurve(visual, aimUp)`
- Lessons: anchoring FX at hitbox center put tails through the body; body-centered wrap + tip-at-reach works better; up-attacks need a dedicated over-top layout, not a rotated forward arc

### Key files
- `src/ai/BotController.js`, `src/utils/constants.js` (`AI_*`)
- `src/moves/MoveSet.js` (`aerial`, `resolveMoveForStance`, heavy kb)
- `src/input/InputManager.js` (`jumpHeld`)
- `src/characters/Character.js` (aimUp, swoosh FX)
- `src/ui/UIManager.js` (`_createAiSettingsPanel`)

---

## 11. Product Direction (Grill Session, Jul 15 2026)

### Branding
- **Official title:** Sushi Town
- **UI:** Character select shows `SUSHI TOWN` + “SELECT YOUR FIGHTER”
- **Browser tab:** `index.html` `<title>Sushi Town</title>`
- **npm package name:** `sushi-town`

### Vision vs current prototype
| Area | Documented / desired | Current code (approx.) |
|------|----------------------|-------------------------|
| Title | Sushi Town | Sushi Town ✓ |
| Roster | Named fighters | **6 foods** (Tempura, California, Dumpling, Wasabi, Gyoza, Onigiri) + specials ✓ |
| Attacks | Light/medium/heavy + specials, grab, dash | **One attack button** (tap light / hold heavy) + hold-jump up-aim; per-fighter specials; Onigiri command grab; **dodge** ✓ |
| Attack FX | Readable juice | Team-colored ball + swoosh; up-attacks over crown ✓ |
| Character art | Food fighters | Procedural food bodies + face/limbs; team color limbs/marker ✓ |
| Facing | Readable direction | Continuous yaw through camera; victory faces screen ✓ |
| Shield | Interactive, fair | Front-only block + HP/break/regen + warped team-color mesh ✓ |
| Dodge | Escape tool | Grounded C / `]` iframes dash; phase-through while dodging ✓ |
| Juice | Hit feel | Knockback-scaled camera shake; idle bob; victory arms-up; procedural SFX ✓ |
| Select flow | Low friction | Selections remembered; victory popup over battlefield ✓ |
| Hitstun / hitlag | Core to feel | Implemented + hit-once per attack ✓ |
| Hitboxes | Data-driven | AABB hitbox vs hurtbox from `MoveSet.js` ✓ |
| Players | Up to 4, gamepad-first | Local **1vAi + 1v1** keyboard; gamepad / 3–4p later |
| Modes | 1v1 / FFA / teams | Selectable **1vAi / 1v1**; **STOCKS 1–5**; FFA/teams later |
| Hazards | Optional stage chaos | **HAZARDS Off/On**; random kind (vent/comet) + random spots ✓ |
| AI | Custom difficulty | Easy/Mid/Hard + type/Random + color; specials by kit ✓ |
| Team ID | Distinct players | **9 team colors**, unique per side ✓ |
| Stages | Several | **6 maps** + Random; stone/wood; backdrop pool (restaurant / koi pond) ✓ |
| Heavy | Charge commitment | Hold **0.5s** then fire; early release cancels ✓ |
| Match start | Fast iterate | No countdown; straight to FIGHT ✓ |

### Chosen architecture for combat feel
- **Hybrid physics:** Rapier for gravity + platforms; custom velocities for knockback, hitstun, DI
- **Hitboxes:** Data-driven AABB (offset/size/active frames) + body hurtbox (limb meshes decorative)
- **States:** Minimal exclusive gating (`FIGHTER_STATE`) — not a full FSM library yet
- **Characters:** Shared light/heavy moveset, **per-character frame data**
- **Stages:** Four themed maps; shared low/mid layer heights for jump consistency
- **Juice:** Particles/shake + limb anim; SFX later

### Delivery sequence
1. **Combat Feel MVP** — implemented; playtest gate open (`lore/combat-feel-mvp/PLAN.md`)
2. Character presentation polish (limbs, facing, walk/punch, roster rename) — done
3. Multi-map + character-select dropdown + layout tuning — done
4. Local **1vAi / 1v1** + team colors — done (`lore/players-1v1-mode/`)
5. AI settings + up-attacks + swoosh FX + heavy kb tune — done
6. Combat polish: one-button attack, directional shield HP, dodge, shake, victory/select UX — done (`lore/combat-polish/`)
7. Roster expansion + specials (Wasabi / Gyoza / Onigiri) — done
8. Random backdrop pool (restaurant / koi pond) — done (`lore/koi-pond-background/`)
9. **Hazard mode** (toggle, random kind/spots, vents + comets) — done (`lore/hazard-mode/`)
10. **Stocks setting** (1–5 on select) — done (`lore/match-stocks/`)
11. Gamepad-first + keyboard
12. Multiplayer (3–4p, AI fill) + FFA/teams
13. More hazard kinds + AI hazard awareness

### Hazard mode findings (Jul 16 2026)
- **Toggle > always-on** — keeps competitive 1v1 clean while party mode is one click
- **Random kind per match** (vent vs comet) beats fixed map hazards for variety without dual chaos
- **Random positions from live platforms** > authored `STAGE_HAZARDS` tables — works for all maps and rematches
- **Always use `takeHit`** for hazard damage so shield/invuln/hitstun stay consistent
- **Telegraph is non-negotiable** — vent glow / comet ground ring before damage
- **Per-player hit cooldown** prevents multi-tick death traps
- Comet: warn on surface first, mesh only during fall; impact burst + larger radius on land
- Vent: sample platform tops with min X separation so both vents aren’t stacked
- Dispose meshes on rematch (`clearMatchEntities`) — hazard particles leak if skipped

### Stocks setting findings
- Single `Game.stockCount` → Character constructor + `createHUD(n)` avoids hard-coded 3 in three places
- Cap 1–5 keeps HUD icons readable without a denser stock UI
- Same select-dropdown + rematch-memory pattern as MAP / HAZARDS / PLAYERS

### Key trade-offs recorded
- Full feature vision kept as north star; **MVP slices** avoid half-done multiplayer
- Specials/grab deferred until feel works so frame data has a solid base
- Medium attack dropped for simpler two-button kit
- Map picker kept on character select (one screen) instead of a second menu step
- Platform heights tuned for **Heavy** (worst jump) so all roster can chain
- Tech debt fixed only when it blocks feel (no rewrite-first)
- AI difficulty tiers for sparring; still not a training-mode project
- Keyboard always split (even in 1vAi) so muscle memory matches 1v1
- Team color tints **limbs + marker only** so food body skins stay readable
- 1vAi color conflict: reassign AI rather than blocking the player’s swatch
- Up-aim on **hold jump**, not airborne state (more intentional control)
- Attack FX is decorative; hitboxes stay data-driven AABB
- Swoosh never under model; up-attacks always over crown
- Food-only art: classic shapes removed once food look was preferred
- Heavy charge (~0.5s hold) adds commitment without multi-tier charge levels
- Match starts with **no countdown** (faster iterate/playtest loop)
- Ground = stone, soft platforms = wood planks (readable stage materials)

See `lore/combat-feel-mvp/DECISIONS.md` (D1–D17) and `lore/players-1v1-mode/DECISIONS.md` (D1–D8).

---

## 12. Play Session Polish (later Jul 15 2026)

### Desktop launcher
- Problem: double-click scripts from Finder don’t load **nvm** → `npm not found`
- Fix: `start-game.sh` sources `$NVM_DIR/nvm.sh` + PATH fallbacks; `SushiTown.command` (no space in name) runs it
- Vite port **3000**; script opens URL when ready; reopens if already running

### Match flow
- Removed pre-fight countdown; `startGame` sets `GAME_STATES.FIGHT` immediately after HUD

### Character dynamics (user list)
1. Run side-to-side body sway with walk cycle
2. Flinch on hit (tilt/nudge from knockback)
3. Jump jerk (squash → stretch) on jump + double jump
4. Attack body swing/twist; arms less overhead
5. Shield crouch + shake + tucked arms

### Eyes / face
- Must parent face to body mesh or it won’t follow body motion
- Blink whole square eye plate, not only black pupils
- Blink more often (~0.5–1.8s between blinks)

### Model detail
- Richer food meshes (tempura sheen/grooves, roll sesame/mayo, dumpling freckles)
- Segmented limbs, hands, feet; no dumpling steam
- Classic style fully removed from code + UI

### Stage materials
- `createStoneGroundMesh` for main ground
- `createWoodPlatformMesh` for one-way platforms
- Theme palette still used for map picker identity; fight surfaces share stone/wood language

### Heavy charge (evolved to single attack button)
- Originally: separate light + heavy keys; heavy held `heavyAttackHeld`
- **Now:** one `ATTACK` key → `attack` / `attackHeld`
  - Press starts charge; **release early → light**; **hold 0.5s → heavy**
  - Bot: brief hold + release for light; ~600ms hold for heavy
- Tuned `HEAVY_CHARGE_TIME` 1.0 → 0.75 → **0.5s**

### Key files (play session polish)
- `src/characters/Character.js` — motion, blink, charge, food detail
- `src/stages/Stage.js` — stone/wood meshes, always-on restaurant
- `src/input/InputManager.js` — `attackHeld` (was heavy-only)
- `src/ai/BotController.js` — charge hold / light release timing
- `src/Game.js` — no countdown, no characterStyle
- `src/ui/UIManager.js` — no LOOK dropdown
- `start-game.sh`, `SushiTown.command` — launcher

---

## 13. Combat Polish (later Jul 15 2026)

### Directional shield
- Full bubble felt wrong: “shielding should only be in the direction you were facing”
- Block check: `isHitFromFront(hitPosition)` — hit X relative to defender X vs `facing`, with small slack
- Mesh: hemisphere parented to character mesh (follows yaw); vertex warp + bob while held
- **Hitbox logic is separate from mesh** — only facing test changes fairness; warp is cosmetic

### Shield HP / break / regen
- Constants in `COMBAT_FEEL`: `SHIELD_MAX_HP` 60, damage mult 1.35, regen delay 0.85s, regen 10/s, break stun 1.35s
- On block: drain HP; at 0 → `breakShield()` (stun state, partial relaunch, then restore ~35% HP)
- Visual: scale by HP ratio; team color → red lerp when low

### Single attack button
- User: only want one attack button (V & `\`); hold = heavy else light
- Input map: `ATTACK` only (removed separate light/heavy key arrays)
- Character charge path owns light vs heavy decision

### Dodge
- Keys: P1 **C**, P2 **]** (`DODGE` in controls)
- Grounded only; dir from left/right or current facing
- Iframes during early window; cooldown prevents spam
- New state `FIGHTER_STATE.DODGE`; invuln via `isInvincible` so combat already ignores hits

### Team-colored combat FX
- Shield material, attack swoosh, and hit particles use `teamColor`
- Blocked hits tint with defender color; successful hits with attacker color

### Camera shake
- No existing shake path; added `Game.addCameraShake` / `updateCameraShake`
- Base cam pose stored in `_camBasePos` / `_camLookAt` (frameCameraToStage writes these)
- Intensity from knockback length × scale; boosted on shield break / KO

### Idle + victory
- Idle: subtle bob/sway when grounded, still, actionable
- Victory: face camera with `targetYaw = -Math.PI / 2` (built face is +X; −π/2 = +Z toward camera)
- Arms raise ~π around Z so hanging limbs point up; `applyFacing` skips combat retarget while `victoryPose`
- Hands: finger nubs removed (cleaner silhouette)

### Victory UI over battlefield
- Opaque full-screen victory hid the stage and pose
- Fix: transparent overlay + bottom panel; only clear HUD nodes, not a solid background
- `Game.render` continues victory pose + residual shake while state is VICTORY

### Selection memory
- `selectedIndexP1/P2` + existing mode/color/stage/AI fields
- Pass into `createCharacterSelect` as `remembered`; dual panels highlight prior picks
- Rematch already called `startGame()` with stored configs — indices make select UI match

### FIGHTER_STATE additions
- `DODGE`, `SHIELD_BREAK` — keep exclusive gating without a full FSM library

### Key files
- `src/characters/Character.js` — shield HP, dodge, idle/victory, front-only block
- `src/moves/MoveSet.js` — `COMBAT_FEEL` shield/dodge constants
- `src/utils/constants.js` — controls, fighter states
- `src/input/InputManager.js` — `attack` / `attackHeld` / `dodge`
- `src/combat/CombatSystem.js` — hitPosition to takeHit, shake, team-color particles
- `src/Game.js` — camera shake, remembered indices, victory pose trigger
- `src/ui/UIManager.js` — victory popup, controls help, select memory
- `src/ai/BotController.js` — specials by kit, dodge/shield defense, light/heavy
- Lore: `lore/combat-polish/`

---

## 14. Roster, specials, axes, presentation (Jul 16 2026)

### Coordinate system (confirmed in code)
| Axis | Meaning | Implementation notes |
|------|---------|----------------------|
| **X** | Horizontal fight axis | Facing ±1, walk, hitbox `offsetX * facing`, horizontal blast zone |
| **Y** | Vertical | Gravity on world `y: -30`, jump, platforms, vertical blast zones |
| **Z** | Depth / camera | Camera at +Z looking at origin; fighters `enabledTranslations(true,true,false)` + force `z=0`; backdrop at negative Z |

Do not invent motion on Z for combat. 2.5D plane is intentional.

### Roster design lessons
- **Uniform size 1.0** keeps hurtbox fairness; differentiate with weight/speed/jump + specials + silhouette.
- **Two heavies is fine** if mobility vs toolkits differ: Dumpling = AoE ground pound; Onigiri = denser tank + command grab.
- **Command grab** should **bypass shield** or it fails its job as anti-turtle; pay for it with startup/endlag + longer CD.
- **Zone specials with DoT puddles** (Wasabi) stack very hard with light weight + high mobility — audit total damage over puddle lifetime, not just projectile hit.
- Select UI should group by **weight class** (LIGHT | MEDIUM | HEAVY columns), not a flat list of 6 cards.

### Silhouette vs collision
- Gyoza half-moon and Onigiri triangle are **visual only**; physics still uses shared sphere/box sizes by type class.
- Prefer solid half-sphere / cone primitives over “C-shaped crescent” arcs if the user wants a **half-moon** (D shape), not a hollow crescent.
- Select-card `clip-path` should match silhouette language so the roster reads before spawn.

### Facing / Y-rotation
- Combat facing is discrete (`±1`); visual facing is continuous yaw on **Y**.
- Turn path should sweep past the camera (−π/2) so the face is readable.
- **Bug class:** any zero-`dt` code path that sets `visualYaw = targetYaw` will kill interpolated turns. Post-physics mesh sync must not snap.
- `TURN_RATE` is the single knob for snappiness (11 ≈ 0.28s / 180°).

### Special wiring pattern
1. Add `SPECIALS.FOO` constants.
2. `Character.handleSpecial` branch on `CHARACTER_TYPES`.
3. State flags (`isRolling`, `isGrabbing`, …) + exclusive gates in `canAttack` / `canSpecial` / `canDodge`.
4. Active frames call into `CombatSystem` (`applyRollHit`, `applyGrabHit`, projectiles, AoE).
5. Cancel specials in `takeHit` and respawn.

### Lantern candle flicker
- Per-light unique `breatheSpeed` + dual `flickerSpeed`s + phase offset avoids synchronized “disco” pulse.
- Drive both `PointLight.intensity` and bulb material `emissiveIntensity` so the paper and the light match.
- Keep ambient/directional game lights steady; only decorative backdrop lights should flicker.

### Balance snapshot (post Jul 16 pass + polish)
| Fighter | Verdict |
|---------|---------|
| Tempura / California / Dumpling | Fair light–mid–heavy triangle; special CD 6s |
| Wasabi | Peered: weight 0.75 / spd 1.15 / jump 15; puddle full strength, CD 7s |
| Gyoza | Peered: slight denser mid; roll dmg 12, CD 7s |
| Onigiri | Denser heavy; hold → throw behind, KB 7.5, CD 7s |

### Later polish lessons (same day)
- **Dodge phase-through:** character colliders need `FILTER_CONTACT_PAIRS`; return `COMPUTE_IMPULSE` when not dodging — `null` disables contact entirely.
- **Command grab feel:** separate hold snap + reverse throw reads better than instant knockback on connect.
- **Select hover blurbs** help roster readability without cluttering cards.
- **AI Random fighter** is a better default than hard-coded Medium.

### Key files (this phase)
- `src/utils/constants.js` — types + `SPECIALS` + `AI_DIFFICULTY_SETTINGS`
- `src/moves/MoveSet.js` — `CHARACTER_SCALE` + `COMBAT_FEEL` dodge tunables
- `src/Game.js` — roster, `_resolveAiFighterConfig`, dodge/grab contact filter
- `src/characters/Character.js` — meshes, specials, grab hold, `TURN_RATE`
- `src/combat/CombatSystem.js` — `applyGrabHit` / `throwGrabTarget`
- `src/ai/BotController.js` — kit-aware specials + defense
- `src/ui/UIManager.js` — classed columns, hover blurbs, Random AI option
- `src/stages/Stage.js` — `lanterns` + `_updateLanterns`
- Lore: `lore/roster-specials-polish/`

---

## 15. Controllers, input modes, Switch Pro WebHID (Jul 18 2026)

### Problem report
- “Controllers not working” with two pads plugged in; OS saw devices; game did not.
- Devices were **Nintendo Switch Pro Controllers** over USB (VID `0x057e`, PID `0x2009`).

### Diagnosis
| Layer | Result |
|-------|--------|
| macOS USB (`system_profiler` / IOUSB) | Two `Pro Controller` devices present |
| Chrome `navigator.getGamepads()` | Length 4, **all slots null** |
| `gamepadconnected` | Never fired in automation/live page |
| Button press wake | Did **not** populate Gamepad API |

Conclusion: not a missing poll loop alone — **Chromium Gamepad API on macOS often never exposes USB Switch Pros**. Keyboard-only path still worked when not blocked by bad pad merge logic.

### Failed / harmful approaches tried first
1. **Merge keyboard + pad always** — pad ownership unclear; keyboard “steals” or dual-drives P1.
2. **Treat axes 2–5 as LT/RT** — right stick / drift → permanent shield → “can’t move/attack”.
3. **Rebind pads by connection order at START** — P2’s claimed pad reassigned to P1.
4. **Cache `Gamepad` objects** — stale snapshots; must re-call `getGamepads()` every frame.

### What worked
1. **Exclusive `INPUT_MODES`:** `keyboard` | `pad` on character select.
   - Keyboard → only `1vAi` / `1v1`.
   - Controllers → FFA allowed; fight is pad-only.
   - Persist: `localStorage['sushiTown.inputMode']`.
2. **Controller count badge** always on select (`CONTROLLERS CONNECTED: N`).
3. **WebHID driver** `src/input/SwitchProHid.js`:
   - Filters Nintendo Pro (and optional Joy-Con PIDs).
   - USB handshake (`0x80` cmds) + enable full reports (`subcommand 0x03` → report `0x30`).
   - Parse standard button bytes + 12-bit sticks (dekuNukem format).
   - Virtual `gamepad.index` base **100**.
4. **Permission UX:** one-time `requestDevice`; then `getDevices()` + `hid.connect` + ~2s poll auto-reopen. Hide allow button when pads already live.
5. **Bind by claimed `gamepadIndex`**; resolve pad fresh each fight frame.
6. **Triggers = buttons 6/7 only** on standard Gamepad API path.

### Switch Pro → game actions (WebHID)
| Control | Action |
|---------|--------|
| Left stick / D-pad | Move |
| A | Jump |
| X | Attack (hold = heavy charge) |
| Y | Dodge |
| R | Special |
| ZR / ZL | Shield |
| B / L | Grab |

### Xbox / standard Gamepad API map
| Control | Action |
|---------|--------|
| LS / D-pad | Move |
| A | Jump |
| X | Attack |
| Y | Dodge |
| RB | Special |
| RT / LT | Shield |
| B / LB | Grab |

### Protocol / API references
- W3C Gamepad: https://w3c.github.io/gamepad/
- WebHID examples: https://developer.chrome.com/docs/capabilities/web-apis/hid-examples
- Switch reverse engineering: https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering  
  (`USB-HID-Notes.md`, `bluetooth_hid_notes.md` standard report layout)

### Key files
- `src/input/InputManager.js` — modes, poll, edges, Gamepad + HID merge
- `src/input/SwitchProHid.js` — WebHID Pro driver
- `src/Game.js` — `inputMode`, HID auto-bind, exclusive fight input
- `src/ui/UIManager.js` — INPUT dropdown, controller badge, allow-once button
- `src/utils/constants.js` — `INPUT_MODES`, player mode helpers
- Lore: `lore/four-controllers/` (D7 / D7b / D7c, PLAN step 12)

### Open questions
- Bluetooth Pro Controllers vs USB reliability on same Mac
- Whether Chrome multi-device HID picker (`multiple: true`) is honored consistently
- Other non-standard pads that need HID (8BitDo native mode, etc.)