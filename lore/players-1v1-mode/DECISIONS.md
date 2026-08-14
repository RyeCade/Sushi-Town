# Players 1v1 Mode Decisions

Local multiplayer mode toggle (1vAi / 1v1) on the character select screen.

---

### D1 - [x] 1v1 uses two side-by-side character grids

**Context:** Needed a selection UX for two human players.

**Decision:** Two side-by-side grids titled **P1** and **P2**.

**Rationale:** Clear ownership of each pick; matches user request for dual selection UI.

### D2 - [x] 1vAi keeps single-player select

**Context:** Current flow is one grid for the human; bot auto-picks a different type.

**Decision:** Keep single grid for 1vAi; bot still auto-picks a different character type.

**Rationale:** Minimal change to existing UX; dual grids only when both slots are human.

### D3 - [x] Same character type allowed for both players in 1v1

**Context:** Whether P1 and P2 can both choose Light/Medium/Heavy.

**Decision:** Yes — same type is allowed.

**Rationale:** Simpler UX; mirror matches are normal in fighting games.

### D4 - [x] Always split keyboard layouts (not mode-aware)

**Context:** P1 currently shares WASD and arrows; P2 needs arrows in 1v1.

**Decision:** Always use the new fixed layouts for both modes:
- P1: A/D move, W jump, S shield, V light, C heavy
- P2: arrows move/jump/shield, `\` light, `]` heavy

**Rationale:** Consistent muscle memory; avoids surprise when switching modes.

### D5 - [x] 1v1 match starts when both panels have a selection

**Context:** When to leave character select in dual-grid mode.

**Decision:** Selecting a card assigns that panel; match starts automatically once both P1 and P2 have a character.

**Rationale:** Fastest local flow; no extra button required.

### D6 - [x] P2 attack keys are Backslash and BracketRight

**Context:** User specified light `\` and heavy `]`.

**Decision:** `LIGHT_ATTACK: ['Backslash']`, `HEAVY_ATTACK: ['BracketRight']`.

**Rationale:** Matches US keyboard codes for those glyphs.

### D7 - [x] Team colors: limbs + overhead triangle; unique per side

**Context:** Players need a visible team identity independent of fighter type/food skin.

**Decision:**
- Palette: red, blue, yellow, orange, green, cyan, black, white, grey (`PLAYER_COLORS`)
- Apply to limb material + inverted cone marker above the head (body look unchanged)
- Defaults: P1 red, P2/AI blue
- P1 and P2 never share a color

**Rationale:** Food body skins stay readable; color is for team ID, not body paint.

### D8 - [x] 1vAi reassigns AI color instead of blocking the player

**Context:** When the human picks the AI’s current color, uniqueness still required.

**Decision:** In 1vAi all swatches are enabled; picking the AI’s color reassigns AI to the next free id. In 1v1 the opponent’s color remains a disabled swatch.

**Rationale:** Player should always get the color they click; AI is flexible.

### D9 - [x] AI loadout and difficulty are player-selectable on 1vAi

**Context:** Bot previously auto-picked a different type and used fixed mid-tier AI.

**Decision:** AI SETTINGS panel: Easy/Mid/Hard, fighter type, AI color. Bot spawns with those choices.

**Rationale:** User requested explicit control for sparring variety.

### D10 - [x] Up-attacks on hold jump (not airborne-only)

**Context:** First pass aimed attacks up only while airborne.

**Decision:** Up kit when **jump is held** at attack press (`jumpHeld`), ground or air.

**Rationale:** Matches user intent for intentional up-tilt style inputs.

### D11 - [x] Attack FX is ball + body-wrapping swoosh; up-attacks over crown

**Context:** Box hitbox mesh looked blocky; tails clipped the model; under-body arcs looked wrong; W-attacks needed over-top path.

**Decision:**
- Cosmetic bead trail + tip ball
- Forward: wrap over top or camera-side only (never under)
- Up: dedicated over-crown layout; group uses world-up (+Y)

**Rationale:** Readable juice without fighting the silhouette.
