# Match Stocks Decisions

### D1 - [x] Select dropdown, not in-fight toggle

**Context:** Stock count is a match rule, not mid-fight.

**Decision:** Character-select **STOCKS** 1–5; locked for the match; rematch keeps value.

**Rationale:** Same pattern as MAP / HAZARDS / PLAYERS.

---

### D2 - [x] Cap at 5

**Context:** HUD icons are discrete circles; very high stocks clutter UI.

**Decision:** Clamp to 1–5 (`STOCK_OPTIONS`).

**Rationale:** Enough for quick vs long sets without UI redesign.

---

### D3 - [x] Single source: Game.stockCount

**Context:** Hard-coded `stocks = 3` in Character and HUD would desync.

**Decision:** Character reads `game.stockCount` at construct; HUD receives the same value from `startGame`.

**Rationale:** One knob, both players always match.
