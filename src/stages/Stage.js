import * as THREE from 'three';
import { createToonMaterial } from '../gfx/ToonMaterials.js';
import { woodGrainTexture, stoneTexture } from '../gfx/ProceduralTextures.js';
import {
  createWaterMaterial,
  createGodRays,
  createFloatingProps,
  updateStageFX
} from '../gfx/StageFX.js';

export const STAGE_IDS = {
  RANDOM: 'RANDOM',
  DOJO: 'DOJO',
  BATTLEFIELD: 'BATTLEFIELD',
  HARBOR: 'HARBOR',
  SOY_RIVER: 'SOY_RIVER',
  TEMPURA_TOWER: 'TEMPURA_TOWER',
  BENTO_BOX: 'BENTO_BOX'
};

export const PLAYABLE_STAGE_IDS = [
  STAGE_IDS.DOJO,
  STAGE_IDS.BATTLEFIELD,
  STAGE_IDS.HARBOR,
  STAGE_IDS.SOY_RIVER,
  STAGE_IDS.TEMPURA_TOWER,
  STAGE_IDS.BENTO_BOX
];

/** Catalog for map picker UI */
export const STAGE_CATALOG = [
  {
    id: STAGE_IDS.RANDOM,
    name: 'Random',
    blurb: 'Pick a random map each match',
    accent: 0xffcc00,
    swatch: ['#2c1810', '#ffcc00', '#f5e6c8']
  },
  {
    id: STAGE_IDS.DOJO,
    name: 'Sushi Dojo',
    blurb: 'Ground + mid sides + high center',
    accent: 0xc45c26,
    swatch: ['#2a1810', '#c45c26', '#e8b86d']
  },
  {
    id: STAGE_IDS.BATTLEFIELD,
    name: 'Wasabi Field',
    blurb: 'Classic three soft platforms',
    accent: 0x3d8b4f,
    swatch: ['#0f1f14', '#3d8b4f', '#8fd99a']
  },
  {
    id: STAGE_IDS.HARBOR,
    name: 'Harbor Night',
    blurb: 'Asymmetric docks, two layers',
    accent: 0x2a6fdb,
    swatch: ['#0a1628', '#2a6fdb', '#5ec8ff']
  },
  {
    id: STAGE_IDS.SOY_RIVER,
    name: 'Soy River',
    blurb: 'Split banks + mid bridge',
    accent: 0xc4a35a,
    swatch: ['#1a1208', '#c4a35a', '#f0d090']
  },
  {
    id: STAGE_IDS.TEMPURA_TOWER,
    name: 'Tempura Tower',
    blurb: 'Vertical climb, three soft tiers',
    accent: 0xe8a040,
    swatch: ['#1f1408', '#e8a040', '#ffd080']
  },
  {
    id: STAGE_IDS.BENTO_BOX,
    name: 'Bento Box',
    blurb: 'Four-corner soft platforms',
    accent: 0xd94a4a,
    swatch: ['#1a0c0c', '#d94a4a', '#f0a060']
  }
];

export function pickRandomStageId() {
  const i = Math.floor(Math.random() * PLAYABLE_STAGE_IDS.length);
  return PLAYABLE_STAGE_IDS[i];
}

export function resolveStageId(stageId) {
  if (stageId === STAGE_IDS.RANDOM || !PLAYABLE_STAGE_IDS.includes(stageId)) {
    return pickRandomStageId();
  }
  return stageId;
}

const THIN = 0.2;
// Soft platform center Y — balance pass-under vs jump reach
// Ground top y=0.5; fighter height ~1.5; Heavy single jump ~2.4
// Low: headroom under ≥2.0; High: ≤2.0 above low so any fighter can chain jumps
const LAYER_LOW = 2.6;
const LAYER_MID = 4.5;
const LAYER_HIGH = 6.4;

// Backdrop pool — every match (re)builds the stage and randomly picks one.
// Add to this list (and implement a Stage.prototype.addXxxBackdrop method) to add more.
const BACKDROP_BUILDERS = [
  { id: 'sushiRestaurant', build: (stage) => stage.addSushiRestaurantBackdrop() },
  { id: 'koiPond', build: (stage) => stage.addKoiPondBackdrop() }
];

export class Stage {
  constructor(scene, physicsWorld, type = STAGE_IDS.DOJO) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.type = type;

    this.platforms = [];
    this.decorations = [];
    this.bodies = [];
    this.curtains = [];
    this.lanterns = [];
    this.koiFish = [];
    this.lilyPads = [];
    this.bamboo = [];
    this.spawnPoints = [
      new THREE.Vector3(-5, 5, 0),
      new THREE.Vector3(-1.66667, 5, 0),
      new THREE.Vector3(1.66667, 5, 0),
      new THREE.Vector3(5, 5, 0)
    ];
    this.theme = {
      background: 0x1a1a2e,
      fog: 0x1a1a2e,
      ground: 0x888888,
      platform: 0x6a8f6a,
      accent: 0x7a9f7a
    };
    this._waterMaterials = [];
    this._godRays = [];
    this._floatingProps = [];
    this._fxTime = 0;

    this.buildStage();
    this.applyTheme();
    this.addBackdrop(this._pickBackdropId());
  }

  /** Random backdrop id — call once per Stage instance so every match (re)draws fresh. */
  _pickBackdropId() {
    const i = Math.floor(Math.random() * BACKDROP_BUILDERS.length);
    return BACKDROP_BUILDERS[i].id;
  }

  addBackdrop(backdropId) {
    const entry = BACKDROP_BUILDERS.find((b) => b.id === backdropId) ?? BACKDROP_BUILDERS[0];
    entry.build(this);
  }

  buildStage() {
    switch (this.type) {
      case STAGE_IDS.DOJO:
        this.buildDojo();
        break;
      case STAGE_IDS.BATTLEFIELD:
        this.buildBattlefield();
        break;
      case STAGE_IDS.HARBOR:
        this.buildHarbor();
        break;
      case STAGE_IDS.SOY_RIVER:
        this.buildSoyRiver();
        break;
      case STAGE_IDS.TEMPURA_TOWER:
        this.buildTempuraTower();
        break;
      case STAGE_IDS.BENTO_BOX:
        this.buildBentoBox();
        break;
      default:
        this.buildDojo();
    }
  }

  /** Warm dojo — ground → side low → center mid (chainable for Heavy) */
  buildDojo() {
    this.theme = {
      background: 0x2a1810,
      fog: 0x2a1810,
      ground: 0x5c3a24,
      platform: 0xc45c26,
      accent: 0xe8b86d
    };

    this.addPlatform(0, 0, 0, 22, 1, 5, this.theme.ground);
    this.addPlatform(-7, LAYER_LOW, 0, 4, THIN, 3.5, this.theme.platform, { oneWay: true });
    this.addPlatform(7, LAYER_LOW, 0, 4, THIN, 3.5, this.theme.platform, { oneWay: true });
    // Single jump from a side platform (~1.9 vertical)
    this.addPlatform(0, LAYER_MID, 0, 4.5, THIN, 3.5, this.theme.accent, { oneWay: true });

    this.spawnPoints = [
      new THREE.Vector3(-5, 4, 0),
      new THREE.Vector3(-1.66667, 4, 0),
      new THREE.Vector3(1.66667, 4, 0),
      new THREE.Vector3(5, 4, 0)
    ];
    this.addBlastZoneVisualization();
  }

  /** Green field — three same-height platforms, short horizontal hops */
  buildBattlefield() {
    this.theme = {
      background: 0x0f1f14,
      fog: 0x0f1f14,
      ground: 0x2d4a32,
      platform: 0x3d8b4f,
      accent: 0x8fd99a
    };

    this.addPlatform(0, 0, 0, 20, 1, 5, this.theme.ground);
    this.addPlatform(-6, LAYER_LOW, 0, 3.5, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(0, LAYER_LOW, 0, 3.5, THIN, 3.2, this.theme.accent, { oneWay: true });
    this.addPlatform(6, LAYER_LOW, 0, 3.5, THIN, 3.2, this.theme.platform, { oneWay: true });

    this.spawnPoints = [
      new THREE.Vector3(-5, 4, 0),
      new THREE.Vector3(-1.66667, 4, 0),
      new THREE.Vector3(1.66667, 4, 0),
      new THREE.Vector3(5, 4, 0)
    ];
    this.addBlastZoneVisualization();
  }

  /** Blue harbor — low sides, mid inners; jump ground→low→mid */
  buildHarbor() {
    this.theme = {
      background: 0x0a1628,
      fog: 0x0a1628,
      ground: 0x1e3a5f,
      platform: 0x2a6fdb,
      accent: 0x5ec8ff
    };

    this.addPlatform(0, 0, 0, 18, 1, 5, this.theme.ground);
    this.addPlatform(-7, LAYER_LOW, 0, 3.5, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(7, LAYER_LOW, 0, 3.5, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(-3, LAYER_MID, 0, 3.5, THIN, 3.2, this.theme.accent, { oneWay: true });
    this.addPlatform(3, LAYER_MID, 0, 3.5, THIN, 3.2, this.theme.accent, { oneWay: true });

    this.spawnPoints = [
      new THREE.Vector3(-4, 4, 0),
      new THREE.Vector3(-1.33333, 4, 0),
      new THREE.Vector3(1.33333, 4, 0),
      new THREE.Vector3(4, 4, 0)
    ];
    this.addBlastZoneVisualization();
  }

  /** Split banks with a mid bridge — gap pressure + recover over the river */
  buildSoyRiver() {
    this.theme = {
      background: 0x1a1208,
      fog: 0x1a1208,
      ground: 0x5a4030,
      platform: 0xc4a35a,
      accent: 0xf0d090
    };

    // Left / right banks (gap ~4 units in the middle)
    this.addPlatform(-6.5, 0, 0, 7, 1, 5, this.theme.ground);
    this.addPlatform(6.5, 0, 0, 7, 1, 5, this.theme.ground);
    // Bridge over the river
    this.addPlatform(0, LAYER_MID, 0, 5, THIN, 3.2, this.theme.accent, { oneWay: true });
    // Bank-side lips for staging jumps onto the bridge
    this.addPlatform(-5, LAYER_LOW, 0, 3, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(5, LAYER_LOW, 0, 3, THIN, 3.2, this.theme.platform, { oneWay: true });

    this.spawnPoints = [
      new THREE.Vector3(-6, 4, 0),
      new THREE.Vector3(-2, 4, 0),
      new THREE.Vector3(2, 4, 0),
      new THREE.Vector3(6, 4, 0)
    ];
    this.addBlastZoneVisualization();
  }

  /** Vertical climb — center stack low → mid → high */
  buildTempuraTower() {
    this.theme = {
      background: 0x1f1408,
      fog: 0x1f1408,
      ground: 0x4a3020,
      platform: 0xe8a040,
      accent: 0xffd080
    };

    this.addPlatform(0, 0, 0, 18, 1, 5, this.theme.ground);
    this.addPlatform(0, LAYER_LOW, 0, 4.5, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(0, LAYER_MID, 0, 3.5, THIN, 3.2, this.theme.accent, { oneWay: true });
    this.addPlatform(0, LAYER_HIGH, 0, 2.5, THIN, 3.2, this.theme.platform, { oneWay: true });
    // Side recovery lips
    this.addPlatform(-7, LAYER_LOW, 0, 3, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(7, LAYER_LOW, 0, 3, THIN, 3.2, this.theme.platform, { oneWay: true });

    this.spawnPoints = [
      new THREE.Vector3(-5, 4, 0),
      new THREE.Vector3(-1.66667, 4, 0),
      new THREE.Vector3(1.66667, 4, 0),
      new THREE.Vector3(5, 4, 0)
    ];
    this.addBlastZoneVisualization();
  }

  /** Four-corner soft platforms — short hops, multi-angle chaos */
  buildBentoBox() {
    this.theme = {
      background: 0x1a0c0c,
      fog: 0x1a0c0c,
      ground: 0x4a2820,
      platform: 0xd94a4a,
      accent: 0xf0a060
    };

    this.addPlatform(0, 0, 0, 18, 1, 5, this.theme.ground);
    this.addPlatform(-5.5, LAYER_LOW, 0, 3.2, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(5.5, LAYER_LOW, 0, 3.2, THIN, 3.2, this.theme.platform, { oneWay: true });
    this.addPlatform(-5.5, LAYER_MID, 0, 3.2, THIN, 3.2, this.theme.accent, { oneWay: true });
    this.addPlatform(5.5, LAYER_MID, 0, 3.2, THIN, 3.2, this.theme.accent, { oneWay: true });

    this.spawnPoints = [
      new THREE.Vector3(-5, 4, 0),
      new THREE.Vector3(-1.66667, 4, 0),
      new THREE.Vector3(1.66667, 4, 0),
      new THREE.Vector3(5, 4, 0)
    ];
    this.addBlastZoneVisualization();
  }

  addPlatform(x, y, z, width, height, depth, color, { oneWay = false } = {}) {
    const isGround = !oneWay && height >= 0.8;
    const mesh = isGround
      ? this.createStoneGroundMesh(x, y, z, width, height, depth)
      : this.createWoodPlatformMesh(x, y, z, width, height, depth);
    const body = this.physicsWorld.createGround(x, y, z, width, height, depth, { oneWay });
    this.platforms.push({ mesh, body, bounds: { width, height, depth }, oneWay });
    this.bodies.push(body);
    return mesh;
  }

  createStoneGroundMesh(x, y, z, width, height, depth) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const stoneMap = stoneTexture();
    const stoneBase = createToonMaterial({ color: 0x6a6a72, map: stoneMap });
    const stoneDark = createToonMaterial({ color: 0x4a4a52, map: stoneMap });
    const stoneLight = createToonMaterial({ color: 0x8a8a92, map: stoneMap });
    const mortar = createToonMaterial({ color: 0x3a3a40 });

    // Base slab
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), stoneBase);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Top surface mortar plane (slightly raised so seams read)
    const topY = height / 2 + 0.01;
    const mortarPlane = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.995, 0.02, depth * 0.995),
      mortar
    );
    mortarPlane.position.y = topY - 0.005;
    mortarPlane.receiveShadow = true;
    group.add(mortarPlane);

    // Stone tile grid on top
    const tileW = 1.15;
    const tileD = 1.05;
    const gap = 0.06;
    const cols = Math.max(1, Math.floor(width / (tileW + gap)));
    const rows = Math.max(1, Math.floor(depth / (tileD + gap)));
    const usedW = cols * tileW + (cols - 1) * gap;
    const usedD = rows * tileD + (rows - 1) * gap;
    const startX = -usedW / 2 + tileW / 2;
    const startZ = -usedD / 2 + tileD / 2;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const mat = (c + r) % 3 === 0 ? stoneLight : ((c + r) % 2 === 0 ? stoneBase : stoneDark);
        const jitter = ((c * 7 + r * 13) % 5) * 0.01;
        const tw = tileW * (0.92 + ((c + r) % 3) * 0.03);
        const td = tileD * (0.92 + ((c * 3 + r) % 3) * 0.03);
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(tw, 0.08 + jitter, td),
          mat
        );
        tile.position.set(
          startX + c * (tileW + gap) + ((r % 2) * 0.08 - 0.04),
          topY + 0.03,
          startZ + r * (tileD + gap)
        );
        tile.castShadow = true;
        tile.receiveShadow = true;
        group.add(tile);
      }
    }

    // Side rock face chips
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const chip = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 + (i % 3) * 0.1, 0.25 + (i % 2) * 0.1, 0.2),
        i % 2 === 0 ? stoneDark : stoneLight
      );
      chip.position.set(
        side * (width / 2 - 0.15),
        -height / 2 + 0.2 + (i % 4) * 0.15,
        ((i % 5) - 2) * (depth / 6)
      );
      group.add(chip);
    }

    this.scene.add(group);
    return group;
  }

  createWoodPlatformMesh(x, y, z, width, height, depth) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const woodMap = woodGrainTexture();
    const woodDark = createToonMaterial({ color: 0x5a3a1e, map: woodMap });
    const woodMid = createToonMaterial({ color: 0x7a5230, map: woodMap });
    const woodLight = createToonMaterial({ color: 0x9a6b3c, map: woodMap });
    const nailMat = createToonMaterial({
      color: 0x555555,
      emissive: 0x222222,
      emissiveIntensity: 0.2
    });

    // Underside slab
    const slabH = Math.max(height, 0.12);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, slabH * 0.55, depth), woodDark);
    slab.position.y = -slabH * 0.15;
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);

    // Planks along width (boards run in Z, laid side-by-side on X)
    const plankCount = Math.max(3, Math.round(width / 0.55));
    const gap = 0.03;
    const plankW = (width - gap * (plankCount - 1)) / plankCount;
    const plankH = Math.max(height, 0.16);
    const startX = -width / 2 + plankW / 2;

    for (let i = 0; i < plankCount; i++) {
      const mat = i % 3 === 0 ? woodLight : (i % 2 === 0 ? woodMid : woodDark);
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(plankW * 0.98, plankH, depth * 0.98),
        mat
      );
      plank.position.set(startX + i * (plankW + gap), 0, 0);
      plank.castShadow = true;
      plank.receiveShadow = true;
      group.add(plank);

      // Grain lines
      for (let g = 0; g < 2; g++) {
        const grain = new THREE.Mesh(
          new THREE.BoxGeometry(0.015, plankH * 0.15, depth * 0.85),
          woodDark
        );
        grain.position.set(
          startX + i * (plankW + gap) + (g === 0 ? -plankW * 0.2 : plankW * 0.18),
          plankH * 0.35,
          0
        );
        group.add(grain);
      }

      // Nails near ends
      for (const nz of [-depth * 0.35, depth * 0.35]) {
        const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6), nailMat);
        nail.position.set(startX + i * (plankW + gap), plankH * 0.45, nz);
        group.add(nail);
      }
    }

    // Support beams under soft platforms
    if (width < 12) {
      for (const sx of [-width * 0.32, width * 0.32]) {
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.14, depth * 0.9),
          woodDark
        );
        beam.position.set(sx, -plankH * 0.55, 0);
        beam.castShadow = true;
        group.add(beam);
      }
    }

    this.scene.add(group);
    return group;
  }

  applyTheme() {
    // Warm restaurant interior; fog tight so backdrop reads behind the stage.
    const bg = 0x2c1810;
    const fog = 0x3a2418;
    this.theme.background = bg;
    this.theme.fog = fog;
    this.theme.accent = 0xc45c26;
    this.scene.background = new THREE.Color(bg);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(fog);
      this.scene.fog.near = 14;
      this.scene.fog.far = 42;
    } else {
      this.scene.fog = new THREE.Fog(fog, 14, 42);
    }
  }

  /**
   * Classic wooden sushi restaurant backdrop (visual only, behind fight plane z=0).
   * Sized for the tighter camera (just past stage edges).
   */
  addSushiRestaurantBackdrop() {
    const group = new THREE.Group();
    group.name = 'sushiRestaurantBackdrop';

    // Span a bit past widest ground (~22) so edges fill the closer FOV.
    // Wall sits at the back face of the stone ground so the stage reads as a diorama.
    const roomW = 32;
    const wallZ = this._groundBackZ() - 0.05;

    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3d2416, roughness: 0.9, metalness: 0.05 });
    const woodMid = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85, metalness: 0.05 });
    const woodLight = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8, metalness: 0.05 });
    const woodPale = new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.75, metalness: 0.05 });
    const tatami = new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.95, metalness: 0 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.9, metalness: 0, emissive: 0x3a2a10, emissiveIntensity: 0.2 });
    const norenRed = new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.7, metalness: 0.05 });
    const ink = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.9, metalness: 0 });
    const lantern = new THREE.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.4, metalness: 0.1, emissive: 0xffaa33, emissiveIntensity: 0.65 });
    const counterTop = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.35, metalness: 0.15 });

    // Back wall
    const wall = new THREE.Mesh(new THREE.BoxGeometry(roomW + 4, 16, 0.4), woodDark);
    wall.position.set(0, 6, wallZ);
    wall.receiveShadow = true;
    group.add(wall);

    // Horizontal wood planks
    for (let i = 0; i < 8; i++) {
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(roomW + 2, 0.32, 0.12),
        i % 2 === 0 ? woodMid : woodLight
      );
      plank.position.set(0, 0.4 + i * 1.55, wallZ + 0.28);
      group.add(plank);
    }

    // Floor only behind the stone ground (diorama cutoff)
    const roomDepth = Math.max(4, Math.abs(wallZ) + 1);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(roomW + 2, 0.18, roomDepth), tatami);
    floor.position.set(0, -0.55, wallZ + roomDepth / 2);
    floor.receiveShadow = true;
    group.add(floor);

    // Side walls stop at the ground back face
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 15, roomDepth), woodDark);
    leftWall.position.set(-(roomW / 2) - 0.5, 6, wallZ + roomDepth / 2);
    group.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 15, roomDepth), woodDark);
    rightWall.position.set(roomW / 2 + 0.5, 6, wallZ + roomDepth / 2);
    group.add(rightWall);

    // Ceiling beams
    for (let i = -2; i <= 2; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, roomDepth), woodMid);
      beam.position.set(i * 5, 12.2, wallZ + roomDepth / 2);
      group.add(beam);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(roomW + 2, 0.35, 0.4), woodDark);
    ridge.position.set(0, 12.4, wallZ + 1.5);
    group.add(ridge);

    // Shoji panels (3 across — fills mid-frame)
    for (let i = -1; i <= 1; i++) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(6.2, 7, 0.18), woodPale);
      frame.position.set(i * 8, 5.5, wallZ + 0.45);
      group.add(frame);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(5.6, 6.4, 0.08), paper);
      pane.position.set(i * 8, 5.5, wallZ + 0.58);
      group.add(pane);
      for (let g = 0; g < 3; g++) {
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 0.1), woodPale);
        hBar.position.set(i * 8, 3.3 + g * 2.0, wallZ + 0.65);
        group.add(hBar);
      }
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6.4, 0.1), woodPale);
      vBar.position.set(i * 8, 5.5, wallZ + 0.65);
      group.add(vBar);
    }

    // Props sit between the ground back face and the wall (diorama strip)
    const propZ = wallZ + 1.4;
    const midZ = wallZ + 0.7;

    // Sushi counter just behind stone ground
    const counter = new THREE.Mesh(new THREE.BoxGeometry(24, 1.3, 1.2), woodMid);
    counter.position.set(0, 0.85, propZ);
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);
    const counterSurface = new THREE.Mesh(new THREE.BoxGeometry(24.2, 0.14, 1.35), counterTop);
    counterSurface.position.set(0, 1.55, propZ);
    group.add(counterSurface);

    for (let i = -3; i <= 3; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 0.1), woodLight);
      panel.position.set(i * 3.2, 0.8, propZ + 0.7);
      group.add(panel);
    }

    // Shelves + plates on the back wall
    for (let row = 0; row < 2; row++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 0.7), woodPale);
      shelf.position.set(0, 3.6 + row * 1.9, midZ);
      group.add(shelf);
      for (let p = -3; p <= 3; p++) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12),
          new THREE.MeshStandardMaterial({ color: 0xf0e8dc, roughness: 0.5, metalness: 0.1 })
        );
        plate.position.set(p * 2.3, 3.72 + row * 1.9, midZ);
        group.add(plate);
      }
    }

    // Paper lanterns — hang above the diorama strip
    const lanternPositions = [
      [-8, 9.5, propZ], [0, 10, propZ + 0.3], [8, 9.5, propZ],
      [-4, 8.5, propZ + 0.5], [4, 8.5, propZ + 0.5]
    ];
    for (let i = 0; i < lanternPositions.length; i++) {
      const [x, y, z] = lanternPositions[i];
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), ink);
      cord.position.set(x, y + 0.7, z);
      group.add(cord);

      const bulbMat = lantern.clone();
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), bulbMat);
      bulb.position.set(x, y, z);
      bulb.scale.set(1, 1.25, 1);
      group.add(bulb);

      const baseIntensity = 0.55 + (i % 3) * 0.05;
      const light = new THREE.PointLight(0xffaa55, baseIntensity, 14, 2);
      light.position.set(x, y - 0.2, z + 0.4);
      group.add(light);

      this.lanterns.push({
        light,
        bulbMat,
        baseIntensity,
        baseEmissive: 0.55 + (i % 3) * 0.06,
        phase: i * 1.7 + Math.random() * Math.PI,
        breatheSpeed: 0.35 + i * 0.11 + Math.random() * 0.08,
        flickerSpeed: 6.5 + i * 1.9 + Math.random() * 2.5,
        flicker2Speed: 11 + i * 2.4 + Math.random() * 3,
        flickerAmount: 0.12 + (i % 4) * 0.03,
        breatheAmount: 0.22 + (i % 3) * 0.04
      });
    }

    // Noren at stage edges — just behind ground
    const stripH = 2.8;
    const norenZ = wallZ + 1.8;
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 8), woodPale);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(side * 11, 8.2, norenZ);
      group.add(rod);
      for (let n = 0; n < 3; n++) {
        const cx = side * 11 + (n - 1) * 1.3;
        const pivot = new THREE.Group();
        pivot.position.set(cx, 8.0, norenZ);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(1.15, stripH, 0.08), norenRed);
        strip.position.y = -stripH / 2;
        strip.castShadow = true;
        pivot.add(strip);
        group.add(pivot);
        this.curtains.push({
          pivot,
          x: cx,
          phase: n * 0.7 + (side > 0 ? 1.2 : 0),
          sway: 0,
          swayVel: 0
        });
      }
    }

    // Hanging sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.18), woodPale);
    sign.position.set(0, 11, wallZ + 0.9);
    group.add(sign);
    const signInk = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.55, 0.05), ink);
    signInk.position.set(0, 11, wallZ + 1.05);
    group.add(signInk);

    this._floatingProps = createFloatingProps(group, {
      count: 5,
      z: -1.2,
      colors: [0xffcc66, 0xff8866, 0xf0e8dc, 0xff6688]
    });

    this.scene.add(group);
    this.decorations.push(group);
  }

  /**
   * Tranquil koi pond backdrop — wooden garden wall, torii gate, pond surface,
   * lily pads, animated koi fish. Visual-only (no colliders).
   */
  addKoiPondBackdrop() {
    const group = new THREE.Group();
    group.name = 'koiPondBackdrop';
    // Lift the whole pond backdrop so the water/fish reads higher in the framing
    group.position.y = 1.2;

    // Override scene background/fog with a cooler pond palette
    const bg = 0x0e2233;
    const fog = 0x1a3548;
    this.theme.background = bg;
    this.theme.fog = fog;
    this.theme.accent = 0x2a6fdb;
    this.scene.background = new THREE.Color(bg);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(fog);
      this.scene.fog.near = 14;
      this.scene.fog.far = 42;
    } else {
      this.scene.fog = new THREE.Fog(fog, 14, 42);
    }

    const roomW = 32;
    // Entire koi scene lives behind the stone ground (more negative Z than ground back face)
    const groundBack = this._groundBackZ();
    const wallZ = groundBack - 7;
    const pondZ = wallZ + 3;

    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3d2416, roughness: 0.9, metalness: 0.05 });
    const woodMid = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85, metalness: 0.05 });
    const woodPale = new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.75, metalness: 0.05 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.95, metalness: 0.05 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: 0x3e3e44, roughness: 0.98, metalness: 0.04 });
    const moss = new THREE.MeshStandardMaterial({ color: 0x3a5a28, roughness: 0.95, metalness: 0 });
    const water = createWaterMaterial({ color: 0x1c4868, opacity: 0.78, speed: 1.1 });
    const waterDeep = createToonMaterial({
      color: 0x0e2840,
      transparent: true,
      opacity: 0.95
    });
    this._waterMaterials.push(water);
    const grassBright = new THREE.MeshStandardMaterial({ color: 0x5a9a3a, roughness: 0.95, metalness: 0 });
    const grassDark = new THREE.MeshStandardMaterial({ color: 0x3a6a22, roughness: 0.95, metalness: 0 });
    const earth = new THREE.MeshStandardMaterial({ color: 0x6a4e30, roughness: 0.98, metalness: 0 });
    const mud = new THREE.MeshStandardMaterial({ color: 0x3e3220, roughness: 1, metalness: 0 });
    const lilyMat = new THREE.MeshStandardMaterial({ color: 0x2e6022, roughness: 0.6, metalness: 0.0 });
    const lilyFlower = new THREE.MeshStandardMaterial({ color: 0xf0c0c8, roughness: 0.45, metalness: 0.0 });
    const toriiRed = new THREE.MeshStandardMaterial({ color: 0xc83838, roughness: 0.55, metalness: 0.05 });
    const toriiBlack = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.7, metalness: 0.1 });
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x6a8a3a, roughness: 0.85, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x6a9548, roughness: 0.85, metalness: 0 });
    const koiOrange = new THREE.MeshStandardMaterial({ color: 0xff7a30, roughness: 0.5, metalness: 0.05 });
    const koiWhite = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.5, metalness: 0.05 });
    const koiSpot = new THREE.MeshStandardMaterial({ color: 0xff6a20, roughness: 0.5, metalness: 0.05 });

    // Back wall — bamboo grove (vertical poles) in place of the wooden slat fence
    const bambooJointMat = new THREE.MeshStandardMaterial({
      color: 0x4a6a25,
      roughness: 0.85,
      metalness: 0
    });
    const bambooGround = new THREE.MeshStandardMaterial({
      color: 0x2a1f10,
      roughness: 0.98,
      metalness: 0
    });

    // Solid dark backdrop so the bamboo reads against dark fill
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(roomW + 4, 18, 0.3),
      bambooGround
    );
    wall.position.set(0, 6, wallZ);
    wall.receiveShadow = true;
    group.add(wall);

    // Vertical bamboo poles lined across the back wall
    const bambooBack = [];
    const poleSpacing = 1.55;
    const startX = -15.5;
    const endX = 15.5;
    const yBase = -1.6;
    for (let sx = startX; sx <= endX; sx += poleSpacing) {
      const jitter = (Math.sin(sx * 0.7) * 0.2 + Math.cos(sx * 1.3) * 0.15);
      const poleX = sx + jitter;
      const poleH = 13 + (Math.abs(jitter) * 4) + Math.abs(Math.sin(sx * 2.1)) * 2;
      const segments = 5 + Math.floor(Math.abs(Math.cos(sx * 1.7)) * 3);
      const segH = poleH / segments;
      const poleMat = (Math.abs(Math.sin(sx * 0.93)) > 0.5) ? bambooMat : bambooJointMat;

      for (let s = 0; s < segments; s++) {
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18 + ((s * 0.21) % 1) * 0.04, 0.22 + ((s * 0.21) % 1) * 0.04, segH * 0.9, 8),
          poleMat
        );
        seg.position.set(poleX, yBase + s * segH + segH / 2, wallZ + 0.32);
        seg.castShadow = true;
        seg.receiveShadow = true;
        group.add(seg);
      }
      // Joint rings between segments
      for (let s = 1; s < segments; s++) {
        const joint = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.26, 0.16, 8),
          bambooJointMat
        );
        joint.position.set(poleX, yBase + s * segH, wallZ + 0.34);
        group.add(joint);
      }
      // Leafy canopy near the top of each bamboo pole
      const topY = yBase + poleH;
      const leafCount = 3 + Math.floor(Math.abs(Math.sin(sx * 0.81)) * 3);
      for (let l = 0; l < leafCount; l++) {
        const ySpread = 0.6 + ((l * 0.53) % 1) * 1.1;
        const xOff = (l - (leafCount - 1) / 2) * 0.38;
        const zOff = -0.15 + ((l * 0.41) % 1) * 0.4;
        const leafLen = 0.9 + ((l * 0.59) % 1) * 0.7;
        const leaf = new THREE.Mesh(
          new THREE.BoxGeometry(leafLen, 0.05, 0.16),
          leafMat
        );
        leaf.position.set(poleX + xOff, topY - ySpread, wallZ + 0.32 + zOff);
        const baseRotZ = ((l * 0.71) % 1 - 0.5) * 0.7;
        leaf.rotation.z = baseRotZ;
        leaf.rotation.y = (l * 0.93) % (Math.PI * 2);
        group.add(leaf);
        this.bamboo.push({
          mesh: leaf,
          baseRotZ,
          phase: sx * 0.13 + l * 0.7,
          swayAmount: 0.04,
          swaySpeed: 0.7
        });
      }
    }

    // Side walls only behind the ground (from wallZ to groundBack)
    const roomDepth = Math.max(3, groundBack - wallZ);
    const roomMidZ = (wallZ + groundBack) / 2;
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 15, roomDepth), woodDark);
    leftWall.position.set(-(roomW / 2) - 0.5, 6, roomMidZ);
    group.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 15, roomDepth), woodDark);
    rightWall.position.set(roomW / 2 + 0.5, 6, roomMidZ);
    group.add(rightWall);

    // Torii gate — in front of back wall, still behind ground
    const toriiZ = wallZ + 1.4;
    const toriiGroup = new THREE.Group();
    const pillarH = 8.5;
    const leftP = new THREE.Mesh(new THREE.BoxGeometry(0.55, pillarH, 0.55), toriiRed);
    leftP.position.set(-4, pillarH / 2 - 0.6, toriiZ);
    leftP.castShadow = true;
    toriiGroup.add(leftP);
    const rightP = new THREE.Mesh(new THREE.BoxGeometry(0.55, pillarH, 0.55), toriiRed);
    rightP.position.set(4, pillarH / 2 - 0.6, toriiZ);
    rightP.castShadow = true;
    toriiGroup.add(rightP);
    // Black band near tops of pillars
    for (const sx of [-4, 4]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.55), toriiBlack);
      band.position.set(sx, pillarH - 0.6, toriiZ);
      toriiGroup.add(band);
    }
    // Lower crossbeam (kasagi)
    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 0.55), toriiRed);
    beam1.position.set(0, pillarH + 0.05, toriiZ);
    beam1.castShadow = true;
    toriiGroup.add(beam1);
    // Top slab (roof)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.45, 1.1), toriiRed);
    roof.position.set(0, pillarH + 0.7, toriiZ);
    roof.castShadow = true;
    toriiGroup.add(roof);
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(13, 0.18, 0.9), toriiRed);
    roofCap.position.set(0, pillarH + 0.95, toriiZ);
    toriiGroup.add(roofCap);
    // Center plaque under top beam
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.1), toriiBlack);
    plaque.position.set(0, pillarH - 0.6, toriiZ + 0.2);
    toriiGroup.add(plaque);
    group.add(toriiGroup);

    // Stone lantern on the right side of the diorama strip
    const lanternGroup = new THREE.Group();
    const base1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, 6), stone);
    base1.position.y = 0.0;
    lanternGroup.add(base1);
    const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.2, 6), stone);
    base2.position.y = 0.8;
    lanternGroup.add(base2);
    const lightBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), stone);
    lightBox.position.y = 2.0;
    lanternGroup.add(lightBox);
    // Glow inside lantern
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffe2a8, roughness: 0.5, metalness: 0,
      emissive: 0xffaa55, emissiveIntensity: 0.9
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), glowMat);
    glow.position.y = 2.0;
    lanternGroup.add(glow);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4), stoneDark);
    roof2.position.y = 2.85;
    roof2.rotation.y = Math.PI / 4;
    lanternGroup.add(roof2);
    const topFinial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), stoneDark);
    topFinial.position.y = 3.25;
    lanternGroup.add(topFinial);
    // Keep lantern behind ground front edge
    lanternGroup.position.set(10, -0.4, Math.min(wallZ + 2.5, groundBack - 0.8));
    lanternGroup.traverse?.((m) => { if (m.isMesh) m.castShadow = true; });
    group.add(lanternGroup);
    this.lanterns.push({
      light: { intensity: 0.6 },
      bulbMat: glowMat,
      baseIntensity: 0.55,
      baseEmissive: 0.9,
      phase: Math.random() * Math.PI,
      breatheSpeed: 0.42,
      flickerSpeed: 5.8,
      flicker2Speed: 9.4,
      flickerAmount: 0.1,
      breatheAmount: 0.22
    });

    // Pond fully behind stone ground: front rim stays at or behind groundBack
    const pondRadius = 4.2;
    const pondCenterZ = Math.min(pondZ, groundBack - pondRadius - 0.35);
    const pondY = -0.66;
    const waterDepth = -1.4;

    // Deep water (visible bottom of the pond)
    const pondDeep = new THREE.Mesh(
      new THREE.CylinderGeometry(pondRadius - 0.15, pondRadius - 0.4, 0.4, 36),
      mud
    );
    pondDeep.position.set(0, waterDepth, pondCenterZ);
    pondDeep.receiveShadow = true;
    group.add(pondDeep);

    const pond = new THREE.Mesh(
      new THREE.CylinderGeometry(pondRadius, pondRadius, 0.3, 36),
      water
    );
    pond.position.set(0, pondY, pondCenterZ);
    pond.receiveShadow = true;
    group.add(pond);

    // Subtle darker ring at the rim (catches shadow from stones above)
    const pondInnerShadow = new THREE.Mesh(
      new THREE.RingGeometry(pondRadius - 0.6, pondRadius, 36, 1),
      waterDeep
    );
    pondInnerShadow.rotation.x = -Math.PI / 2;
    pondInnerShadow.position.set(0, pondY + 0.16, pondCenterZ);
    group.add(pondInnerShadow);

    // Stones ringing the pond perimeter
    const stoneCount = 28;
    for (let i = 0; i < stoneCount; i++) {
      const angle = (i / stoneCount) * Math.PI * 2 + 0.08 * i;
      const rJ = pondRadius + 0.15 + ((i * 0.61) % 1) * 0.25;
      const sx = Math.cos(angle) * rJ;
      const sz = pondCenterZ + Math.sin(angle) * rJ;
      const sz_rel = sz - pondCenterZ;
      // Skip ring of stones toward back (clips torii/back wall viewing)
      if (sz_rel < -3.5) continue;
      const s = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + ((i * 0.31) % 1) * 0.25, 0),
        i % 2 === 0 ? stone : stoneDark
      );
      s.position.set(sx, pondY + 0.05, sz);
      s.scale.set(1.2, 0.7, 1 + ((i * 0.47) % 1) * 0.2);
      s.rotation.y = i * 0.9;
      s.castShadow = true;
      s.receiveShadow = true;
      group.add(s);
    }
    // Bigger boulders at the front of the pond (still behind ground)
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const bz = Math.min(pondCenterZ + pondRadius * 0.55 + i * 0.15, groundBack - 0.4);
      const b = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.85, 0),
        i % 2 === 0 ? stone : stoneDark
      );
      b.position.set(side * (pondRadius + 0.9 + (i * 0.35)), pondY - 0.05, bz);
      b.scale.set(1.1, 0.85, 1.05);
      b.rotation.y = i * 0.7;
      b.castShadow = true;
      b.receiveShadow = true;
      group.add(b);
    }

    // Earth + grass ring outside the stones
    const grassOuter = pondRadius + 2.6;
    const grassRing = new THREE.Mesh(
      new THREE.RingGeometry(pondRadius + 0.6, grassOuter + 1.6, 36, 1),
      grassBright
    );
    grassRing.rotation.x = -Math.PI / 2;
    grassRing.position.set(0, pondY - 0.1, pondCenterZ);
    grassRing.receiveShadow = true;
    group.add(grassRing);

    // Earth band between stones and grass
    const earthRing = new THREE.Mesh(
      new THREE.RingGeometry(pondRadius + 0.4, pondRadius + 0.7, 36, 1),
      earth
    );
    earthRing.rotation.x = -Math.PI / 2;
    earthRing.position.set(0, pondY - 0.05, pondCenterZ);
    group.add(earthRing);

    // Mowed grass "stripes" (alternating tint, applied via small flat strips)
    for (let i = 0; i < 7; i++) {
      const stripe = new THREE.Mesh(
        new THREE.RingGeometry(
          pondRadius + 0.7 + i * 0.28,
          pondRadius + 0.7 + i * 0.28 + 0.18,
          36, 1
        ),
        i % 2 === 0 ? grassDark : grassBright
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, pondY - 0.08, pondCenterZ);
      group.add(stripe);
    }

    // Grass tufts (small cone clumps) scattered around the perimeter
    for (let i = 0; i < 36; i++) {
      const angle = (i * 137.5) * Math.PI / 180;
      const r = pondRadius + 0.9 + ((i * 0.71) % 1) * (grassOuter - pondRadius - 0.6);
      const x = Math.cos(angle) * r;
      const z = pondCenterZ + Math.sin(angle) * r;
      // Skip back-arc (torii gate footprint) and far front (gap so fighters read)
      const backArc = z < pondCenterZ - 4.0;
      if (backArc && Math.abs(x) < 5.5) continue;
      if (z > pondCenterZ + 3.8) continue;
      const mat = (i % 3 === 0) ? grassBright : grassDark;
      const tuftH = 0.32 + ((i * 0.41) % 1) * 0.45;
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.14 + ((i * 0.59) % 1) * 0.1, tuftH, 5),
        mat
      );
      tuft.position.set(x, pondY - 0.05 + tuftH / 2, z);
      tuft.rotation.z = (((i * 0.71) % 1) - 0.5) * 0.5;
      tuft.castShadow = true;
      group.add(tuft);
    }

    // Dragonfly-style reeds at the back-sides of the pond
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI + (((i * 0.43) % 1) - 0.5) * 0.9;
      const r = pondRadius - 0.4;
      const x = Math.cos(angle) * r;
      const z = pondCenterZ + Math.sin(angle) * r;
      const reedH = 0.9 + ((i * 0.37) % 1) * 0.6;
      const reed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, reedH, 5),
        grassDark
      );
      reed.position.set(x, pondY + reedH / 2, z);
      group.add(reed);
    }

    // Side bamboo stalks (behind ground)
    const sideBambooZ = Math.min(pondCenterZ + 1.2, groundBack - 0.5);
    for (let b = 0; b < 5; b++) {
      const segs = 3;
      for (let s = 0; s < segs; s++) {
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.08, 1.6, 6),
          bambooMat
        );
        const xJ = -roomW / 2 + 1.6 + (b * 0.35);
        seg.position.set(xJ, 12 - s * 1.7, sideBambooZ);
        seg.rotation.z = -0.32 - (b * 0.05);
        seg.castShadow = true;
        group.add(seg);
        this.bamboo.push({
          mesh: seg,
          baseRotZ: seg.rotation.z,
          phase: b * 0.9 + s * 0.7
        });
      }
      // Leafy top
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.4, 0.06),
        leafMat
      );
      leaf.position.set(-roomW / 2 + 2.8 + b * 0.35, 7.5 - b * 0.3, sideBambooZ);
      leaf.rotation.z = -0.7 + b * 0.05;
      group.add(leaf);
      this.bamboo.push({ mesh: leaf, baseRotZ: leaf.rotation.z, phase: b * 0.9 + 1.3 });
    }

    // Lily pads floating on the round pond surface
    this.lilyPads = [];
    const lilyConfig = [
      [-2.4, -0.4, false], [-1.4, 1.0, true], [2.0, 0.5, false], [2.8, -0.3, false],
      [-0.9, 1.4, true], [0.9, -1.2, false], [-2.8, 0.3, false], [2.4, 1.1, true],
      [0.0, 1.5, false], [-1.8, -1.1, false], [1.1, 1.8, false], [2.5, -1.4, false]
    ];
    lilyConfig.forEach(([lx, lz, withFlower], idx) => {
      // Skip if outside pond radius (keeps the round silhouette clean)
      const r = Math.hypot(lx, lz);
      if (r > pondRadius - 0.7) return;

      const padSize = 0.55 + (idx % 3) * 0.08;
      // Pad lies flat on water: cylinder axis stays along Y (default); no rotation needed
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(padSize, padSize, 0.05, 16),
        lilyMat
      );
      pad.position.set(lx, -0.5, pondCenterZ + lz);
      pad.receiveShadow = true;
      group.add(pad);
      this.lilyPads.push({
        mesh: pad,
        baseY: pad.position.y,
        phase: idx * 0.7 + Math.random() * Math.PI
      });
      if (withFlower) {
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 6),
          lilyFlower
        );
        flower.position.set(lx + 0.18, -0.39, pondCenterZ + lz);
        group.add(flower);
      }
    });

    // Koi fish swimming under the water surface. Local frame faces +X (head +X, tail -X)
    // and the WHOLE group rotates around Y per swim direction so the fish visually flips
    // each direction change.
    this.koiFish = [];
    const koiConfigs = [
      { x: -2.2, z:  0.5, dir:  1, color: 'orange', speed: 1.6 },
      { x:  2.4, z: -0.9, dir: -1, color: 'white',  speed: 1.3 },
      { x: -1.0, z: -1.4, dir:  1, color: 'white',  speed: 1.5 },
      { x:  2.6, z:  1.1, dir: -1, color: 'orange', speed: 1.7 },
      { x:  0.3, z:  0.6, dir:  1, color: 'orange', speed: 1.4 },
      { x: -2.5, z:  1.0, dir: -1, color: 'white',  speed: 1.2 }
    ];
    koiConfigs.forEach((cfg, idx) => {
      const fish = new THREE.Group();
      const bodyMat = cfg.color === 'orange' ? koiOrange : koiWhite;

      // Body — long axis is local X (forward); scale narrows Y/Z for fish silhouette
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        bodyMat
      );
      body.scale.set(1.55, 0.6, 0.6);
      fish.add(body);

      // Tail sits at -X (back), tip rotated to point further -X
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.7, 4),
        bodyMat
      );
      tail.rotation.z = Math.PI / 2;     // tip +Y → -X (backward)
      tail.position.x = -0.85;
      tail.scale.set(0.65, 1.0, 0.4);
      fish.add(tail);

      // Dorsal fin: a small triangle on top, default orientation (tip +Y)
      const dorsal = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.45, 4),
        bodyMat
      );
      dorsal.position.set(-0.05, 0.32, 0);
      dorsal.scale.set(0.7, 0.9, 0.5);
      fish.add(dorsal);

      // Pectoral fins stick out from each side of the body (along ±Z)
      for (const sideZ of [-1, 1]) {
        const pectoral = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.28, 4),
          bodyMat
        );
        pectoral.rotation.x = sideZ * Math.PI / 2;  // tip from +Y to ±Z
        pectoral.position.set(0.18, -0.08, sideZ * 0.34);
        pectoral.scale.set(0.5, 0.7, 0.35);
        fish.add(pectoral);
      }

      // White-kohaku spots scattered on the back / sides
      if (cfg.color === 'white') {
        const spots = [
          [ 0.30,  0.10,  0.20, 0.14],
          [-0.30,  0.05, -0.18, 0.12],
          [ 0.05,  0.18, -0.22, 0.10],
          [-0.45,  0.15,  0.10, 0.11],
          [ 0.40, -0.05, -0.05, 0.10]
        ];
        for (const [sx, sy, sz, sr] of spots) {
          const spot = new THREE.Mesh(
            new THREE.SphereGeometry(sr, 8, 6),
            koiSpot
          );
          spot.position.set(sx, sy, sz);
          fish.add(spot);
        }
      }

      // Place fish UNDER the water surface but high enough to read clearly through it
      // (water top ≈ -0.51, deep water at the bottom)
      fish.position.set(cfg.x, -0.58, pondCenterZ + cfg.z);
      // Flip the whole group so it always faces its swim direction
      fish.rotation.y = cfg.dir > 0 ? 0 : Math.PI;
      group.add(fish);
      this.koiFish.push({
        mesh: fish,
        startX: cfg.x,
        dir: cfg.dir,
        speed: cfg.speed,
        baseY: fish.position.y,
        baseZ: fish.position.z,
        phase: idx * 0.85 + Math.random() * Math.PI,
        // Constrain swim range so fish stay inside the round pond
        swimRange: Math.min(1.6, pondRadius - Math.hypot(cfg.x, cfg.z) - 0.6)
      });
    });

    this._floatingProps = createFloatingProps(group, {
      count: 4,
      z: wallZ + 2,
      colors: [0xff7a30, 0xf2e6d0, 0x6a9548, 0x5ec8ff]
    });

    this.scene.add(group);
    this.decorations.push(group);
  }

  // (koi pond backdrop is raised in `addKoiPondBackdrop` via `group.position.y` after building)

  /** Back face of the main stone ground (z) — backdrop sits flush behind it. */
  _groundBackZ() {
    let back = -2.5;
    for (const p of this.platforms) {
      if (p.oneWay) continue;
      const h = p.bounds?.height ?? 0;
      if (h < 0.8) continue;
      const d = p.bounds?.depth ?? 5;
      const z = p.mesh?.position?.z ?? 0;
      back = Math.min(back, z - d / 2);
    }
    return back;
  }

  _updateKoiFish(dt) {
    if (!this.koiFish?.length) return;
    const t = performance.now() * 0.001;
    for (const F of this.koiFish) {
      F.mesh.position.x += F.dir * F.speed * dt;
      if (F.mesh.position.x > F.startX + F.swimRange) {
        F.dir = -1;
        F.mesh.rotation.y = Math.PI;
      } else if (F.mesh.position.x < F.startX - F.swimRange) {
        F.dir = 1;
        F.mesh.rotation.y = 0;
      }
      F.mesh.position.y = F.baseY + Math.sin(t * 1.8 + F.phase) * 0.05;
      // Tiny vertical sway for swimming feel (kept inside pond radius)
      F.mesh.position.z = F.baseZ + Math.sin(t * 0.8 + F.phase * 0.6) * 0.06;
    }
  }

  _updateLilyPads(dt) {
    if (!this.lilyPads?.length) return;
    const t = performance.now() * 0.001;
    for (const L of this.lilyPads) {
      L.mesh.position.y = L.baseY + Math.sin(t * 0.7 + L.phase) * 0.08;
    }
  }

  _updateBamboo(dt) {
    if (!this.bamboo?.length) return;
    const t = performance.now() * 0.001;
    for (const B of this.bamboo) {
      const amp = B.swayAmount ?? 0.025;
      const speed = B.swaySpeed ?? 0.6;
      B.mesh.rotation.z = B.baseRotZ + Math.sin(t * speed + B.phase) * amp;
    }
  }

  /**
   * Gentle idle sway + stronger wave when a character passes in front of a noren strip.
   * @param {number} deltaTime
   * @param {Array<{position: THREE.Vector3, body?: {linvel: () => {x:number,y:number,z:number}}, isDead?: boolean}>} characters
   */
  update(deltaTime, characters = []) {
    const dt = Math.min(deltaTime, 0.05);
    this._fxTime = (this._fxTime ?? 0) + dt;
    this._updateLanterns(dt);
    this._updateKoiFish(dt);
    this._updateLilyPads(dt);
    this._updateBamboo(dt);
    updateStageFX(this, dt, this._fxTime);

    if (!this.curtains.length) return;

    const passRadius = 2.4;
    const spring = 18;
    const damp = 6;

    for (const curtain of this.curtains) {
      let impulse = 0;

      for (const char of characters) {
        if (!char || char.isDead) continue;
        const pos = char.position;
        if (!pos) continue;
        // Curtains sit behind the fight plane; react when fighters are near in X/Y.
        const dx = pos.x - curtain.x;
        const dy = pos.y - 5.5;
        if (Math.abs(dx) > passRadius || Math.abs(dy) > 3.5) continue;

        const near = 1 - Math.min(Math.abs(dx) / passRadius, 1);
        let vx = 0;
        try {
          vx = char.body?.linvel?.()?.x ?? 0;
        } catch {
          vx = 0;
        }
        // Push strip in travel direction; still rustle when standing close.
        impulse += (vx * 0.045 + Math.sign(dx || 1) * 0.8) * near * near;
      }

      // Soft ambient flutter so fabric never looks frozen.
      const idle = Math.sin(performance.now() * 0.0022 + curtain.phase) * 0.04;
      curtain.swayVel += (impulse + idle * 2 - curtain.sway * spring - curtain.swayVel * damp) * dt;
      curtain.sway += curtain.swayVel * dt;
      curtain.sway = THREE.MathUtils.clamp(curtain.sway, -0.55, 0.55);

      curtain.pivot.rotation.z = curtain.sway;
      curtain.pivot.rotation.x = Math.sin(performance.now() * 0.003 + curtain.phase) * 0.03
        + Math.abs(curtain.sway) * 0.12;
    }
  }

  /** Candle-like pulse + flicker; each lantern has its own speeds. */
  _updateLanterns(dt) {
    if (!this.lanterns?.length) return;
    const t = performance.now() * 0.001;

    for (const L of this.lanterns) {
      L.phase += dt * 0.15;

      // Slow dim/bright breathe
      const breathe = 0.5 + 0.5 * Math.sin(t * L.breatheSpeed + L.phase);
      // Layered flicker (candle flutter)
      const flick =
        Math.sin(t * L.flickerSpeed + L.phase * 1.3) * 0.55 +
        Math.sin(t * L.flicker2Speed + L.phase * 2.1) * 0.3 +
        (Math.sin(t * (L.flickerSpeed * 1.7) + L.phase) * 0.5 + 0.5) * 0.15;

      const intensityMul =
        0.55 +
        L.breatheAmount * breathe +
        L.flickerAmount * flick;

      const intensity = Math.max(0.12, L.baseIntensity * intensityMul);
      L.light.intensity = intensity;

      if (L.bulbMat) {
        L.bulbMat.emissiveIntensity = Math.max(
          0.15,
          L.baseEmissive * (0.5 + 0.55 * breathe + 0.35 * Math.max(0, flick))
        );
      }
    }
  }

  addBlastZoneVisualization() {
    const leftLine = this.createBlastLine(-40, -15, 0, -40, 30, 0);
    const rightLine = this.createBlastLine(40, -15, 0, 40, 30, 0);
    this.scene.add(leftLine);
    this.scene.add(rightLine);
    this.decorations.push(leftLine, rightLine);
  }

  createBlastLine(x1, y1, z1, x2, y2, z2) {
    const points = [
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.25 })
    );
  }

  dispose() {
    for (const platform of this.platforms) {
      this.scene.remove(platform.mesh);
      platform.mesh.traverse?.((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      });
      platform.mesh.geometry?.dispose();
      platform.mesh.material?.dispose();
    }
    for (const deco of this.decorations) {
      this.scene.remove(deco);
      deco.traverse?.((child) => {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
      // Lines / plain meshes without traverse children
      if (!deco.isGroup) {
        deco.geometry?.dispose();
        deco.material?.dispose();
      }
    }
    this.platforms = [];
    this.decorations = [];
    this.bodies = [];
    this.curtains = [];
    this.lanterns = [];
    this.koiFish = [];
    this.lilyPads = [];
    this.bamboo = [];
    this._waterMaterials = [];
    this._godRays = [];
    this._floatingProps = [];
  }
}
