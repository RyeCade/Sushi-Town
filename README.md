# Sushi Town

A browser-based 3D platform fighter. Food fighters battle on floating platforms — knock opponents off the stage as damage (and knockback) climbs.

## Play

**macOS:** double-click `SushiTown.command` (or drag it to the Desktop). It starts Vite and opens [http://localhost:3000](http://localhost:3000).

**From a terminal:**

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

```bash
npm run build    # production build → dist/
npm run preview  # serve the built game
```

Needs Node.js (nvm is loaded automatically by the launcher). Chrome or another Chromium browser is best for gamepad / Switch Pro (WebHID) support.

## Modes

- **1vAi** — you vs a bot (Easy / Mid / Hard)
- **FFA** — 2, 3, or 4 players
- **Teams** — 2v2 or 3v1

Stock matches, 1–5 lives (default 3). Optional stage hazards (steam vents, falling comets).

## Controls

| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Move | A / D | ← / → |
| Jump | W | ↑ |
| Attack (tap light / hold heavy) | V | `\` |
| Dodge | C | `]` |
| Special | Left Shift | Enter |
| Shield | S | ↓ |

Hold jump + attack for an up-aimed strike. Keyboard, gamepad, and Switch Pro (USB / WebHID) are supported.

## Roster

| Class | Fighter | Special |
|-------|---------|---------|
| Light | **Tempura** | Hot Oil Splash |
| Light | **Wasabi** | Wasabi Drop |
| Medium | **California** | Counter |
| Medium | **Gyoza** | Takoyaki Roll |
| Medium | **Tamago** | Stink Cloud |
| Heavy | **Dumpling** | Ground Pound |
| Heavy | **Onigiri** | Command grab |
| Heavy | **Ramen** | Noodle Lasso |

## Stages

Sushi Dojo, Wasabi Field, Harbor Night, Soy River, Tempura Tower, Bento Box — or Random.

## Stack

Three.js, Rapier 3D, Vite. Design notes live in `PROJECT.md`.
