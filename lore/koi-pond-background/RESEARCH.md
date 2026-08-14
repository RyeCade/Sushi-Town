# Koi Pond Background — Research

Three.js geometry / orientation lessons captured while iterating on the
backdrop. Each entry: what we tried, what went wrong, what the fix is.

## CylinderGeometry default axis = Y
`new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)`
returns a cylinder whose axis is vertical (`+Y`). Disc faces top (+Y) and
bottom (−Y); the curved side wraps around the Y axis.

- **Lily pads lying flat on water:** leave orientation at default (no
  rotation). The disc caps are horizontal in the XZ plane. The pad's
  "thickness" is the cylinder height.
- **Lily pads standing up perpendicular** (the wrong result): setting
  `pad.rotation.x = Math.PI / 2` rotates the cylinder axis around X by 90°.
  After that the axis points along Z, so the disc caps are vertical and face
  the camera. Reads as a vertical coin standing on edge instead of a flat pad.
- **Vertical cylinder used as a bamboo pole / stalk:** default orientation is
  correct — the cylinder rises along Y.

## ConeGeometry tip points +Y (round base)
`new THREE.ConeGeometry(radius, height, segments)`: wide circular base at
`-Y`, narrow point (tip) at `+Y`.

Axis-flips for fish-tail / dorsal / pectoral layout (using right-hand rule
for rotation):

| Want tip pointing | Rotation |
|-------------------|----------|
| `−X` (backward when fish faces +X) | `rotation.z = +π/2` |
| `+X` (forward) | `rotation.z = -π/2` |
| `+Z` (outward, +Z side) | `rotation.x = +π/2` |
| `−Z` (outward, −Z side) | `rotation.x = -π/2` |
| Default (tip up) | no rotation |

For a fish facing +X we set:
- Tail at `position.x = -0.85`, `rotation.z = +π/2` so the cone tip points
  further −X.
- Dorsal fin at `position.y ≈ 0.32`, no rotation, tip +Y.
- Pectoral fins at sideZ `±0.34`, `rotation.x = sideZ * π/2` so each tip
  points outward along ±Z.

## SphereGeometry scale.fast tip
A sphere scales non-uniformly into a fish silhouette: `body.scale.set(1.55, 0.6, 0.6)`
makes the sphere long along X (forward axis), narrow along Y (height) and Z
(width). With this shape, the head is the wider end of the long axis. Then
attaching a tail / dorsal / pectoral as separate meshes at the relevant local
positions makes the silhouette read as a fish.

## Group rotation vs per-mesh flipping
When an entity has multiple internal parts that need to "point" the right way,
it is much simpler to:
- Place all parts in a single consistent local frame (e.g. body, tail, fin,
  spots set up so the entity faces +X).
- Apply a single `mesh.rotation.y = 0` or `π` to flip the whole entity.

Trying to flip individual sub-meshes for direction sign is fragile — flipping
the tail position AND the tail rotation AND the fins AND the spots all need
to agree. A single group rotation eliminates that whole class of bug.

## Group-level transform for "move everything up"
Lifting an entire scene decoration just requires `group.position.y = X` once
on the parent. No need to walk every child and add the offset. Disposal /
animation paths stay the same — every child still updates / disposes as one
graph node.

## Per-item animation parameters
`_updateBamboo` originally used a fixed `0.025` sway amplitude. Bumping that
default to support optional `swayAmount` / `swaySpeed` per entry kept existing
behaviour (`?? 0.025`) while letting new dense-foliage leaves gust more
freely. Simple `nullish-coalescing` defaults avoid breaking changes.

## `_updateLanterns` reuse for non-paper-lantern flicker
The pre-existing lantern flicker logic is just `breathe + multi-sine flicker`
on `light.intensity` and an optional `bulbMat.emissiveIntensity`. Pushing an
entry with those keys (even for a stone lantern whose `light` is an object
literal) makes the same loop work. We do **not** need a separate updater.

## Smoke-test patterns
- Import the stage module under node ESM with a stub `physicsWorld` whose
  `createGround` returns a plain object — that is enough to construct a
  Stage for non-physics smoke tests.
- Iterate multiple Stage instances in a loop with random backdrop selection
  to verify the registry produces ≈ 50/50 distribution.
- Force a specific backdrop via `stage.addBackdrop(id)` after construction
  to bypass randomization and exercise a particular build path.
- Use `mesh.getWorldPosition(new THREE.Vector3())` to check the effective
  world Y after a group-level transform — quick way to verify lift offsets.
