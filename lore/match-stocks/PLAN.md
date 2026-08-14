# Match Stocks Setting Implementation Plan

Character-select **STOCKS** option (1–5 lives). Default 3; rematch preserves.

> **Agent Reminder:** Update this plan document to mark each step as it is completed.

- [x] 1. State
   - [x] a. `Game.stockCount` default 3; `STOCK_OPTIONS` in constants
   - [x] b. `onStockCountChanged` clamp 1–5
- [x] 2. UI
   - [x] a. STOCKS dropdown on character select (with MAP / HAZARDS)
   - [x] b. Pass selected count into `createCharacterSelect` / remember on rematch
- [x] 3. Runtime
   - [x] a. `Character` init: `stocks = game?.stockCount ?? 3`
   - [x] b. `createHUD(stockCount)` builds N stock icons
   - [x] c. Existing `updateStocks` still works for remaining lives
- [x] 4. Docs
   - [x] a. PROJECT.md round system + select UI + Phase 20
