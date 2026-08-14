# Sushi Town — Combat Feel MVP Decisions

Decisions from the project grill session that scope the combat-feel vertical slice and the path to a polished **Sushi Town** demo.

---

### D1 - [x] Primary goal is a polished, shippable demo

**Context:** Phases 1–5 of the prototype are marked done; needed a north star beyond bugfixes.

**Decision:** Ship a polished demo as the primary goal (not pure learning, content explosion, or full architecture rewrite first).

**Rationale:** Gives a finish line. Architecture and content work still happen, but subordinated to a playable product.

---

### D2 - [x] Demo bar is feature-complete Smash-like systems

**Context:** “Polished demo” could mean a short showcase reel or a thin 1v1 vs AI loop.

**Decision:** Target a feature-complete prototype: documented combat systems working well even if art stays primitive.

**Rationale:** Matches PROJECT.md vision better than a video-only showcase; art can stay placeholders.

---

### D3 - [x] Documented systems include currently stubbed features

**Context:** PROJECT.md lists specials, grab, dash, fast-fall, etc.; code mostly has light/medium/heavy + a shield flag.

**Decision:** Feature-complete means implement systems that exist only as stubs/docs (specials, working shield, grab, dash, recovery, etc.) — not only polish existing three attacks forever.

**Rationale:** Avoid shipping a permanent stub game. Timing of each system is sequenced by D5/D6.

---

### D4 - [x] Long-term players: gamepad-first, up to 4 humans, custom AI, selectable modes

**Context:** Input and multiplayer scope were ambiguous (solo AI vs local 2P vs party).

**Decision:**
- Input: gamepad-first + keyboard
- Players: up to 4 humans with custom AI characters filling/acting as needed
- Modes: selectable 1v1, free-for-all, and teams

**Rationale:** Matches Smash-like party fantasy. Explicitly large; not all in the first slice (see D5).

---

### D5 - [x] Delivery strategy: MVP slice then expand

**Context:** Full vision + thin 1v1 codebase risks half-done everything.

**Decision:** Ship vertical slices; expand only after each slice is playable.

**Rationale:** Protects combat quality and avoids multiplayer scaffolding on broken feel.

---

### D6 - [x] First MVP is 1v1 combat feel only

**Context:** Needed a cut for the first shippable slice.

**Decision:** MVP 1 = harden 1v1 combat feel (hitstun, grounded, knockback/DI, shield). Defer specials/grab/dash and multiplayer scaffolding.

**Rationale:** Feel is the product. Multiplayer multiplies bugs if combat is wrong.

**Post-MVP order:** gamepad → multi (2–4p + modes) → specials and remaining systems.

---

### D7 - [x] Hybrid physics (keep Rapier)

**Context:** RESEARCH.md notes full 3D physics may be overkill; knockback is usually custom.

**Decision:** Keep Rapier for gravity/platform collision; custom velocity for knockback, hitstun, and DI.

**Rationale:** Least rewrite; already locked to 2.5D plane. Pure custom controller or more Rapier-driven hits deferred.

---

### D8 - [x] Combat-feel package is one pass of four pillars

**Context:** Gaps: no hitstun, multi-hit spam, bad grounded, shield is pure invuln.

**Decision:** One milestone covering all four: hitstun/hitlag/one-hit-per-move, grounded/jump, knockback/DI, fairer shield.

**Rationale:** These systems interact; fixing only one produces false confidence.

---

### D9 - [x] Data-driven hitboxes

**Context:** Hits use colored attack meshes + `Box3` intersection; no real hitbox/hurtbox data.

**Decision:** Per-move hitbox offset/size/active frames; body hurtbox; optional debug draw.

**Rationale:** Required for frame data and fair multi-character tuning. Rapier sensors and pure radius checks rejected for MVP complexity/control trade-offs.

---

### D10 - [x] Per-character frame data on a shared moveset

**Context:** Characters only differ by weight/speed/jump today.

**Decision:** Same light/medium/heavy kit; different startup/damage/knockback (and related frame data) per character.

**Rationale:** Differentiation without designing unique specials in MVP 1.

---

### D11 - [x] FD only for feel work

**Context:** Battlefield/Fountain exist in code but are unused.

**Decision:** Keep Final Destination (single platform) as the only MVP stage.

**Rationale:** Isolates combat feel from multi-platform edge cases; enable other stages after feel is good.

---

### D12 - [x] Minimal exclusive states, not a full FSM library

**Context:** Characters use boolean flags; hitstun needs exclusivity.

**Decision:** Minimal exclusive state gating (attack / hitstun / shield / dead / actionable) without introducing an external FSM framework.

**Rationale:** Enough structure for correct feel; full transition tables can wait for specials/multi.

---

### D13 - [x] Only tech debt that blocks feel

**Context:** Known debt: stage dispose, empty `moves/`, duplicate stats, control key overlap, grounded hack.

**Decision:** Fix debt only when it blocks the feel pass (e.g. grounded, combat data path). No full hygiene or rewrite-first.

**Rationale:** Keeps momentum on playtestable combat.

---

### D14 - [x] Minimal juice for MVP 1

**Context:** PROJECT.md phase 5 lists SFX, bloom, chromatic KO, etc.

**Decision:** Keep existing particles/screen shake; no SFX/music/post-process requirement for combat-feel done criteria.

**Rationale:** Feel is mechanical first; audio polish is a later slice.

---

### D15 - [x] AI is barely competent for playtesting

**Context:** Need an opponent to test feel without building a training suite.

**Decision:** Keep a simple approach/attack bot; no advanced punish AI or mandatory training dummy for MVP 1.

**Rationale:** Human can force scenarios; bot only needs to not break new systems (e.g. ignore hitstun).

---

### D16 - [x] Done criteria = playtest checklist

**Context:** Needed a gate before expanding scope.

**Decision:** MVP 1 is done when playtest shows: juggles work, multi-hit spam is gone, slight DI, shield pushback, clean land/jump, fair stocks — not frame-perfect Smash parity or a pure time-box.

**Rationale:** Subjective but product-focused; parity would delay forever.

---

### D17 - [x] Official game title is Sushi Town

**Context:** Working title was “Super Side Scroller”; package/folder already used `sushi-town` / `sushi_town`.

**Decision:** Brand the game as **Sushi Town** everywhere user-facing and in docs: browser title, character select header, PROJECT.md / RESEARCH.md / lore headers.

**Rationale:** Aligns display name with repo identity; “Super Side Scroller” was a generic placeholder.

---

### D18 - [x] Keep current primitive character look

**Context:** Fighters are primitive shapes (triangle / circle / square) with face, eyes, and capsule limbs. Docs previously framed them as temporary placeholders.

**Decision:** The limb/face presentation is **approved art direction**. Keep Group mesh, face/eyes on +X, capsule arms/legs, walk/punch anim. Do not replace with realistic or high-detail models unless the user explicitly asks.

**Rationale:** User feedback (Jul 15 2026): “I really like the way these characters look.” Preserves the readable silhouette and prototype identity.

---

### D19 - [x] Dual character body styles: Classic + Food

**Context:** User tested food-themed bodies (tempura shrimp, California roll with tobiko, dumpling) while keeping limbs/eyes. Wanted ability to switch back to classic shapes.

**Decision:**
- Support `CHARACTER_STYLES.CLASSIC` and `CHARACTER_STYLES.FOOD` on `Game.characterStyle`
- Character select has a **LOOK** dropdown next to **MAP**
- Default LOOK is **Food**
- Select card **titles stay Light / Medium / Heavy** (not Tempura/Roll/Dumpling)
- Food mapping: Light=tempura shrimp, Medium=inside-out roll + full-top orange tobiko, Heavy=dumpling
- Physics/colliders unchanged; only visual body mesh swaps

**Rationale:** Theme fit for “Sushi Town” without locking out the approved classic silhouette. Toggle keeps both for playtest comparison.

---

### D20 - [x] Platform feel: one-way soft platforms + no visual sink

**Context:** Soft platforms needed jump-through-from-below / stand-from-above; characters appeared to sink (physics + legs longer than collider).

**Decision:**
- Soft platforms: Rapier `filterContactPair` (pass while rising; solid when previous feet were above top) + thicker one-way colliders + CCD + post-step surface snap for all platforms
- Visual feet: compute `_visualFootDepth` from leg geometry; lift mesh so soles align with physics feet
- One-way filter uses pre-step feet Y; snap kills downward velocity when supported

**Rationale:** JS Rapier lacks `modify_solver_contacts` one-way helper; hybrid filter + snap is reliable. Sink was mostly mesh/collider mismatch, not only solver soft contact.

---

### D21 - [x] Food LOOK gets sushi restaurant backdrop; camera frames stage edges

**Context:** Food character skins needed a matching environment. Camera was too pulled back (empty space past platforms).

**Decision:**
- When LOOK is **Food**, every stage loads a wooden sushi restaurant backdrop behind the fight plane and warm short-range fog
- Classic LOOK keeps map theme colors only (no restaurant set)
- Camera uses perspective FOV 50 and `frameCameraToStage()` so horizontal view just clears the furthest platform edge (+ small margin)
- Backdrop scaled for that tighter frame; user confirmed “looks good”

**Rationale:** Ties Food skins to Sushi Town theme without changing Classic presentation. Edge-based framing keeps action readable and fills the screen with stage + set.
