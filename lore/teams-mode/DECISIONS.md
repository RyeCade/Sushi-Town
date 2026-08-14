# Teams Mode Decisions

Add dedicated team match modes (2v2, 3v1) with shared team colors, friendly-fire off, and last-team-standing wins.

---

### D1 - [x] Match ends on last team standing

**Context:** Current `checkMatchEnd` ends when one individual has stocks left. Shared colors create teams that should win together.

**Decision:** Match ends when every remaining alive player shares the same `teamColor` (including a solo survivor on a unique color). Victory names the winning team/color (and can list living members).

**Rationale:** Matches the player’s “teams mode” intent; avoids forcing teammates to eliminate each other via stocks only.

---

### D2 - [x] Bots only target enemies

**Context:** `BotController.findTarget` picks the nearest living fighter and would path into teammates.

**Decision:** Skip characters with the same `teamColor` as the bot (and still skip self/dead/no stocks).

**Rationale:** Friendly fire is off; targeting allies is useless and looks broken.

---

### D3 - [x] Dedicated Teams mode options (not free FFA sharing)

**Context:** Could unlock shared colors in FFA or add explicit team formats.

**Decision:** New PLAYERS options: **2v2** and **3v1**. FFA keeps unique colors.

**Rationale:** Clear match intent, preset team slots, no accidental same-color FFAs.

---

### D4 - [x] Support 2v2 and 3v1

**Context:** Which team formats to ship first.

**Decision:** Both **2v2** (two pairs) and **3v1** (one solo vs three).

**Rationale:** Covers the main party layouts without free-form splits yet.

---

### D5 - [x] Preset team slots; recolor propagates to teammates

**Context:** How colors map to teams.

**Decision:**
- **2v2:** slots 0+1 = team A, slots 2+3 = team B
- **3v1:** slot 0 = solo team, slots 1+2+3 = majority team
- Changing one slot’s color sets **all teammates** to that color
- Team colors must remain **distinct between opposing teams** (enemy team cannot share your color)

**Rationale:** Simple mental model; color *is* team identity; UI stays one swatch row per player but acts as team picker.

---

### D6 - [x] Keyboard: 2 humans + CPU fill; pads: full join

**Context:** Team modes need 4 slots; keyboard only has two human control maps.

**Decision:**
- Team modes available on **keyboard and pads**
- **Keyboard:** P1 + P2 human (split keys); remaining slots = CPU on preset teams
- **Pads:** same join flow as FFA 4 (empty slots = CPU on START)
- `isKeyboardPlayerMode` includes 2v2 and 3v1 (do not force-fallback to FFA 2)

**Rationale:** Lets keyboard users play teams with bots filling; pads support full multiplayer.

---

### D7 - [x] FFA still enforces unique colors

**Context:** Whether ad-hoc teams should form in FFA via shared colors.

**Decision:** Unique colors remain enforced in 1vAi / FFA 2/3/4. Shared colors only in 2v2 / 3v1.

**Rationale:** Keeps FFA free-for-all; teams are an explicit mode choice.

---

### D8 - [x] Friendly interactions: no damage, grabs, or body collisions between teammates

**Context:** User requirement — damage, grabs, collisions cannot happen between teammates.

**Decision:**
- All combat hit paths skip same-`teamColor` targets (melee, projectiles, puddles, AoE, roll, grab, lasso, stink cloud, etc.)
- Physics `filterContactPair` returns `EMPTY` when both bodies are characters with the same `teamColor` (phase through teammates)
- Self still excluded as today (`target === attacker`)

**Rationale:** Direct mapping of the feature request; `teamColor` hex is already the shared identity on `Character`.

---

### D9 - [x] Teammate identity is `teamColor` hex equality

**Context:** Need a single check used by combat, physics, bots, and match end.

**Decision:** Add `areTeammates(a, b)` (or `Character.isTeammate(other)`) comparing `teamColor` (numeric hex). Slot `colorId` only matters at spawn/select; runtime uses character `teamColor`.

**Rationale:** Characters already carry `teamColor`; combat FX already key off it; no new teamId field required for MVP.
