# Koi Pond Background — Decisions

## Goal
Add a tranquil koi pond backdrop variant and randomly pick between available
backdrops per match. Iterate on visual + animation details until the pond reads
correctly from the side-on camera.

## Decisions

### Backdrop registry
1. Backdrop pool lives in a registry (`BACKDROP_BUILDERS`) at the top of
   `src/stages/Stage.js`. Adding a backdrop = build an `addXxxBackdrop()` method
   on Stage and push an entry into the array — no other wiring needed.
2. Backdrop is re-rolled **per Stage instance**. Match restart already calls
   `clearMatchEntities()` → `dispose()` → `new Stage(...)`, so rematches re-roll
   the backdrop cleanly. ~50/50 split verified by 50-trial node smoke test.
3. Backdrop methods own their own scene background/fog colors. The generic
   `applyTheme()` keeps a sensible default; backdrops override at the start of
   their build method.

### Animation arrays
4. New animation arrays (`koiFish`, `lilyPads`, `bamboo`) are initialized to
   `[]` in the constructor and reset in `dispose()`. `_updateLanterns`,
   `_updateKoiFish`, `_updateLilyPads`, `_updateBamboo` all early-return on
   empty arrays so the sushi-restaurant backdrop works unchanged.
5. Koi pond borrows one row of the lantern flicker system so the stone-lantern
   glow pulses with the same candle pattern; the same `_updateLanterns` driver
   works because we just push a lantern entry into `this.lanterns`.

### Visual layout
6. **Back wall = bamboo grove**, not a wooden-slatted fence. Vertical poles
   built from 5–7 stacked `CylinderGeometry` segments with darker joint rings
   between sections. Heights, x-jitter, segment counts and pole tint all vary
   deterministically per pole so the grove doesn't read as a stamped pattern.
7. **Side walls stay wooden** so the bamboo reads as a feature backdrop
   instead of an overwhelming ring.
8. **Round pond** = `CylinderGeometry` radius 6.5, plus a darker `mud`
   `CylinderGeometry` deeper in the column for visible depth, and a thin
   `RingGeometry` shadow ring at the rim.
9. **Fish live under the water surface** (`baseY = -0.58` against water top
   ≈ −0.51). Water opacity dropped to 0.72 so fish read clearly through it.
10. **Grass surrounds the pond**: an outer `RingGeometry` grass band, alternating
    mowed-grass stripe rings, ~36 cone-clump grass tufts placed on the golden
    angle (skipping the torii back-arc), and reeds along the back water edge.

### Fish orientation (iteration lesson)
11. Fish "facing the swim direction" is handled by **rotating the whole group
    around Y**: all body parts (body, tail, dorsal, pectoral, kohaku spots) live
    in a fixed local frame facing +X. `fish.rotation.y = 0` for `dir = 1`,
    `π` for `dir = -1`. `_updateKoiFish` toggles between the two values when the
    fish crosses its `swimRange` boundary.
12. Tail cone `tip` is at `+Y` by default. To send the tip backward (away from a
    fish facing +X) use `tail.rotation.z = +π/2` (+Y → −X). The same rotation
    applies to the dorsal fin when we want it tilted; otherwise the dorsal fin
    uses default orientation with `tip +Y` (pointing up).
13. Pectoral fins stick out along ±Z. `rotation.x = sideZ * π/2` sends the
    cone tip from +Y to ±Z respectively.

### Lily-pad pitfall (and fix)
14. `CylinderGeometry`'s default axis is **Y**. With `rotation.x = π/2` the
    cylinder axis swings to Z, so the disc faces the camera and the pad stands
    vertical instead of lying flat on water. **Lily pads keep the default
    orientation (axis Y)** so the disc lies flat in the XZ plane.

### Animation drivers
15. `_updateBamboo` reads optional `swayAmount` and `swaySpeed` per entry,
    falling back to `0.025` / `0.6`. This lets dense grove leaves gust while
    side stalks stay subtle without two separate update methods.
16. `_updateKoiFish` no longer touches `rotation.y` outside direction flips;
    rotation lives on data, not on per-frame math, so direction changes and
    y/z bobs don't fight each other.

### Lift
17. Whole koi-pond backdrop group is lifted via `group.position.y = 1.2` so
    the pond + fish read higher in the camera framing. Lifting the group
    (instead of every child mesh) keeps every relative offset intact and the
    dispose path clean.

## Verification
- 50-trial randomization test: 27 sushi-restaurant / 23 koi-pond (~50/50).
- Forced koi-pond build: 6 lanterns, 6 koi, 12 lily pads, 20+ sway entries
  → updates + dispose clean.
- Direction-flip smoke test: a sim with dt 0.05 takes ~50 s for a fish to
  flip rotation when it hits `startX + swimRange`.
