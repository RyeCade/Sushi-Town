# Koi Pond Background — Plan

Steps as executed (Phase 18 + iteration).

## 1. Backdrop registry + randomization
- [x] Add `BACKDROP_BUILDERS` registry at the top of `src/stages/Stage.js`
  with two entries: `sushiRestaurant` → `addSushiRestaurantBackdrop`,
  `koiPond` → `addKoiPondBackdrop`.
- [x] Replace the unconditional
  `this.addSushiRestaurantBackdrop()` in the Stage constructor with
  `this.addBackdrop(this._pickBackdropId())`.
- [x] Implement `_pickBackdropId()` (`Math.floor(Math.random() * length)` of
  `BACKDROP_BUILDERS`) and `addBackdrop(id)` dispatcher (defaults to first
  entry if id unknown).
- [x] Verify randomization with a 50-trial node smoke test (~50/50 split).

## 2. Koi pond backdrop (first pass)
- [x] Implement `addKoiPondBackdrop()` covering wooden back wall, torii gate,
  rectangular pond water surface, lily pads, koi fish, bamboo stalks, stone
  lantern, moss patches.
- [x] Initialize `this.koiFish`, `this.lilyPads`, `this.bamboo` as
  empty arrays in the Stage constructor and in `dispose()`.
- [x] Wire new animation helpers (`_updateKoiFish`, `_updateLilyPads`,
  `_updateBamboo`) into `update()`.

## 3. Visual iteration (back wall + pond geometry + grass + fish)
- [x] **Back wall = bamboo grove** (no slats / trim): vertical poles built
  from stacked `CylinderGeometry` segments, joint rings between sections,
  leaf-blade canopies at each pole top. Reuses `bambooMat` / `leafMat`
  with a new `bambooJointMat`. Per-pole x-jitter, height, segment count,
  and tint vary deterministically.
- [x] **Round pond**: replace `BoxGeometry` water with
  `CylinderGeometry(pondRadius, pondRadius, 0.3, 36)`. Add a darker mud
  disk (`mud` material) underneath for depth, plus a `RingGeometry` shadow
  ring at the rim.
- [x] **Stones ring the circular perimeter** (~28 dodecahedron boulders)
  plus 4 larger front-edge boulders; compute positions from polar coords.
- [x] **Grass around the pond**: outer `RingGeometry` grass band,
  alternating mowed-grass stripe rings, ~36 cone-clump tufts on the golden
  angle (skipping the torii back-arc), reeds along the back water edge.
- [x] **Fish under the water**: lower `baseY` from `-0.5` to `-0.58`;
  water opacity dropped from 0.9 → 0.72 so fish read clearly through it.
- [x] **Fish flip visually**: rebuild fish so all parts (body, tail,
  dorsal, pectoral, kohaku spots) live in a local frame facing +X, then
  apply `mesh.rotation.y = (dir > 0 ? 0 : π)` at spawn and on every
  direction-change in `_updateKoiFish`.

## 4. Lily-pad pitfall fix
- [x] Remove `pad.rotation.x = π/2` (which made the cylinder axis Z and
  stood the pad up vertically like a coin facing the camera). Keep default
  Y-axis orientation so the disc lies flat in the XZ plane.

## 5. Animation enrichments
- [x] Update `_updateBamboo` to read optional `swayAmount` / `swaySpeed`
  per entry (with `0.025` / `0.6` fallbacks). Add `swayAmount: 0.04,
  swaySpeed: 0.7` to grove-leaf entries so they gust more freely than the
  side stalks.

## 6. Lift
- [x] Lift the entire koi-pond backdrop group via `group.position.y = 1.2`,
  applied once at the top of `addKoiPondBackdrop()`. Verified by inspecting
  `mesh.getWorldPosition()` for fish / lily pads.

## 7. Docs
- [x] Update `PROJECT.md` to reflect randomized backdrop pool and the
  koi pond composition; add Phase 18 entry.
- [x] Write `lore/koi-pond-background/DECISIONS.md` (this iteration's
  design choices and pitfalls).
- [x] Write `lore/koi-pond-background/RESEARCH.md` (Three.js geometry
  notes and lessons captured along the way).
