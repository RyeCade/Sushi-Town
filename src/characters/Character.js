import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d';
import { CHARACTER_TYPES, FIGHTER_STATE, MOVEMENT, SPECIALS } from '../utils/constants.js';
import {
  getMoveSet,
  getMoveTotalDuration,
  isMoveActive,
  resolveMoveForStance,
  HURTBOX,
  COMBAT_FEEL
} from '../moves/MoveSet.js';
import { audio } from '../audio/AudioManager.js';
import {
  createToonMaterial,
  addOutlinesToGroup,
  createFootShadow
} from '../gfx/ToonMaterials.js';
import { riceTexture, batterTexture, noriTexture } from '../gfx/ProceduralTextures.js';

const UNIFORM_SIZE = 1.0;
// rad/s — ~0.28s for a 180° Y-turn so the face clearly sweeps past the camera
const TURN_RATE = 11;
const WALK_CYCLE_SPEED = 10;
const WALK_LEG_SWING = 0.55;
const WALK_ARM_SWING = 0.35;
const RUN_BODY_SWAY = 0.12;
const RUN_BODY_LEAN = 0.08;
const FLINCH_DURATION = 0.22;
const FLINCH_TILT = 0.35;
const FLINCH_NUDGE = 0.12;
const JUMP_JERK_DURATION = 0.18;
const JUMP_JERK_SQUASH = 0.18;
const JUMP_JERK_STRETCH = 0.14;
const DOUBLE_JUMP_FLIP_DURATION = 0.28;
const ATTACK_BODY_SWING = 0.28;
const ATTACK_BODY_TWIST = 0.45;
const ATTACK_BODY_LIFT = 0.06;
const SHIELD_CROUCH = 0.14;
const SHIELD_SQUASH = 0.12;
const SHIELD_SHAKE = 0.035;
const SHIELD_SHAKE_SPEED = 28;
const SHIELD_WARP_SPEED = 3.2;
const SHIELD_WARP_AMOUNT = 0.08;
const SHIELD_BOB_AMOUNT = 0.04;
const SHIELD_SCALE_PULSE = 0.06;
const BLINK_DURATION = 0.1;
const BLINK_MIN_GAP = 0.5;
const BLINK_MAX_GAP = 1.8;
const HEAVY_CHARGE_TIME = 0.5;
const IDLE_BOB_SPEED = 2.2;
const IDLE_BOB_AMOUNT = 0.035;
const IDLE_SWAY = 0.04;
const VICTORY_POSE_DURATION = 2.5;

export class Character {
  constructor(scene, game, position, type, playerIndex, teamColor = 0xff2222) {
    this.scene = scene;
    this.game = game;
    this.type = type;
    this.playerIndex = playerIndex;
    this.teamColor = teamColor;

    this.damage = 0;
    /** Team color of last character who dealt damage (for HUD % tint). */
    this.damageColor = null;
    /** Seconds since last attack/special — feeds anti-camp coward damage. */
    this.cowardIdleTimer = 0;
    this.cowardTickAcc = 0;
    this.stocks = game?.stockCount ?? 3;
    this.isGrounded = false;
    this.canDoubleJump = true;
    /** Must release jump after leaving ground before aerial double jump can fire. */
    this.airJumpArmed = false;
    this.isInvincible = false;
    this.isShielding = false;
    this.isDead = false;
    this.isBot = false;
    this.isDodging = false;
    this.shieldBroken = false;

    this.fighterState = FIGHTER_STATE.ACTIONABLE;
    this.hitstunTimer = 0;
    this.hitlagTimer = 0;
    this.shieldStunTimer = 0;
    this.shieldHp = COMBAT_FEEL.SHIELD_MAX_HP;
    this.shieldRegenDelay = 0;
    this.shieldBreakTimer = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.dodgeDir = 1;
    this.idlePhase = 0;
    this.victoryPose = false;
    this.victoryTimer = 0;
    // P1 (index 1, left spawn) faces right; P2 (index 2, right spawn) faces left
    this.facing = playerIndex <= 1 ? 1 : -1;
    // Built facing +X; -π faces left. Turns always swing through -π/2 (toward camera).
    this.visualYaw = this.facing >= 0 ? 0 : -Math.PI;
    this.targetYaw = this.visualYaw;
    this._lastFacing = this.facing;
    this.walkPhase = 0;
    this.flinchTimer = 0;
    this.flinchDuration = 0;
    this.flinchDir = 1;
    this.jumpJerkTimer = 0;
    this.jumpJerkDuration = 0;
    this.doubleJumpFlipTimer = 0;
    this.doubleJumpFlipDir = 1;
    this.shieldPhase = 0;
    this.blinkTimer = 0;
    this.blinkOpenTimer = 0;
    this._bodyBaseY = 0;

    this.position = position.clone();
    this.velocity = new THREE.Vector3();

    this.invincibleTimer = 0;
    this.attackCooldown = 0;
    this.isAttacking = false;
    this.attackType = null;
    this.attackElapsed = 0;
    this.currentMove = null;
    this.hitTargets = new Set();
    this.isChargingHeavy = false;
    this.heavyChargeTimer = 0;
    this.heavyChargeAimUp = false;

    this.moveSet = getMoveSet(type);
    this.hurtbox = { ...HURTBOX };

    this.attackVisuals = {
      light: null,
      heavy: null
    };

    // Special-move state
    this.specialCooldown = 0;
    this.isCountering = false;
    this.counterTimer = 0;
    this.counterSuccessFlash = 0;
    this.counterSparkles = [];
    this.counterSparkleAcc = 0;
    this.isGroundPounding = false;
    this.groundPoundTimer = 0;
    this.groundPoundPhase = null;
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollDir = 1;
    this.rollHitTargets = new Set();
    this.isGrabbing = false;
    this.grabTimer = 0;
    this.grabPhase = null;
    this.grabHitTargets = new Set();
    this.grabHeldTarget = null;
    this.isLassoing = false;
    this.lassoTimer = 0;
    this.lassoPhase = null;
    this.lassoHitTargets = new Set();
    this.lassoHeldTarget = null;
    this.lassoMesh = null;
    this.lassoExtendT = 0;
    this.isStinkCloud = false;
    this.stinkCloudTimer = 0;
    this.stinkCloudTick = 0;
    this.stinkCloudMesh = null;
    this.stinkSwirls = [];

    this.stats = this.getStats();
    this.stats.size = UNIFORM_SIZE;
    this.createMesh();
    this.createBody();
    this.createShieldVisual();
    this.createCounterVisual();
  }

  getStats() {
    switch (this.type) {
      case CHARACTER_TYPES.LIGHT:
        return { weight: 0.8, speed: 1.2, jumpForce: 16, size: UNIFORM_SIZE, color: 0x4488FF };
      case CHARACTER_TYPES.MEDIUM:
        return { weight: 1.0, speed: 1.0, jumpForce: 14, size: UNIFORM_SIZE, color: 0x44FF44 };
      case CHARACTER_TYPES.HEAVY:
        return { weight: 1.2, speed: 0.8, jumpForce: 12, size: UNIFORM_SIZE, color: 0xFF4444 };
      case CHARACTER_TYPES.WASABI:
        return { weight: 0.75, speed: 1.15, jumpForce: 15, size: UNIFORM_SIZE, color: 0x6dff4a };
      case CHARACTER_TYPES.GYOZA:
        return { weight: 1.02, speed: 0.98, jumpForce: 13.5, size: UNIFORM_SIZE, color: 0xe8b86d };
      case CHARACTER_TYPES.ONIGIRI:
        return { weight: 1.28, speed: 0.75, jumpForce: 11, size: UNIFORM_SIZE, color: 0xf5f0e6 };
      case CHARACTER_TYPES.RAMEN:
        return { weight: 1.25, speed: 0.78, jumpForce: 11.5, size: UNIFORM_SIZE, color: 0xe8a04a };
      case CHARACTER_TYPES.TAMAGO:
        return { weight: 1.0, speed: 1.0, jumpForce: 14, size: UNIFORM_SIZE, color: 0xfff0c8 };
      default:
        return { weight: 1.0, speed: 1.0, jumpForce: 14, size: UNIFORM_SIZE, color: 0xFFFFFF };
    }
  }

  createMesh() {
    const size = UNIFORM_SIZE;
    const bodyMap = this.type === CHARACTER_TYPES.LIGHT ? batterTexture()
      : (this.type === CHARACTER_TYPES.MEDIUM || this.type === CHARACTER_TYPES.ONIGIRI)
        ? riceTexture()
        : null;
    const material = createToonMaterial({
      color: this.stats.color,
      map: bodyMap,
      emissive: this.stats.color,
      emissiveIntensity: 0.04
    });
    const limbMaterial = createToonMaterial({
      color: this.teamColor,
      emissive: this.teamColor,
      emissiveIntensity: 0.08
    });
    this.limbMaterial = limbMaterial;

    // Built facing +X (right). applyFacing rotates Y 0 / π.
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    const body = this._createBodyMesh(size, material);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = this.type === CHARACTER_TYPES.HEAVY ? 0.1 :
      this.type === CHARACTER_TYPES.MEDIUM ? 0.12 :
      this.type === CHARACTER_TYPES.LIGHT ? 0.2 :
      this.type === CHARACTER_TYPES.WASABI ? 0.15 :
      this.type === CHARACTER_TYPES.GYOZA ? 0.1 :
      this.type === CHARACTER_TYPES.ONIGIRI ? 0.08 :
      this.type === CHARACTER_TYPES.RAMEN ? 0.06 :
      this.type === CHARACTER_TYPES.TAMAGO ? 0.1 : 0.15;
    this.mesh.add(body);

    const faceMaterial = createToonMaterial({ color: 0xfff8f0 });
    const faceRimMaterial = createToonMaterial({ color: 0xe8d8c8 });
    const blushMaterial = createToonMaterial({
      color: 0xff8a9a,
      transparent: true,
      opacity: 0.55
    });
    const browMaterial = createToonMaterial({ color: 0x2a2220 });
    const eyeMaterial = createToonMaterial({ color: 0x151515 });
    const eyeShineMaterial = createToonMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.55
    });
    const handMaterial = createToonMaterial({
      color: this.teamColor,
      emissive: this.teamColor,
      emissiveIntensity: 0.06
    });
    const footMaterial = createToonMaterial({
      color: new THREE.Color(this.teamColor).multiplyScalar(0.75).getHex()
    });

    // Tuck face/eyes onto the front surface of each food body.
    const faceX = this.type === CHARACTER_TYPES.HEAVY ? 0.48 :
      this.type === CHARACTER_TYPES.MEDIUM ? 0.46 :
      this.type === CHARACTER_TYPES.LIGHT ? 0.28 :
      this.type === CHARACTER_TYPES.WASABI ? 0.38 :
      this.type === CHARACTER_TYPES.GYOZA ? 0.42 :
      this.type === CHARACTER_TYPES.ONIGIRI ? 0.28 :
      this.type === CHARACTER_TYPES.RAMEN ? 0.52 :
      this.type === CHARACTER_TYPES.TAMAGO ? 0.44 : 0.42;
    const eyeX = this.type === CHARACTER_TYPES.HEAVY ? 0.54 :
      this.type === CHARACTER_TYPES.MEDIUM ? 0.52 :
      this.type === CHARACTER_TYPES.LIGHT ? 0.34 :
      this.type === CHARACTER_TYPES.WASABI ? 0.42 :
      this.type === CHARACTER_TYPES.GYOZA ? 0.48 :
      this.type === CHARACTER_TYPES.ONIGIRI ? 0.34 :
      this.type === CHARACTER_TYPES.RAMEN ? 0.56 :
      this.type === CHARACTER_TYPES.TAMAGO ? 0.48 : 0.5;
    const faceY = this.type === CHARACTER_TYPES.HEAVY ? 0.22 :
      this.type === CHARACTER_TYPES.MEDIUM ? 0.18 :
      this.type === CHARACTER_TYPES.LIGHT ? 0.55 :
      this.type === CHARACTER_TYPES.WASABI ? 0.2 :
      this.type === CHARACTER_TYPES.GYOZA ? 0.08 :
      this.type === CHARACTER_TYPES.ONIGIRI ? 0.12 :
      this.type === CHARACTER_TYPES.RAMEN ? 0.18 :
      this.type === CHARACTER_TYPES.TAMAGO ? 0.14 : 0.28;
    const eyeY = this.type === CHARACTER_TYPES.HEAVY ? 0.26 :
      this.type === CHARACTER_TYPES.MEDIUM ? 0.22 :
      this.type === CHARACTER_TYPES.LIGHT ? 0.58 :
      this.type === CHARACTER_TYPES.WASABI ? 0.24 :
      this.type === CHARACTER_TYPES.GYOZA ? 0.12 :
      this.type === CHARACTER_TYPES.ONIGIRI ? 0.18 :
      this.type === CHARACTER_TYPES.RAMEN ? 0.22 :
      this.type === CHARACTER_TYPES.TAMAGO ? 0.18 : 0.32;

    // Detailed square face plate + pupils, parented to body for motion/blink.
    const bodyY = body.position.y;
    this.faceGroup = new THREE.Group();
    this.faceGroup.position.set(0, 0, 0);
    body.add(this.faceGroup);

    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.32, 0.5),
      faceMaterial
    );
    face.position.set(faceX, faceY - bodyY, 0);
    face.castShadow = true;
    this.faceGroup.add(face);

    // Soft rim / cheek frame around the plate
    const faceRim = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.36, 0.54),
      faceRimMaterial
    );
    faceRim.position.set(faceX - 0.04, faceY - bodyY, 0);
    this.faceGroup.add(faceRim);

    // Blush spots
    const blushGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const leftBlush = new THREE.Mesh(blushGeo, blushMaterial);
    leftBlush.position.set(faceX + 0.04, faceY - bodyY - 0.06, 0.16);
    leftBlush.scale.set(0.7, 0.45, 1);
    this.faceGroup.add(leftBlush);
    const rightBlush = new THREE.Mesh(blushGeo, blushMaterial);
    rightBlush.position.set(faceX + 0.04, faceY - bodyY - 0.06, -0.16);
    rightBlush.scale.set(0.7, 0.45, 1);
    this.faceGroup.add(rightBlush);

    // Brows
    const browGeo = new THREE.BoxGeometry(0.04, 0.03, 0.1);
    const leftBrow = new THREE.Mesh(browGeo, browMaterial);
    leftBrow.position.set(eyeX + 0.01, eyeY - bodyY + 0.1, 0.12);
    leftBrow.rotation.z = -0.15;
    this.faceGroup.add(leftBrow);
    const rightBrow = new THREE.Mesh(browGeo, browMaterial);
    rightBrow.position.set(eyeX + 0.01, eyeY - bodyY + 0.1, -0.12);
    rightBrow.rotation.z = -0.15;
    this.faceGroup.add(rightBrow);

    const eyeGeo = new THREE.SphereGeometry(0.075, 12, 10);
    this.leftEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    this.leftEye.position.set(eyeX, eyeY - bodyY, 0.12);
    this.leftEye.scale.set(0.85, 1, 1);
    this.faceGroup.add(this.leftEye);
    this.rightEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    this.rightEye.position.set(eyeX, eyeY - bodyY, -0.12);
    this.rightEye.scale.set(0.85, 1, 1);
    this.faceGroup.add(this.rightEye);

    // Eye shine dots
    const shineGeo = new THREE.SphereGeometry(0.022, 6, 6);
    const leftShine = new THREE.Mesh(shineGeo, eyeShineMaterial);
    leftShine.position.set(eyeX + 0.04, eyeY - bodyY + 0.025, 0.12);
    this.faceGroup.add(leftShine);
    const rightShine = new THREE.Mesh(shineGeo, eyeShineMaterial);
    rightShine.position.set(eyeX + 0.04, eyeY - bodyY + 0.025, -0.12);
    this.faceGroup.add(rightShine);

    // Tiny smile
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI),
      browMaterial
    );
    smile.position.set(faceX + 0.05, faceY - bodyY - 0.1, 0);
    smile.rotation.y = Math.PI / 2;
    smile.rotation.z = Math.PI;
    this.faceGroup.add(smile);

    this.blinkOpenTimer = BLINK_MIN_GAP + Math.random() * (BLINK_MAX_GAP - BLINK_MIN_GAP);

    // Segmented limbs with hands/feet
    const makeArm = (z, restX) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.35, z);
      pivot.rotation.x = restX;

      const upper = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.095, 0.18, 5, 10),
        limbMaterial
      );
      upper.position.y = -0.16;
      upper.castShadow = true;
      pivot.add(upper);

      const lower = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.08, 0.16, 5, 10),
        limbMaterial
      );
      lower.position.y = -0.38;
      lower.castShadow = true;
      pivot.add(lower);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        handMaterial
      );
      hand.position.y = -0.54;
      hand.scale.set(1.1, 0.75, 1.15);
      hand.castShadow = true;
      pivot.add(hand);

      this.mesh.add(pivot);
      return pivot;
    };

    this.leftArm = makeArm(0.55, -0.4);
    this.rightArm = makeArm(-0.55, 0.4);
    this.leftArm.userData.rest = { x: -0.4, y: 0, z: 0 };
    this.rightArm.userData.rest = { x: 0.4, y: 0, z: 0 };

    // Capsule extends (length/2 + radius) from its mesh center. Hang from hip pivot.
    const legPivotY = -0.08;
    const legLength = 0.28;
    const legRadius = 0.12;
    const legHalf = legLength / 2 + legRadius;
    const makeLeg = (z) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.05, legPivotY, z);

      const thigh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.11, 0.14, 5, 10),
        limbMaterial
      );
      thigh.position.y = -0.16;
      thigh.castShadow = true;
      pivot.add(thigh);

      const shin = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.095, 0.14, 5, 10),
        limbMaterial
      );
      shin.position.y = -0.38;
      shin.castShadow = true;
      pivot.add(shin);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, 0.14),
        footMaterial
      );
      foot.position.set(0.04, -0.54, 0);
      foot.castShadow = true;
      pivot.add(foot);

      // Toe pad
      const toe = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        footMaterial
      );
      toe.position.set(0.12, -0.54, 0);
      toe.scale.set(1, 0.6, 1.1);
      pivot.add(toe);

      this.mesh.add(pivot);
      pivot.userData.rest = { x: 0, y: 0, z: 0 };
      return pivot;
    };

    this.leftLeg = makeLeg(0.18);
    this.rightLeg = makeLeg(-0.18);
    // Sole is bottom of foot mesh (~pivot.y - 0.58) relative to character mesh origin.
    this._visualFootDepth = -(legPivotY - 0.58);

    this.bodyMesh = body;
    this._bodyBaseY = body.position.y;
    this.limbMeshes = [];
    this.meshMaterials = [
      material, limbMaterial, faceMaterial, faceRimMaterial, blushMaterial,
      browMaterial, eyeMaterial, eyeShineMaterial, handMaterial, footMaterial
    ];
    if (body.userData?.foodMats) {
      this.meshMaterials.push(...body.userData.foodMats);
    }
    this.baseEmissive = material.emissive?.getHex?.() ?? 0x000000;

    this._createTeamMarker();
    this.footShadow = createFootShadow();
    this.mesh.add(this.footShadow);
    this._outlines = addOutlinesToGroup(this.mesh, {
      color: new THREE.Color(this.teamColor).multiplyScalar(0.12).lerp(new THREE.Color(0x1a1210), 0.65).getHex(),
      scale: 1.065
    });
    this._attackTrail = null;
    this._landDustCooldown = 0;
    this.applyFacing();
    this.scene.add(this.mesh);
    this.createAttackVisuals();
  }

  _createTeamMarker() {
    const group = new THREE.Group();
    const material = createToonMaterial({
      color: this.teamColor,
      emissive: this.teamColor,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 1
    });
    const ringMat = createToonMaterial({
      color: 0xffffff,
      emissive: this.teamColor,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 1
    });

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.24, 4), material);
    cone.rotation.x = Math.PI;
    cone.castShadow = true;
    group.add(cone);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16), ringMat);
    ring.position.y = 0.02;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    group.position.set(0, 1.2, 0);
    this.teamMarker = group;
    this.teamMarkerConeMat = material;
    this.teamMarkerRingMat = ringMat;
    this._markerFlashPhase = 0;
    this.mesh.add(this.teamMarker);
    this.meshMaterials.push(material, ringMat);
  }

  /** Flash overhead triangle while special is on cooldown. */
  updateTeamMarkerCooldown(deltaTime) {
    if (!this.teamMarkerConeMat || !this.teamMarkerRingMat) return;

    if (this.specialCooldown > 0) {
      this._markerFlashPhase += deltaTime * 8;
      // Blink between dim and bright so cooldown is obvious
      const pulse = 0.5 + 0.5 * Math.sin(this._markerFlashPhase * Math.PI * 2);
      const opacity = 0.25 + 0.75 * pulse;
      const emissive = 0.05 + 0.55 * pulse;
      this.teamMarkerConeMat.transparent = true;
      this.teamMarkerRingMat.transparent = true;
      this.teamMarkerConeMat.opacity = opacity;
      this.teamMarkerConeMat.emissiveIntensity = emissive;
      this.teamMarkerRingMat.opacity = opacity;
      this.teamMarkerRingMat.emissiveIntensity = emissive * 0.7;
    } else {
      this._markerFlashPhase = 0;
      this.teamMarkerConeMat.opacity = 1;
      this.teamMarkerConeMat.emissiveIntensity = 0.2;
      this.teamMarkerRingMat.opacity = 1;
      this.teamMarkerRingMat.emissiveIntensity = 0.1;
    }
  }

  _createBodyMesh(size, material) {
    switch (this.type) {
      case CHARACTER_TYPES.LIGHT:
        return this._createTempuraShrimpBody(size, material);
      case CHARACTER_TYPES.MEDIUM:
        return this._createCaliforniaRollBody(size, material);
      case CHARACTER_TYPES.HEAVY:
        return this._createDumplingBody(size, material);
      case CHARACTER_TYPES.WASABI:
        return this._createWasabiBody(size, material);
      case CHARACTER_TYPES.GYOZA:
        return this._createGyozaBody(size, material);
      case CHARACTER_TYPES.ONIGIRI:
        return this._createOnigiriBody(size, material);
      case CHARACTER_TYPES.RAMEN:
        return this._createRamenBody(size, material);
      case CHARACTER_TYPES.TAMAGO:
        return this._createTamagoBody(size, material);
      default:
        return this._createCaliforniaRollBody(size, material);
    }
  }

  _cloneMat(base, hex, roughness = 0.85, metalness = 0.05) {
    const mat = base.clone();
    mat.color.setHex(hex);
    // Toon materials ignore roughness/metalness; keep for standard clones if any
    if ('roughness' in mat) mat.roughness = roughness;
    if ('metalness' in mat) mat.metalness = metalness;
    // Subtle emissive for food accents so bloom can catch bright bits
    if (mat.emissive) {
      const bright = hex === 0x6dff4a || hex === 0xff6a1a || hex === 0xe85a10
        || hex === 0x6db33f || hex === 0xfff0c0;
      const e = new THREE.Color(hex).multiplyScalar(bright ? 0.35 : 0.1);
      mat.emissive.copy(e);
      mat.emissiveIntensity = bright ? 0.45 : 0.12;
    }
    return mat;
  }

  /** Fried shrimp tempura: golden battered body, pink tail, crispy batter flakes. */
  _createTempuraShrimpBody(size, material) {
    const group = new THREE.Group();

    const batterMat = this._cloneMat(material, 0xe8b84a, 0.75, 0.08);
    const batterDarkMat = this._cloneMat(material, 0xc9942e, 0.8, 0.05);
    const batterLightMat = this._cloneMat(material, 0xf5d078, 0.7, 0.1);
    const shrimpMat = this._cloneMat(material, 0xf0a090, 0.55, 0.05);
    const shrimpDeepMat = this._cloneMat(material, 0xd87868, 0.6, 0.05);
    const tailTipMat = this._cloneMat(material, 0xe88878, 0.5, 0.08);

    // Main battered body (slight C-curve like fried ebi)
    const segments = [
      { y: 0.55, r: 0.14, h: 0.22, s: 1.0 },
      { y: 0.35, r: 0.20, h: 0.24, s: 1.05 },
      { y: 0.12, r: 0.24, h: 0.26, s: 1.1 },
      { y: -0.1, r: 0.22, h: 0.24, s: 1.05 },
      { y: -0.3, r: 0.16, h: 0.2, s: 0.95 }
    ];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const piece = new THREE.Mesh(
        new THREE.SphereGeometry(seg.r * size, 14, 12),
        i % 2 === 0 ? batterMat : batterDarkMat
      );
      piece.position.set(0.02 * i, seg.y, 0);
      piece.scale.set(seg.s * 0.85, 1.05, 0.75);
      piece.castShadow = true;
      piece.receiveShadow = true;
      group.add(piece);
    }

    // Crispy batter spikes / panko flakes
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const elev = -0.25 + (i % 5) * 0.18;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.12 + Math.random() * 0.08, 5),
        i % 3 === 0 ? batterLightMat : batterMat
      );
      const r = 0.2 + (i % 3) * 0.03;
      spike.position.set(
        Math.cos(a) * r * 0.5 + 0.05,
        elev,
        Math.sin(a) * r
      );
      spike.lookAt(spike.position.x * 2, elev + 0.2, spike.position.z * 2);
      spike.castShadow = true;
      group.add(spike);
    }

    // Extra golden lumps for fried texture
    for (let i = 0; i < 10; i++) {
      const lump = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 6, 5),
        i % 2 === 0 ? batterLightMat : batterDarkMat
      );
      lump.position.set(
        (Math.random() - 0.5) * 0.25,
        -0.2 + Math.random() * 0.7,
        (Math.random() - 0.5) * 0.35
      );
      lump.scale.set(1.2, 0.7, 1);
      group.add(lump);
    }

    // Unbattered pink shrimp tail (top)
    const tailBase = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      shrimpMat
    );
    tailBase.position.set(0.02, 0.72, 0);
    tailBase.scale.set(0.7, 1.1, 0.55);
    tailBase.castShadow = true;
    group.add(tailBase);

    const tailMid = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      shrimpDeepMat
    );
    tailMid.position.set(0.04, 0.88, 0);
    tailMid.scale.set(0.6, 1.0, 0.45);
    group.add(tailMid);

    // Fan tail fins
    const finGeo = new THREE.ConeGeometry(0.08, 0.16, 4);
    const leftFin = new THREE.Mesh(finGeo, tailTipMat);
    leftFin.position.set(0.02, 1.0, 0.08);
    leftFin.rotation.z = 0.5;
    leftFin.rotation.x = -0.6;
    leftFin.scale.set(0.5, 1, 0.3);
    group.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, tailTipMat);
    rightFin.position.set(0.02, 1.0, -0.08);
    rightFin.rotation.z = 0.5;
    rightFin.rotation.x = 0.6;
    rightFin.scale.set(0.5, 1, 0.3);
    group.add(rightFin);

    const centerFin = new THREE.Mesh(finGeo, shrimpMat);
    centerFin.position.set(0.06, 1.05, 0);
    centerFin.rotation.z = 0.7;
    centerFin.scale.set(0.35, 1.1, 0.25);
    group.add(centerFin);

    // Small pink peek at head end (bottom tip)
    const headTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      shrimpMat
    );
    headTip.position.set(0.08, -0.42, 0);
    headTip.scale.set(0.8, 0.9, 0.6);
    group.add(headTip);

    // Steam wisps / oil sheen dots
    const sheenMat = this._cloneMat(material, 0xfff0c0, 0.35, 0.35);
    for (let i = 0; i < 6; i++) {
      const sheen = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), sheenMat);
      sheen.position.set(
        0.08 + Math.random() * 0.06,
        -0.15 + Math.random() * 0.55,
        (Math.random() - 0.5) * 0.2
      );
      sheen.scale.set(1.4, 0.5, 1);
      group.add(sheen);
    }

    // Segment grooves for fried shrimp rings
    const grooveMat = this._cloneMat(material, 0xb8822a, 0.85, 0.05);
    for (const y of [0.45, 0.22, 0.0, -0.2]) {
      const groove = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.018, 6, 14),
        grooveMat
      );
      groove.position.set(0.04, y, 0);
      groove.rotation.y = Math.PI / 2;
      groove.scale.set(0.7, 1, 0.85);
      group.add(groove);
    }

    group.userData.foodMats = [
      batterMat, batterDarkMat, batterLightMat, shrimpMat, shrimpDeepMat, tailTipMat, sheenMat, grooveMat
    ];
    return group;
  }

  /** Inside-out California roll: rice outside, orange tobiko on top, nori + filling on cut face. */
  _createCaliforniaRollBody(size, material) {
    const group = new THREE.Group();

    const riceMat = this._cloneMat(material, 0xf7f2e8, 0.95, 0.02);
    if (riceMat.map == null) riceMat.map = riceTexture();
    const noriMat = this._cloneMat(material, 0x1a2e1a, 0.75, 0.15);
    noriMat.map = noriTexture();
    const avocadoMat = this._cloneMat(material, 0x6db33f, 0.7, 0.05);
    const avocadoDarkMat = this._cloneMat(material, 0x4a8c2a, 0.75, 0.05);
    const crabMat = this._cloneMat(material, 0xf2a0a0, 0.65, 0.05);
    const tobikoMat = this._cloneMat(material, 0xff6a1a, 0.55, 0.15);
    const tobikoDeepMat = this._cloneMat(material, 0xe85a10, 0.6, 0.12);

    const radius = size * 0.42;
    const length = size * 0.72;

    // Outer rice cylinder (inside-out roll)
    const rice = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 28),
      riceMat
    );
    rice.rotation.z = Math.PI / 2;
    rice.castShadow = true;
    rice.receiveShadow = true;
    group.add(rice);

    // Rice grain bumps on lower half only
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI; // bottom arc
      const along = ((i % 5) - 2) * (length * 0.12);
      const bump = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 6, 5),
        riceMat
      );
      bump.position.set(
        along,
        Math.sin(a) * radius * 0.98,
        Math.cos(a) * radius * 0.98
      );
      bump.scale.set(1.2, 0.7, 0.9);
      group.add(bump);
    }

    // Solid orange tobiko across the ENTIRE top half (+Y), end-to-end and side-to-side.
    // Build as a half-tube of boxes/spheres so coverage is continuous (no gaps/line look).
    const coverR = radius * 1.05;
    const coverLen = length * 1.0;
    const arcSteps = 14;
    const lenSteps = 16;

    for (let i = 0; i <= arcSteps; i++) {
      // φ from -90° to +90° → full top arc (z left→right, y always ≥ 0)
      const phi = -Math.PI / 2 + (i / arcSteps) * Math.PI;
      const y = Math.cos(phi) * coverR;
      const z = Math.sin(phi) * coverR;

      // Continuous orange strip along the roll length at this arc position
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(coverLen, 0.07, 0.09),
        i % 2 === 0 ? tobikoMat : tobikoDeepMat
      );
      strip.position.set(0, y + 0.01, z);
      // Tilt strip so it sits flat on the cylinder surface
      strip.rotation.x = -phi;
      strip.castShadow = true;
      group.add(strip);
    }

    // Dense roe pearls filling the whole top so it reads solid orange, not sparse
    for (let col = 0; col < lenSteps; col++) {
      for (let row = 0; row <= arcSteps; row++) {
        const phi = -Math.PI / 2 + (row / arcSteps) * Math.PI;
        const along = ((col / (lenSteps - 1)) - 0.5) * coverLen * 0.95;
        const y = Math.cos(phi) * coverR + 0.025;
        const z = Math.sin(phi) * coverR;
        const pearl = new THREE.Mesh(
          new THREE.SphereGeometry(0.038, 6, 5),
          (row + col) % 2 === 0 ? tobikoMat : tobikoDeepMat
        );
        pearl.position.set(along, y, z);
        group.add(pearl);
      }
    }

    // Front cut face (+X): rice ring, nori ring, avocado + crab center
    const cutX = length / 2 + 0.01;

    const cutRice = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.98, 28),
      riceMat
    );
    cutRice.position.x = cutX;
    cutRice.rotation.y = Math.PI / 2;
    group.add(cutRice);

    const cutNori = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.42, radius * 0.58, 24),
      noriMat
    );
    cutNori.position.x = cutX + 0.005;
    cutNori.rotation.y = Math.PI / 2;
    group.add(cutNori);

    const avocado = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.22, radius * 0.1, 8, 16, Math.PI * 1.3),
      avocadoMat
    );
    avocado.position.set(cutX + 0.012, 0.04, 0);
    avocado.rotation.y = Math.PI / 2;
    avocado.rotation.z = -0.35;
    group.add(avocado);

    const avocadoCore = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.12, 10, 8),
      avocadoDarkMat
    );
    avocadoCore.position.set(cutX + 0.015, 0.06, -0.04);
    avocadoCore.scale.set(0.9, 0.7, 1.1);
    group.add(avocadoCore);

    const crab = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.09, radius * 0.09, radius * 0.45, 8),
      crabMat
    );
    crab.position.set(cutX + 0.012, -0.04, 0.03);
    crab.rotation.z = Math.PI / 2;
    crab.rotation.y = 0.25;
    group.add(crab);

    // Back cut face
    const backFace = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.98, 28),
      riceMat
    );
    backFace.position.x = -length / 2 - 0.01;
    backFace.rotation.y = -Math.PI / 2;
    group.add(backFace);

    const backNori = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.42, radius * 0.58, 24),
      noriMat
    );
    backNori.position.x = -length / 2 - 0.015;
    backNori.rotation.y = -Math.PI / 2;
    group.add(backNori);

    // Sesame seeds on rice
    const sesameMat = this._cloneMat(material, 0xf5e6c8, 0.9, 0.02);
    const blackSesameMat = this._cloneMat(material, 0x2a2a2a, 0.85, 0.05);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const along = ((i % 7) - 3) * (length * 0.1);
      const elev = -0.35 + (i % 4) * 0.18;
      const seed = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.03, 3, 4),
        i % 3 === 0 ? blackSesameMat : sesameMat
      );
      seed.position.set(
        along,
        Math.sin(a) * radius * 0.95 + elev * 0.15,
        Math.cos(a) * radius * 0.95
      );
      seed.rotation.z = a;
      group.add(seed);
    }

    // Cucumber stick on cut face
    const cucumberMat = this._cloneMat(material, 0x7ec850, 0.65, 0.05);
    const cucumber = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, radius * 0.28, radius * 0.08),
      cucumberMat
    );
    cucumber.position.set(cutX + 0.014, 0.02, -0.1);
    group.add(cucumber);

    // Mayo drizzle dots on cut face
    const mayoMat = this._cloneMat(material, 0xfff5dc, 0.5, 0.05);
    for (let i = 0; i < 5; i++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), mayoMat);
      drop.position.set(cutX + 0.018, -0.08 + i * 0.04, 0.1 - i * 0.02);
      group.add(drop);
    }

    group.userData.foodMats = [
      riceMat, noriMat, avocadoMat, avocadoDarkMat, crabMat, tobikoMat, tobikoDeepMat,
      sesameMat, blackSesameMat, cucumberMat, mayoMat
    ];
    return group;
  }

  /** Soft dumpling: squashed sphere + top pleat knot. Limbs/eyes stay separate. */
  _createDumplingBody(size, material) {
    const group = new THREE.Group();

    const doughMat = this._cloneMat(material, 0xf0d9a8, 0.85, 0.05);
    const creaseMat = this._cloneMat(material, 0xe0c48a, 0.9, 0.02);
    const knotMat = this._cloneMat(material, 0xd4b06a, 0.8, 0.05);

    // Main puffy body (slightly wider than tall — gyoza/bao silhouette)
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.48, 24, 18),
      doughMat
    );
    body.scale.set(1.15, 0.88, 1.05);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Soft underside bulge
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.36, 16, 12),
      doughMat
    );
    belly.position.y = -0.12;
    belly.scale.set(1.05, 0.55, 1.0);
    belly.castShadow = true;
    group.add(belly);

    // Pleat ridges around the top (dumpling fold ring)
    const pleatCount = 8;
    for (let i = 0; i < pleatCount; i++) {
      const angle = (i / pleatCount) * Math.PI * 2;
      const ridge = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.04, 0.18, 3, 6),
        creaseMat
      );
      ridge.position.set(
        Math.cos(angle) * 0.22,
        0.28,
        Math.sin(angle) * 0.22
      );
      ridge.lookAt(0, 0.55, 0);
      ridge.castShadow = true;
      group.add(ridge);
    }

    // Top knot / gathered fold
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.14, 12, 10),
      knotMat
    );
    knot.position.y = 0.38;
    knot.scale.set(1.1, 0.75, 1.1);
    knot.castShadow = true;
    group.add(knot);

    // Small top pinches around knot
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.2;
      const pinch = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 6),
        creaseMat
      );
      pinch.position.set(
        Math.cos(angle) * 0.12,
        0.34,
        Math.sin(angle) * 0.12
      );
      pinch.scale.set(1, 0.6, 1);
      group.add(pinch);
    }

    // Soft dough freckles / browning spots
    const brownMat = this._cloneMat(material, 0xd4a86a, 0.9, 0.02);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const elev = -0.15 + (i % 3) * 0.15;
      const freckle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), brownMat);
      freckle.position.set(
        Math.cos(a) * 0.38,
        elev,
        Math.sin(a) * 0.35
      );
      freckle.scale.set(1.2, 0.5, 1);
      group.add(freckle);
    }

    // Side pleat folds for more dumpling volume
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.1;
      const fold = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.22, 0.08),
        creaseMat
      );
      fold.position.set(
        Math.cos(angle) * 0.42,
        0.05,
        Math.sin(angle) * 0.4
      );
      fold.lookAt(0, 0.1, 0);
      group.add(fold);
    }

    group.userData.foodMats = [doughMat, creaseMat, knotMat, brownMat];
    return group;
  }

  /** Bright green wasabi drop — teardrop blob with glossy tip. */
  _createWasabiBody(size, material) {
    const group = new THREE.Group();
    const greenMat = this._cloneMat(material, 0x6dff4a, 0.45, 0.08);
    const deepMat = this._cloneMat(material, 0x2f9e2a, 0.55, 0.05);
    const glossMat = this._cloneMat(material, 0xc8ff9a, 0.25, 0.2);

    const body = new THREE.Mesh(new THREE.SphereGeometry(size * 0.42, 20, 16), greenMat);
    body.scale.set(0.9, 1.15, 0.9);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(size * 0.22, size * 0.35, 12), deepMat);
    tip.position.y = 0.48;
    tip.castShadow = true;
    group.add(tip);

    const shine = new THREE.Mesh(new THREE.SphereGeometry(size * 0.12, 10, 8), glossMat);
    shine.position.set(0.18, 0.15, 0.12);
    shine.scale.set(1.2, 0.7, 0.8);
    group.add(shine);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), deepMat);
      bump.position.set(Math.cos(a) * 0.32, -0.05 + (i % 2) * 0.1, Math.sin(a) * 0.32);
      bump.scale.set(1, 0.6, 1);
      group.add(bump);
    }

    group.userData.foodMats = [greenMat, deepMat, glossMat];
    return group;
  }

  /** Pan-fried gyoza — solid half-moon (D shape): curved front + flat fold back. */
  _createGyozaBody(size, material) {
    const group = new THREE.Group();
    const doughMat = this._cloneMat(material, 0xf0d9a8, 0.85, 0.05);
    const brownMat = this._cloneMat(material, 0xc9943a, 0.8, 0.05);
    const creaseMat = this._cloneMat(material, 0xe0c48a, 0.9, 0.02);

    // Solid half-sphere: flat face on -X (fold), dome toward +X (belly)
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.48, 24, 16, 0, Math.PI),
      doughMat
    );
    body.rotation.y = Math.PI / 2;
    body.scale.set(1.05, 1.15, 0.85);
    body.position.set(0.06, 0, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Flat nori/fold disc on the cut face
    const fold = new THREE.Mesh(
      new THREE.CircleGeometry(size * 0.46, 28),
      creaseMat
    );
    fold.rotation.y = -Math.PI / 2;
    fold.position.set(-0.02, 0, 0);
    fold.scale.set(1, 1.12, 1);
    group.add(fold);

    // Soft rim around the flat fold
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(size * 0.45, size * 0.035, 8, 28, Math.PI * 2),
      doughMat
    );
    rim.rotation.y = Math.PI / 2;
    rim.position.set(-0.01, 0, 0);
    rim.scale.set(1, 1.12, 0.9);
    group.add(rim);

    // Seared underside along the curved bottom
    const seared = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.42, 16, 12, 0, Math.PI, Math.PI * 0.55, Math.PI * 0.45),
      brownMat
    );
    seared.rotation.y = Math.PI / 2;
    seared.position.set(0.08, -0.08, 0);
    seared.scale.set(1.0, 0.9, 0.8);
    seared.castShadow = true;
    group.add(seared);

    // Crimp ridges on the flat fold edge (classic gyoza pleats)
    for (let i = 0; i < 7; i++) {
      const t = (i / 6) - 0.5;
      const ridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.14, 3, 6), brownMat);
      ridge.position.set(-0.04, t * 0.72, 0.02);
      ridge.rotation.z = t * 0.35;
      ridge.rotation.y = 0.15;
      group.add(ridge);
    }

    // Top/bottom horn tips for a softer half-moon outline
    const tipTop = new THREE.Mesh(new THREE.SphereGeometry(size * 0.1, 10, 8), doughMat);
    tipTop.position.set(0.02, 0.48, 0);
    tipTop.scale.set(0.9, 0.7, 0.75);
    tipTop.castShadow = true;
    group.add(tipTop);

    const tipBot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.1, 10, 8), doughMat);
    tipBot.position.set(0.02, -0.48, 0);
    tipBot.scale.set(0.9, 0.7, 0.75);
    tipBot.castShadow = true;
    group.add(tipBot);

    group.userData.foodMats = [doughMat, brownMat, creaseMat];
    return group;
  }

  /** Rice ball — smooth blunt triangle + classic nori paper (front, back, between legs). */
  _createOnigiriBody(size, material) {
    const group = new THREE.Group();
    // Soft matte rice (smooth, not chalky faceted look)
    const riceMat = this._cloneMat(material, 0xf8f4ec, 0.92, 0.0);
    riceMat.flatShading = false;
    const noriMat = this._cloneMat(material, 0x141814, 0.85, 0.02);
    noriMat.flatShading = false;
    const seedMat = this._cloneMat(material, 0x3a2a1a, 0.85, 0.02);

    const s = size;
    const halfW = s * 0.48;
    const topY = s * 0.52;
    const botY = -s * 0.42;

    // Smooth isosceles blunt-triangle profile (all curves, no hard corners)
    const shape = new THREE.Shape();
    shape.moveTo(0, topY);
    shape.bezierCurveTo(halfW * 0.22, topY, halfW * 0.55, topY * 0.45, halfW * 0.92, botY + s * 0.18);
    shape.quadraticCurveTo(halfW, botY + s * 0.06, halfW * 0.72, botY);
    shape.quadraticCurveTo(0, botY - s * 0.04, -halfW * 0.72, botY);
    shape.quadraticCurveTo(-halfW, botY + s * 0.06, -halfW * 0.92, botY + s * 0.18);
    shape.bezierCurveTo(-halfW * 0.55, topY * 0.45, -halfW * 0.22, topY, 0, topY);

    const depth = s * 0.42;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: s * 0.1,
      bevelSize: s * 0.09,
      bevelOffset: 0,
      bevelSegments: 8,
      curveSegments: 28,
      steps: 1
    });
    geo.translate(0, 0, -depth / 2);
    geo.computeVertexNormals();

    // Triangle in YZ; thickness along X so face sits on +X
    const core = new THREE.Mesh(geo, riceMat);
    core.rotation.y = Math.PI / 2;
    core.castShadow = true;
    core.receiveShadow = true;
    group.add(core);

    // Soft tip / base fills so rice reads puffy, not faceted
    const tipCap = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 20, 16), riceMat);
    tipCap.position.set(0, topY - s * 0.06, 0);
    tipCap.scale.set(0.75, 0.55, 1.05);
    tipCap.castShadow = true;
    group.add(tipCap);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(s * 0.34, 20, 16), riceMat);
    belly.position.set(0, botY + s * 0.2, 0);
    belly.scale.set(0.85, 0.7, 1.15);
    belly.castShadow = true;
    group.add(belly);

    // --- Classic bottom nori strip: visible on front (+X) and back (−X) ---
    // Stays on the body (booty height), does not hang between legs.
    const noriW = s * 0.62;
    const noriH = s * 0.48;
    const noriT = s * 0.07;
    const noriY = botY + s * 0.34;
    const faceX = depth * 0.52 + noriT * 0.6;

    // Front panel (belly / face side)
    const noriFront = new THREE.Mesh(
      new THREE.BoxGeometry(noriT, noriH, noriW),
      noriMat
    );
    noriFront.position.set(faceX, noriY, 0);
    noriFront.castShadow = true;
    group.add(noriFront);

    // Back panel (booty)
    const noriBack = new THREE.Mesh(
      new THREE.BoxGeometry(noriT, noriH, noriW),
      noriMat
    );
    noriBack.position.set(-faceX, noriY, 0);
    noriBack.castShadow = true;
    group.add(noriBack);

    // Under-base wrap connecting front ↔ back
    const noriUnder = new THREE.Mesh(
      new THREE.BoxGeometry(depth * 1.2 + noriT * 2, noriT * 1.3, noriW * 0.95),
      noriMat
    );
    noriUnder.position.set(0, botY + s * 0.03, 0);
    noriUnder.castShadow = true;
    group.add(noriUnder);

    // Side edges so the wrap reads solid from 3/4 angles
    const noriSideL = new THREE.Mesh(
      new THREE.BoxGeometry(depth * 1.15, noriH * 0.9, noriT),
      noriMat
    );
    noriSideL.position.set(0, noriY, noriW * 0.48);
    group.add(noriSideL);

    const noriSideR = new THREE.Mesh(
      new THREE.BoxGeometry(depth * 1.15, noriH * 0.9, noriT),
      noriMat
    );
    noriSideR.position.set(0, noriY, -noriW * 0.48);
    group.add(noriSideR);

    // Light sesame on upper rice only
    for (let i = 0; i < 6; i++) {
      const t = 0.45 + i * 0.08;
      const y = botY + t * (topY - botY);
      const seed = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), seedMat);
      seed.position.set(
        depth * 0.38 * (i % 2 === 0 ? 1 : -1),
        y,
        (i % 3 - 1) * halfW * 0.2
      );
      seed.scale.set(1.3, 0.45, 0.75);
      group.add(seed);
    }

    group.userData.foodMats = [riceMat, noriMat, seedMat];
    return group;
  }

  /** Ceramic ramen bowl + broth + noodle nest + toppings. */
  _createRamenBody(size, material) {
    const group = new THREE.Group();
    const s = size;
    const bowlMat = this._cloneMat(material, 0xf2ebe0, 0.9, 0.04);
    bowlMat.flatShading = false;
    const rimMat = this._cloneMat(material, 0xe8ddd0, 0.88, 0.05);
    const brothMat = this._cloneMat(material, 0xe8a04a, 0.55, 0.08);
    brothMat.emissive = new THREE.Color(0xc47a28);
    brothMat.emissiveIntensity = 0.12;
    const noodleMat = this._cloneMat(material, 0xf5d78a, 0.75, 0.02);
    const noriMat = this._cloneMat(material, 0x1a2218, 0.85, 0.02);
    const eggMat = this._cloneMat(material, 0xfff0d0, 0.7, 0.04);
    const yolkMat = this._cloneMat(material, 0xffb040, 0.55, 0.06);
    const chashuMat = this._cloneMat(material, 0xd4785a, 0.7, 0.05);
    const greenMat = this._cloneMat(material, 0x4a9e4a, 0.8, 0.02);

    // Outer bowl (open top cylinder)
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.52, s * 0.38, s * 0.55, 28, 1, false),
      bowlMat
    );
    bowl.position.y = -s * 0.02;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    group.add(bowl);

    // Thick rim lip
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(s * 0.5, s * 0.055, 10, 28),
      rimMat
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = s * 0.24;
    rim.castShadow = true;
    group.add(rim);

    // Broth surface
    const broth = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.44, s * 0.44, s * 0.08, 24),
      brothMat
    );
    broth.position.y = s * 0.12;
    broth.castShadow = true;
    group.add(broth);

    // Noodle coils on top
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      const r = s * (0.12 + (i % 3) * 0.06);
      const tube = new THREE.Mesh(
        new THREE.TorusGeometry(r, s * 0.028, 6, 16),
        noodleMat
      );
      tube.position.set(
        Math.cos(ang) * s * 0.08,
        s * 0.18 + (i % 2) * 0.03,
        Math.sin(ang) * s * 0.08
      );
      tube.rotation.x = Math.PI / 2 + (i % 3 - 1) * 0.25;
      tube.rotation.z = ang * 0.4;
      tube.castShadow = true;
      group.add(tube);
    }

    // Nori sheet standing in broth
    const nori = new THREE.Mesh(
      new THREE.BoxGeometry(s * 0.04, s * 0.28, s * 0.22),
      noriMat
    );
    nori.position.set(-s * 0.18, s * 0.22, s * 0.12);
    nori.rotation.z = 0.15;
    nori.castShadow = true;
    group.add(nori);

    // Soft-boiled egg half
    const egg = new THREE.Mesh(new THREE.SphereGeometry(s * 0.12, 14, 12), eggMat);
    egg.position.set(s * 0.16, s * 0.2, -s * 0.1);
    egg.scale.set(1, 0.75, 1.1);
    egg.castShadow = true;
    group.add(egg);
    const yolk = new THREE.Mesh(new THREE.SphereGeometry(s * 0.055, 10, 8), yolkMat);
    yolk.position.set(s * 0.2, s * 0.22, -s * 0.08);
    group.add(yolk);

    // Chashu slice
    const chashu = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.11, s * 0.11, s * 0.04, 16),
      chashuMat
    );
    chashu.rotation.x = Math.PI / 2;
    chashu.position.set(s * 0.05, s * 0.2, s * 0.16);
    chashu.castShadow = true;
    group.add(chashu);

    // Green onion flecks
    for (let i = 0; i < 5; i++) {
      const flake = new THREE.Mesh(
        new THREE.BoxGeometry(s * 0.06, s * 0.02, s * 0.025),
        greenMat
      );
      const a = (i / 5) * Math.PI * 2 + 0.4;
      flake.position.set(Math.cos(a) * s * 0.2, s * 0.2, Math.sin(a) * s * 0.18);
      flake.rotation.y = a;
      group.add(flake);
    }

    group.userData.foodMats = [bowlMat, rimMat, brothMat, noodleMat, noriMat, eggMat, yolkMat, chashuMat, greenMat];
    return group;
  }

  /** Soft-boiled egg — plump white shell, cracked top, golden yolk peek. */
  _createTamagoBody(size, material) {
    const group = new THREE.Group();
    const s = size;
    const whiteMat = this._cloneMat(material, 0xfff6e8, 0.92, 0.0);
    whiteMat.flatShading = false;
    const faceMat = this._cloneMat(material, 0xfff0dc, 0.9, 0.0);
    faceMat.flatShading = false;
    const yolkMat = this._cloneMat(material, 0xff8c1a, 0.5, 0.1);
    yolkMat.emissive = new THREE.Color(0xe07010);
    yolkMat.emissiveIntensity = 0.22;
    const yolkDeepMat = this._cloneMat(material, 0xff6a00, 0.45, 0.12);
    yolkDeepMat.emissive = new THREE.Color(0xd05000);
    yolkDeepMat.emissiveIntensity = 0.18;

    // Half-egg dome (cut face toward +Z / camera, dome toward -Z)
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.5, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.5),
      whiteMat
    );
    body.rotation.x = -Math.PI / 2;
    body.scale.set(0.95, 1.15, 1.0);
    body.position.y = s * 0.02;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Flat cut face (egg white disc)
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(s * 0.5, 32),
      faceMat
    );
    face.scale.set(0.95, 1.15, 1);
    face.position.set(0, s * 0.02, 0.01);
    face.receiveShadow = true;
    group.add(face);

    // Outer white rim on the cut so yolk reads as inset
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(s * 0.22, s * 0.48, 32),
      whiteMat
    );
    rim.scale.set(0.95, 1.15, 1);
    rim.position.set(0, s * 0.02, 0.015);
    group.add(rim);

    // Orange yolk middle
    const yolk = new THREE.Mesh(new THREE.CircleGeometry(s * 0.24, 28), yolkMat);
    yolk.scale.set(1.0, 1.05, 1);
    yolk.position.set(0, s * 0.04, 0.02);
    group.add(yolk);

    // Deeper orange core for soft-boiled look
    const yolkCore = new THREE.Mesh(new THREE.CircleGeometry(s * 0.12, 20), yolkDeepMat);
    yolkCore.position.set(0.02, s * 0.05, 0.025);
    group.add(yolkCore);

    // Slight yolk bulge so it isn't fully flat
    const yolkBulge = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      yolkMat
    );
    yolkBulge.rotation.x = Math.PI / 2;
    yolkBulge.position.set(0, s * 0.04, 0.06);
    yolkBulge.scale.set(1.05, 1.0, 0.55);
    yolkBulge.castShadow = true;
    group.add(yolkBulge);

    // Soft highlight on the dome
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.1, 10, 8),
      this._cloneMat(material, 0xffffff, 0.4, 0.0)
    );
    shine.material.transparent = true;
    shine.material.opacity = 0.35;
    shine.position.set(s * 0.12, s * 0.28, -s * 0.18);
    shine.scale.set(0.9, 1.0, 0.45);
    group.add(shine);

    group.userData.foodMats = [
      whiteMat,
      faceMat,
      yolkMat,
      yolkDeepMat,
      shine.material
    ];
    return group;
  }

  createAttackVisuals() {
    const color = this.teamColor;
    const defs = [
      { key: 'light', color, opacity: 0.75 },
      { key: 'heavy', color, opacity: 0.88 }
    ];

    for (const def of defs) {
      this.attackVisuals[def.key] = this._createSwooshAttackVisual(def.color, def.opacity);
      this.attackVisuals[def.key].visible = false;
      this.scene.add(this.attackVisuals[def.key]);
    }
  }

  /**
   * Ball + swoosh that wraps around the body. Group origin = body center.
   * Local +X = facing/strike; beads arc from rear-side around the torso to the tip.
   */
  _createSwooshAttackVisual(color, opacity) {
    const group = new THREE.Group();
    const SEGMENTS = 10;

    const coreMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacity * 0.4,
      depthWrite: false
    });
    const trailMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacity * 0.5,
      depthWrite: false
    });

    const beads = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      const mat = trailMat.clone();
      mat.opacity = opacity * (0.12 + 0.58 * t);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mat);
      beads.push(bead);
      group.add(bead);
    }

    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), glowMat);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 14), coreMat);
    group.add(glow);
    group.add(core);

    group.userData.attackMats = [coreMat, glowMat, trailMat, ...beads.map((b) => b.material)];
    group.userData.swoosh = { beads, core, glow, segments: SEGMENTS };
    this._layoutSwooshAroundBody(group, {
      plane: 'y',
      sign: 1,
      bodyR: 0.72,
      tipR: 1.35,
      startAngle: 2.4,
      endAngle: 0.12
    });
    return group;
  }

  /**
   * Arc around body: theta from rear (~π) sweeping to front (~0).
   * plane 'y' = over the top only (never under); plane 'z' = toward/away camera.
   */
  _layoutSwooshAroundBody(group, opts) {
    const swoosh = group.userData.swoosh;
    if (!swoosh) return;

    const {
      plane = 'y',
      sign = 1,
      bodyR = 0.72,
      tipR = 1.35,
      startAngle = 2.35,
      endAngle = 0.1
    } = opts;

    const { beads, core, glow, segments } = swoosh;

    const pointAt = (t) => {
      const theta = startAngle + (endAngle - startAngle) * t;
      // Radius grows as we leave the body toward the strike tip
      const r = bodyR + (tipR - bodyR) * (t * t);
      const along = Math.cos(theta) * r;
      const wrap = Math.sin(theta) * r * sign;
      if (plane === 'z') {
        // Side wrap: keep slightly above mid-body, never under feet
        return new THREE.Vector3(along, Math.abs(wrap) * 0.2 + 0.12, wrap);
      }
      // Over-top wrap: force y >= small lift so path never goes under the model
      return new THREE.Vector3(along, Math.max(Math.abs(wrap), 0.08), wrap * 0.15);
    };

    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const p = pointAt(t * 0.9);
      beads[i].position.copy(p);
      const s = 0.25 + 0.7 * t;
      beads[i].scale.set(s * 1.1, s * 0.7, s * 0.8);
    }

    const tip = pointAt(1);
    core.position.copy(tip);
    glow.position.copy(tip);
  }

  /**
   * Up-attack (W held): arc always over the crown of the head, tip above.
   * Local coords with +Y = world up (group is not rotated 90° for up attacks).
   */
  _layoutSwooshOverTop(group, opts = {}) {
    const swoosh = group.userData.swoosh;
    if (!swoosh) return;

    const {
      side = 1,
      headY = 0.55,
      tipY = 1.45,
      startX = -0.35,
      tipX = 0.2
    } = opts;

    const { beads, core, glow, segments } = swoosh;

    // Quadratic: rear/side shoulder → high over crown → tip above head
    const p0 = new THREE.Vector3(startX, headY * 0.55, 0.15 * side);
    const p1 = new THREE.Vector3(0.05 * side, tipY * 0.95, 0.35 * side);
    const p2 = new THREE.Vector3(tipX, tipY, 0.05 * side);

    const pointAt = (t) => {
      const u = 1 - t;
      return new THREE.Vector3(
        u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z
      );
    };

    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const p = pointAt(t * 0.9);
      // Never dip below mid-torso
      p.y = Math.max(p.y, 0.2);
      beads[i].position.copy(p);
      const s = 0.25 + 0.7 * t;
      beads[i].scale.set(s * 1.1, s * 0.7, s * 0.8);
    }

    const tip = pointAt(1);
    tip.y = Math.max(tip.y, tipY * 0.9);
    core.position.copy(tip);
    glow.position.copy(tip);
  }

  /** Random wrap path for this hit. Up attacks always go over the top. */
  _randomizeSwooshCurve(visual, aimUp = false) {
    if (aimUp) {
      const side = Math.random() < 0.5 ? 1 : -1;
      this._layoutSwooshOverTop(visual, {
        side,
        headY: 0.5 + Math.random() * 0.15,
        tipY: 1.35 + Math.random() * 0.25,
        startX: -0.45 + Math.random() * 0.2,
        tipX: 0.1 + Math.random() * 0.25
      });
      return;
    }

    const plane = Math.random() < 0.55 ? 'y' : 'z';
    const sign = plane === 'z' ? (Math.random() < 0.5 ? 1 : -1) : 1;
    const bodyR = 0.65 + Math.random() * 0.12;
    const tipR = 1.15 + Math.random() * 0.35;
    const startAngle = 2.0 + Math.random() * 0.7;
    const endAngle = 0.05 + Math.random() * 0.2;
    this._layoutSwooshAroundBody(visual, {
      plane,
      sign,
      bodyR,
      tipR,
      startAngle,
      endAngle
    });
  }

  createShieldVisual() {
    // Hemisphere bubble on the front face only (local +X = facing)
    const geometry = new THREE.SphereGeometry(0.9, 20, 14, 0, Math.PI, 0, Math.PI);
    geometry.computeVertexNormals();
    this._shieldBasePositions = new Float32Array(geometry.attributes.position.array);
    const material = new THREE.MeshBasicMaterial({
      color: this.teamColor,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      wireframe: false
    });
    this.shieldMesh = new THREE.Mesh(geometry, material);
    this.shieldMesh.rotation.y = Math.PI / 2;
    this.shieldMesh.position.set(0.15, 0.05, 0);
    this.shieldMesh.visible = false;
    this._shieldBaseLocal = { x: 0.15, y: 0.05, z: 0 };
    this.mesh.add(this.shieldMesh);
  }

  updateShieldVisual(deltaTime) {
    if (!this.shieldMesh) return;

    if (!this.isShielding || this.shieldBroken) {
      this.shieldMesh.visible = false;
      this.shieldMesh.scale.set(1, 1, 1);
      this.shieldMesh.position.set(
        this._shieldBaseLocal.x,
        this._shieldBaseLocal.y,
        this._shieldBaseLocal.z
      );
      this.shieldMesh.rotation.z = 0;
      return;
    }

    this.shieldMesh.visible = true;
    this.shieldPhase += deltaTime * SHIELD_WARP_SPEED;
    const t = this.shieldPhase;
    const stunBoost = this.shieldStunTimer > 0 ? 1.8 : 1;
    const hpRatio = Math.max(0.15, this.shieldHp / COMBAT_FEEL.SHIELD_MAX_HP);

    // Soft bob / drift while held
    const bobY = Math.sin(t * 1.7) * SHIELD_BOB_AMOUNT * stunBoost;
    const driftZ = Math.sin(t * 1.1 + 0.6) * 0.03 * stunBoost;
    const driftX = Math.cos(t * 0.9) * 0.02;
    this.shieldMesh.position.set(
      this._shieldBaseLocal.x + driftX,
      this._shieldBaseLocal.y + bobY,
      this._shieldBaseLocal.z + driftZ
    );

    // Shrink as HP drops; non-uniform pulse
    const baseScale = 0.55 + 0.45 * hpRatio;
    const sx = baseScale * (1 + Math.sin(t * 2.3) * SHIELD_SCALE_PULSE * stunBoost);
    const sy = baseScale * (1 + Math.sin(t * 1.8 + 1.2) * SHIELD_SCALE_PULSE * 1.15 * stunBoost);
    const sz = baseScale * (1 + Math.sin(t * 2.1 + 0.4) * SHIELD_SCALE_PULSE * 0.9 * stunBoost);
    this.shieldMesh.scale.set(sx, sy, sz);
    this.shieldMesh.rotation.z = Math.sin(t * 1.4) * 0.08 * stunBoost;

    // Vertex warp for jelly / energy surface
    const pos = this.shieldMesh.geometry.attributes.position;
    const base = this._shieldBasePositions;
    if (base && pos) {
      const amp = SHIELD_WARP_AMOUNT * stunBoost;
      for (let i = 0; i < pos.count; i++) {
        const ix = i * 3;
        const bx = base[ix];
        const by = base[ix + 1];
        const bz = base[ix + 2];
        const n = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
        const nx = bx / n;
        const ny = by / n;
        const nz = bz / n;
        const wave =
          Math.sin(t * 4.2 + by * 6.5 + bz * 4.1) * 0.55 +
          Math.sin(t * 2.7 + bx * 5.0 + by * 3.2) * 0.35 +
          Math.cos(t * 5.1 + bz * 7.0) * 0.25;
        const push = wave * amp;
        pos.array[ix] = bx + nx * push;
        pos.array[ix + 1] = by + ny * push;
        pos.array[ix + 2] = bz + nz * push;
      }
      pos.needsUpdate = true;
      this.shieldMesh.geometry.computeVertexNormals();
    }

    // Pulse opacity; flash redder when low HP
    if (this.shieldMesh.material) {
      this.shieldMesh.material.opacity = 0.28 + 0.2 * hpRatio + 0.1 * (0.5 + 0.5 * Math.sin(t * 3.5));
      const base = new THREE.Color(this.teamColor);
      if (hpRatio < 0.35) {
        base.lerp(new THREE.Color(0xff3333), 1 - hpRatio / 0.35);
      }
      this.shieldMesh.material.color.copy(base);
    }
  }

  createCounterVisual() {
    const geometry = new THREE.SphereGeometry(1.05, 18, 14);
    const material = new THREE.MeshBasicMaterial({
      color: this.teamColor,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.BackSide
    });
    this.counterMesh = new THREE.Mesh(geometry, material);
    this.counterMesh.position.set(0, 0, 0);
    this.counterMesh.visible = false;
    this.mesh.add(this.counterMesh);
    this.counterSparkles = [];
    this.counterSparkleAcc = 0;
  }

  _spawnCounterSparkle() {
    if (!this.mesh) return;
    const color = this.teamColor ?? 0xff2222;
    const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4).getHex();
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() < 0.5 ? color : light,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const size = 0.05 + Math.random() * 0.07;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 5, 4), mat);
    const ang = Math.random() * Math.PI * 2;
    const r = 0.55 + Math.random() * 0.55;
    mesh.position.set(
      Math.cos(ang) * r,
      (Math.random() - 0.35) * 0.9,
      Math.sin(ang) * r * 0.35
    );
    this.mesh.add(mesh);
    this.counterSparkles.push({
      mesh,
      mat,
      age: 0,
      lifetime: 0.28 + Math.random() * 0.22,
      spin: (Math.random() - 0.5) * 6,
      rise: 0.6 + Math.random() * 1.1,
      orbit: 0.8 + Math.random() * 1.4,
      ang
    });
  }

  _clearCounterSparkles() {
    if (!this.counterSparkles?.length) return;
    for (const s of this.counterSparkles) {
      this.mesh?.remove(s.mesh);
      s.mesh.geometry?.dispose?.();
      s.mat?.dispose?.();
    }
    this.counterSparkles = [];
    this.counterSparkleAcc = 0;
  }

  updateCounterVisual(deltaTime) {
    // Active stance: team-color sparkles orbit the fighter
    if (this.isCountering && this.counterTimer > 0) {
      this.counterSparkleAcc += deltaTime;
      while (this.counterSparkleAcc >= 0.045) {
        this.counterSparkleAcc -= 0.045;
        this._spawnCounterSparkle();
      }
    } else {
      this.counterSparkleAcc = 0;
    }

    for (let i = this.counterSparkles.length - 1; i >= 0; i--) {
      const s = this.counterSparkles[i];
      s.age += deltaTime;
      const t = Math.min(1, s.age / s.lifetime);
      s.ang += s.orbit * deltaTime;
      const r = 0.5 + t * 0.45;
      s.mesh.position.x = Math.cos(s.ang) * r;
      s.mesh.position.z = Math.sin(s.ang) * r * 0.35;
      s.mesh.position.y += s.rise * deltaTime;
      s.mesh.scale.setScalar(1 - t * 0.7);
      s.mat.opacity = Math.max(0, 0.95 * (1 - t));
      if (s.age >= s.lifetime) {
        this.mesh?.remove(s.mesh);
        s.mesh.geometry?.dispose?.();
        s.mat?.dispose?.();
        this.counterSparkles.splice(i, 1);
      }
    }

    if (!this.counterMesh) return;

    // Big flash only after a successful counter reflect
    if (this.counterSuccessFlash > 0) {
      this.counterSuccessFlash -= deltaTime;
      this.counterMesh.visible = true;
      const p = Math.max(0, this.counterSuccessFlash / 0.22);
      const s = 1.2 + p * 0.8;
      this.counterMesh.scale.set(s, s, s);
      this.counterMesh.material.opacity = 0.15 + p * 0.5;
      this.counterMesh.rotation.y += deltaTime * 8;
      if (this.counterSuccessFlash <= 0) {
        this.counterMesh.visible = false;
        this.counterMesh.scale.set(1, 1, 1);
        if (this.counterMesh.material?.color && this.teamColor != null) {
          this.counterMesh.material.color.setHex(this.teamColor);
        }
      }
      return;
    }

    this.counterMesh.visible = false;
  }

  createBody() {
    const size = UNIFORM_SIZE;
    const mass = this.stats.weight * 5;

    if (
      this.type === CHARACTER_TYPES.MEDIUM ||
      this.type === CHARACTER_TYPES.WASABI ||
      this.type === CHARACTER_TYPES.GYOZA ||
      this.type === CHARACTER_TYPES.TAMAGO
    ) {
      this.body = this.game.createSphereBody(
        this.position.x, this.position.y, this.position.z,
        size / 2, mass
      );
      this._halfHeight = size / 2;
    } else if (
      this.type === CHARACTER_TYPES.HEAVY ||
      this.type === CHARACTER_TYPES.ONIGIRI ||
      this.type === CHARACTER_TYPES.RAMEN
    ) {
      this.body = this.game.createDynamicBody(
        this.position.x, this.position.y, this.position.z,
        size, size, size, mass
      );
      this._halfHeight = size / 2;
    } else {
      // LIGHT (tempura)
      this.body = this.game.createDynamicBody(
        this.position.x, this.position.y, this.position.z,
        size, size * 1.5, size * 0.5, mass
      );
      this._halfHeight = size * 0.75;
    }

    this._preStepFeetY = this.position.y - this._halfHeight;
  }

  isActionable() {
    return this.fighterState === FIGHTER_STATE.ACTIONABLE || this.fighterState === FIGHTER_STATE.SHIELD;
  }

  canAttack() {
    return this.fighterState === FIGHTER_STATE.ACTIONABLE
      && this.attackCooldown <= 0
      && !this.isAttacking
      && !this.isChargingHeavy
      && !this.isDodging
      && !this.shieldBroken
      && !this.isCountering
      && !this.isGroundPounding
      && !this.isRolling
      && !this.isGrabbing
      && !this.isLassoing;
  }

  canDodge() {
    return this.fighterState === FIGHTER_STATE.ACTIONABLE
      && this.dodgeCooldown <= 0
      && !this.isAttacking
      && !this.isChargingHeavy
      && !this.isShielding
      && !this.shieldBroken
      && !this.isCountering
      && !this.isGroundPounding
      && !this.isRolling
      && !this.isGrabbing
      && !this.isLassoing
      && this.isGrounded;
  }

  canSpecial() {
    return this.fighterState === FIGHTER_STATE.ACTIONABLE
      && this.specialCooldown <= 0
      && !this.isAttacking
      && !this.isChargingHeavy
      && !this.isDodging
      && !this.shieldBroken
      && !this.isGroundPounding
      && !this.isCountering
      && !this.isRolling
      && !this.isGrabbing
      && !this.isLassoing
      && !this.isStinkCloud;
  }

  handleSpecial(inputState) {
    if (!inputState.special || !this.canSpecial()) return;
    if (this.type === CHARACTER_TYPES.LIGHT) {
      this.fireOilProjectile();
    } else if (this.type === CHARACTER_TYPES.MEDIUM) {
      this.beginCounter();
    } else if (this.type === CHARACTER_TYPES.HEAVY) {
      this.beginGroundPound();
    } else if (this.type === CHARACTER_TYPES.WASABI) {
      this.fireWasabiDrop();
    } else if (this.type === CHARACTER_TYPES.GYOZA) {
      this.beginTakoyakiRoll();
    } else if (this.type === CHARACTER_TYPES.ONIGIRI) {
      this.beginOnigiriGrab();
    } else if (this.type === CHARACTER_TYPES.RAMEN) {
      this.beginNoodleLasso();
    } else if (this.type === CHARACTER_TYPES.TAMAGO) {
      this.beginStinkCloud();
    }
  }

  fireOilProjectile() {
    this._spawnSpecialProjectile(SPECIALS.OIL_PROJECTILE);
    this.game?.particles?.spawnSteam?.(
      this.position.clone().add(new THREE.Vector3(this.facing * 0.5, 0.3, 0)),
      1.2
    );
  }

  fireWasabiDrop() {
    this._spawnSpecialProjectile(SPECIALS.WASABI_DROP, {
      leavesPuddle: true,
      arcing: true,
      arcVy: SPECIALS.WASABI_DROP.arcVy,
      gravity: SPECIALS.WASABI_DROP.gravity,
      groundY: SPECIALS.WASABI_DROP.groundY
    });
    this.game?.particles?.spawnGlowSparks?.(
      this.position.clone().add(new THREE.Vector3(0, 0.4, 0)),
      this.teamColor ?? 0x6dff4a,
      8
    );
  }

  _spawnSpecialProjectile(def, extra = {}) {
    audio.playSpecial();
    this.specialCooldown = def.cooldown;
    const facing = this.facing >= 0 ? 1 : -1;
    const spawnX = this.position.x + def.spawnOffsetX * facing;
    const spawnY = this.position.y + def.spawnOffsetY;
    const vy = extra.arcing ? (extra.arcVy ?? 0) : 0;
    const core = this.teamColor ?? def.coreColor;
    const glow = new THREE.Color(core).lerp(new THREE.Color(0xffffff), 0.35).getHex();
    this.game.combatSystem?.spawnProjectile({
      owner: this,
      position: new THREE.Vector3(spawnX, spawnY, 0),
      velocity: new THREE.Vector3(def.speed * facing, vy, 0),
      visualRadius: def.visualRadius,
      collisionRadius: def.collisionRadius,
      coreColor: core,
      glowColor: glow,
      lifetime: def.lifetime,
      damage: def.damage,
      baseKnockback: def.baseKnockback,
      angle: def.angle,
      hitstun: def.hitstun,
      hitlag: def.hitlag,
      bypassShield: false,
      hitTargets: new Set(),
      leavesPuddle: !!extra.leavesPuddle,
      arcing: !!extra.arcing,
      gravity: extra.gravity ?? 0,
      groundY: extra.groundY ?? 0.5,
      puddleRadius: def.puddleRadius,
      puddleLifetime: def.puddleLifetime,
      puddleDamage: def.puddleDamage,
      puddleTick: def.puddleTick,
      puddleKnockback: def.puddleKnockback
    });
  }

  beginTakoyakiRoll() {
    audio.playSpecial();
    const def = SPECIALS.TAKOYAKI_ROLL;
    this.isRolling = true;
    this.rollTimer = def.duration;
    this.rollDir = this.facing >= 0 ? 1 : -1;
    this.rollHitTargets = new Set();
    this._rollFlameAcc = 0;
    this.specialCooldown = def.cooldown;
    this.cancelHeavyCharge();
    this.endAttack();
    this.isShielding = false;
    this.fighterState = FIGHTER_STATE.ATTACK;
    if (this.body) {
      this.body.setLinvel({ x: this.rollDir * def.speed, y: this.body.linvel().y * 0.2, z: 0 }, true);
    }
    // Burst of flames on start
    this.game.combatSystem?.spawnRollFlame?.(this);
    this.game.combatSystem?.spawnRollFlame?.(this);
  }

  updateTakoyakiRoll(deltaTime) {
    if (!this.isRolling) return;
    const def = SPECIALS.TAKOYAKI_ROLL;
    this.rollTimer -= deltaTime;
    if (this.body) {
      this.body.setLinvel({
        x: this.rollDir * def.speed,
        y: this.body.linvel().y * 0.85,
        z: 0
      }, true);
    }
    if (this.bodyMesh) {
      this.bodyMesh.rotation.z -= this.rollDir * deltaTime * 18;
    }

    // Continuous flame trail while dashing
    this._rollFlameAcc = (this._rollFlameAcc ?? 0) + deltaTime;
    if (this._rollFlameAcc >= 0.03) {
      this._rollFlameAcc = 0;
      this.game.combatSystem?.spawnRollFlame?.(this);
    }

    this.game.combatSystem?.applyRollHit(this, def);
    if (this.rollTimer <= 0) this.endTakoyakiRoll();
  }

  endTakoyakiRoll() {
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollHitTargets = new Set();
    this._rollFlameAcc = 0;
    // Final flame burst
    this.game.combatSystem?.spawnRollFlame?.(this);
    if (this.fighterState === FIGHTER_STATE.ATTACK) {
      this.fighterState = FIGHTER_STATE.ACTIONABLE;
    }
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.35, y: v.y, z: 0 }, true);
    }
  }

  beginOnigiriGrab() {
    audio.playSpecial();
    const def = SPECIALS.ONIGIRI_GRAB;
    this.isGrabbing = true;
    this.grabPhase = 'startup';
    this.grabTimer = def.startup + def.active + def.endlag;
    this.grabHitTargets = new Set();
    this.grabHeldTarget = null;
    this.specialCooldown = def.cooldown;
    this.cancelHeavyCharge();
    this.endAttack();
    this.isShielding = false;
    this.fighterState = FIGHTER_STATE.ATTACK;
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.25, y: v.y * 0.3, z: 0 }, true);
    }
    this.game.combatSystem?.spawnGrabSpark?.(this);
  }

  updateOnigiriGrab(deltaTime) {
    if (!this.isGrabbing) return;
    const def = SPECIALS.ONIGIRI_GRAB;
    this.grabTimer -= deltaTime;

    if (this.grabPhase === 'startup' || this.grabPhase === 'active') {
      const elapsed = def.startup + def.active + def.endlag - this.grabTimer;
      if (this.grabPhase === 'startup' && elapsed >= def.startup) {
        this.grabPhase = 'active';
      } else if (this.grabPhase === 'active' && elapsed >= def.startup + def.active) {
        this.grabPhase = 'endlag';
        this.grabTimer = def.endlag;
      }
    } else if (this.grabPhase === 'hold') {
      this._snapGrabHold(def);
      if (this.grabTimer <= 0) {
        this.game.combatSystem?.throwGrabTarget(this, def);
        this.grabPhase = 'endlag';
        this.grabTimer = def.endlag;
      }
    }

    if (this.body) {
      const v = this.body.linvel();
      if (this.grabPhase === 'hold') {
        this.body.setLinvel({ x: 0, y: Math.min(v.y, 0), z: 0 }, true);
      } else {
        this.body.setLinvel({ x: v.x * 0.7, y: v.y, z: 0 }, true);
      }
    }

    if (this.grabPhase === 'active') {
      this.game.combatSystem?.applyGrabHit(this, def);
    }

    if (this.grabTimer <= 0 && this.grabPhase !== 'hold') {
      this.endOnigiriGrab();
    }
  }

  _snapGrabHold(def) {
    const target = this.grabHeldTarget;
    if (!target?.body || target.isDead) {
      this.grabHeldTarget = null;
      this.grabPhase = 'endlag';
      this.grabTimer = def.endlag;
      return;
    }
    const facing = this.facing >= 0 ? 1 : -1;
    const x = this.position.x + (def.holdOffsetX ?? 0.55) * facing;
    const y = this.position.y + (def.holdOffsetY ?? 0.35);
    target.body.setTranslation({ x, y, z: 0 }, true);
    target.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    target.position.set(x, y, 0);
    target.fighterState = FIGHTER_STATE.HITSTUN;
    target.hitstunTimer = Math.max(target.hitstunTimer, 0.05);
  }

  endOnigiriGrab() {
    // Drop held target safely if grab cancelled mid-hold
    if (this.grabHeldTarget && this.grabPhase === 'hold') {
      const t = this.grabHeldTarget;
      if (t.body && !t.isDead) {
        const facing = this.facing >= 0 ? 1 : -1;
        t.body.setLinvel({ x: -facing * 3, y: 4, z: 0 }, true);
        t.fighterState = FIGHTER_STATE.HITSTUN;
        t.hitstunTimer = Math.max(t.hitstunTimer, 0.2);
      }
    }
    this.isGrabbing = false;
    this.grabTimer = 0;
    this.grabPhase = null;
    this.grabHitTargets = new Set();
    this.grabHeldTarget = null;
    if (this.fighterState === FIGHTER_STATE.ATTACK) {
      this.fighterState = FIGHTER_STATE.ACTIONABLE;
    }
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.4, y: v.y, z: 0 }, true);
    }
  }

  beginNoodleLasso() {
    audio.playSpecial();
    const def = SPECIALS.NOODLE_LASSO;
    this.isLassoing = true;
    this.lassoPhase = 'startup';
    this.lassoTimer = def.startup + def.extend + def.endlag;
    this.lassoHitTargets = new Set();
    this.lassoHeldTarget = null;
    this.lassoExtendT = 0;
    this.specialCooldown = def.cooldown;
    this.cancelHeavyCharge();
    this.endAttack();
    this.isShielding = false;
    this.fighterState = FIGHTER_STATE.ATTACK;
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.2, y: v.y * 0.35, z: 0 }, true);
    }
    this.game.combatSystem?.ensureLassoVisual?.(this);
  }

  updateNoodleLasso(deltaTime) {
    if (!this.isLassoing) return;
    const def = SPECIALS.NOODLE_LASSO;
    this.lassoTimer -= deltaTime;

    if (this.lassoPhase === 'startup' || this.lassoPhase === 'extend') {
      const totalStart = def.startup + def.extend + def.endlag;
      const elapsed = totalStart - this.lassoTimer;
      if (this.lassoPhase === 'startup' && elapsed >= def.startup) {
        this.lassoPhase = 'extend';
        this.lassoExtendT = 0;
      } else if (this.lassoPhase === 'extend') {
        this.lassoExtendT = Math.min(1, (elapsed - def.startup) / def.extend);
        this.game.combatSystem?.applyLassoHit?.(this, def);
        if (elapsed >= def.startup + def.extend && !this.lassoHeldTarget) {
          this.lassoPhase = 'endlag';
          this.lassoTimer = def.endlag;
        }
      }
    } else if (this.lassoPhase === 'pull') {
      this.game.combatSystem?.updateLassoPull?.(this, def, deltaTime);
      if (this.lassoTimer <= 0) {
        this.game.combatSystem?.finishLassoPull?.(this, def);
        this.lassoPhase = 'endlag';
        this.lassoTimer = def.endlag * 0.55;
      }
    }

    if (this.body) {
      const v = this.body.linvel();
      if (this.lassoPhase === 'pull') {
        this.body.setLinvel({ x: 0, y: Math.min(v.y, 0), z: 0 }, true);
      } else {
        this.body.setLinvel({ x: v.x * 0.65, y: v.y, z: 0 }, true);
      }
    }

    this.game.combatSystem?.updateLassoVisual?.(this, def);

    if (this.lassoTimer <= 0 && this.lassoPhase !== 'pull') {
      this.endNoodleLasso();
    }
  }

  endNoodleLasso() {
    // Interrupted mid-pull: soft release (full pull already finishes in update)
    if (this.lassoHeldTarget?.body && !this.lassoHeldTarget.isDead && this.lassoPhase === 'pull') {
      const t = this.lassoHeldTarget;
      const facing = this.facing >= 0 ? 1 : -1;
      t.body.setLinvel({ x: facing * 2.5, y: 3.5, z: 0 }, true);
      t.fighterState = FIGHTER_STATE.HITSTUN;
      t.hitstunTimer = Math.max(t.hitstunTimer, 0.15);
    }
    this.isLassoing = false;
    this.lassoTimer = 0;
    this.lassoPhase = null;
    this.lassoHitTargets = new Set();
    this.lassoHeldTarget = null;
    this.lassoExtendT = 0;
    this.game.combatSystem?.hideLassoVisual?.(this);
    if (this.fighterState === FIGHTER_STATE.ATTACK) {
      this.fighterState = FIGHTER_STATE.ACTIONABLE;
    }
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.4, y: v.y, z: 0 }, true);
    }
  }

  beginStinkCloud() {
    audio.playSpecial();
    const def = SPECIALS.STINK_CLOUD;
    this.isStinkCloud = true;
    this.stinkCloudTimer = def.duration;
    this.stinkCloudTick = 0;
    this.specialCooldown = def.cooldown;
    this.cancelHeavyCharge();
    this.isShielding = false;
    this.game.combatSystem?.ensureStinkCloudVisual?.(this);
  }

  endStinkCloud() {
    this.isStinkCloud = false;
    this.stinkCloudTimer = 0;
    this.stinkCloudTick = 0;
    this.game.combatSystem?.hideStinkCloudVisual?.(this);
  }

  updateStinkCloud(deltaTime) {
    if (!this.isStinkCloud) return;
    this.stinkCloudTimer -= deltaTime;
    this.stinkCloudTick -= deltaTime;
    this.game.combatSystem?.updateStinkCloudVisual?.(this, deltaTime);
    if (this.stinkCloudTick <= 0) {
      this.stinkCloudTick = SPECIALS.STINK_CLOUD.tick;
      this.game.combatSystem?.applyStinkCloudTick?.(this, SPECIALS.STINK_CLOUD);
    }
    if (this.stinkCloudTimer <= 0) {
      this.endStinkCloud();
    }
  }

  beginCounter() {
    audio.playSpecial();
    const def = SPECIALS.COUNTER;
    this.isCountering = true;
    this.counterTimer = def.window;
    this.specialCooldown = def.cooldown;
  }

  endCounter() {
    this.isCountering = false;
    this.counterTimer = 0;
    this._clearCounterSparkles();
    if (this.counterMesh && this.counterSuccessFlash <= 0) {
      this.counterMesh.visible = false;
      this.counterMesh.scale.set(1, 1, 1);
    }
  }

  /** Brief body flash when counter reflects a hit (called from combat). */
  flashCounterSuccess() {
    this.counterSuccessFlash = 0.22;
    if (!this.counterMesh) return;
    this.counterMesh.visible = true;
    this.counterMesh.scale.set(1.6, 1.6, 1.6);
    if (this.counterMesh.material) {
      this.counterMesh.material.opacity = 0.6;
      this.counterMesh.material.color?.setHex?.(this.teamColor ?? 0xff2222);
    }
  }

  updateCounter(deltaTime) {
    if (!this.isCountering) return;
    this.counterTimer -= deltaTime;
    if (this.counterTimer <= 0) {
      this.endCounter();
    }
  }

  beginGroundPound() {
    audio.playSpecial();
    const def = SPECIALS.GROUND_POUND;
    this.isGroundPounding = true;
    this.groundPoundPhase = 'windup';
    this.groundPoundTimer = def.windupDuration + def.recoverDuration;
    this.specialCooldown = def.cooldown;
    this.isGrounded = false;
    this.isInvincible = true;
    if (this.body) {
      this.body.setLinvel({ x: 0, y: def.hopImpulse, z: 0 }, true);
    }
  }

  updateGroundPound(deltaTime) {
    const def = SPECIALS.GROUND_POUND;
    if (!this.isGroundPounding) return;

    if (this.groundPoundPhase === 'windup') {
      this.groundPoundTimer -= deltaTime;
      if (this.groundPoundTimer <= def.recoverDuration) {
        this.groundPoundPhase = 'recover';
        this.isInvincible = false;
        this.triggerGroundPoundAoe();
      }
    } else if (this.groundPoundPhase === 'recover') {
      this.groundPoundTimer -= deltaTime;
      if (this.groundPoundTimer <= 0) {
        this.endGroundPound();
      }
    }
  }

  endGroundPound() {
    this.isGroundPounding = false;
    this.groundPoundPhase = null;
    this.groundPoundTimer = 0;
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.4, y: v.y, z: 0 }, true);
    }
  }

  triggerGroundPoundAoe() {
    this.game.combatSystem?.applyGroundPoundAoe(this);
  }

  update(deltaTime, inputState) {
    if (this._landDustCooldown > 0) this._landDustCooldown -= deltaTime;

    if (this.isDead || this.fighterState === FIGHTER_STATE.DEAD) {
      if (this.isStinkCloud) this.endStinkCloud();
      if (this.victoryPose) {
        this.updateVictoryPose(deltaTime);
        this.syncMeshPosition(deltaTime);
      }
      return;
    }

    // Special cooldown keeps ticking through hitlag / hitstun so the triangle flash stays honest
    if (this.specialCooldown > 0) {
      this.specialCooldown -= deltaTime;
    }
    this.updateTeamMarkerCooldown(deltaTime);
    this._updateAttackTrail(deltaTime);
    // Aura keeps dealing damage through hitlag / hitstun
    this.updateStinkCloud(deltaTime);
    this.updateCowardDamage(deltaTime);

    if (this.hitlagTimer > 0) {
      this.hitlagTimer -= deltaTime;
      if (this._hitlagVel) {
        this.body.setLinvel(this._hitlagVel, true);
      }
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }
    this._hitlagVel = null;

    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= deltaTime * 1000;
      if (this.invincibleTimer <= 0) {
        // Keep invuln if still in dodge iframes
        if (!(this.isDodging && this.dodgeTimer > COMBAT_FEEL.DODGE_DURATION - COMBAT_FEEL.DODGE_IFRAMES)) {
          this.isInvincible = false;
          this.setMeshOpacity(1, false);
        }
      } else {
        this.setMeshOpacity(0.5 + 0.5 * Math.sin(this.invincibleTimer * 0.02), true);
      }
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
    if (this.dodgeCooldown > 0) {
      this.dodgeCooldown -= deltaTime;
    }
    if (this.shieldStunTimer > 0) {
      this.shieldStunTimer -= deltaTime;
    }
    this.updateCounter(deltaTime);

    this.updateShieldHp(deltaTime);

    if (this.fighterState === FIGHTER_STATE.SHIELD_BREAK) {
      this.shieldBreakTimer -= deltaTime;
      if (this.body) {
        const v = this.body.linvel();
        this.body.setLinvel({ x: v.x * 0.9, y: v.y, z: 0 }, true);
      }
      if (this.shieldBreakTimer <= 0) {
        this.shieldBroken = false;
        this.shieldHp = COMBAT_FEEL.SHIELD_MAX_HP * 0.35;
        this.fighterState = FIGHTER_STATE.ACTIONABLE;
        this.setMeshOpacity(1, false);
      }
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }

    if (this.fighterState === FIGHTER_STATE.HITSTUN) {
      this.hitstunTimer -= deltaTime;
      this.applyDI(inputState);
      if (this.hitstunTimer <= 0) {
        this.fighterState = FIGHTER_STATE.ACTIONABLE;
        this.hitstunTimer = 0;
      }
      this.cancelHeavyCharge();
      this.endCounter();
      if (this.isGroundPounding) this.endGroundPound();
      if (this.isRolling) this.endTakoyakiRoll();
      if (this.isGrabbing) this.endOnigiriGrab();
      if (this.isLassoing) this.endNoodleLasso();
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }

    if (this.fighterState === FIGHTER_STATE.DODGE) {
      this.updateDodge(deltaTime);
      this.updateWalkCycle(deltaTime);
      this.updateArmSwing();
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }

    if (this.isRolling) {
      this.updateTakoyakiRoll(deltaTime);
      this.updateWalkCycle(deltaTime);
      this.updateArmSwing();
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }

    if (this.isLassoing) {
      this.updateNoodleLasso(deltaTime);
      this.updateWalkCycle(deltaTime);
      this.updateArmSwing();
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }

    if (this.isGrabbing) {
      this.updateOnigiriGrab(deltaTime);
      this.updateWalkCycle(deltaTime);
      this.updateArmSwing();
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }

    if (this.isGroundPounding) {
      this.updateGroundPound(deltaTime);
      this.updateWalkCycle(deltaTime);
      this.updateArmSwing();
      this.updateBodyMotion(deltaTime);
      this.updateBlink(deltaTime);
      this.updateShieldVisual(deltaTime);
      this.updateCounterVisual(deltaTime);
      this.syncMeshPosition(deltaTime);
      return;
    }

    if (this.isAttacking && this.currentMove) {
      this.attackElapsed += deltaTime;
      const total = getMoveTotalDuration(this.currentMove);
      const active = isMoveActive(this.currentMove, this.attackElapsed);
      this.updateAttackVisual(active);

      if (this.attackElapsed >= total) {
        this.endAttack();
      }
    }

    this.handleShielding(inputState);
    if (this.isChargingHeavy) {
      this.updateHeavyCharge(deltaTime, inputState);
    } else if (this.fighterState === FIGHTER_STATE.ACTIONABLE) {
      this.handleDodge(inputState);
      if (this.fighterState === FIGHTER_STATE.DODGE) {
        // started this frame
      } else {
        this.handleAttacks(inputState);
        this.handleJumping(inputState);
        this.handleMovement(inputState);
        this.handleSpecial(inputState);
      }
    } else if (this.fighterState === FIGHTER_STATE.SHIELD) {
      this.handleShieldMovement(inputState);
    } else if (this.fighterState === FIGHTER_STATE.ATTACK) {
      this.handleAttackMovement(inputState);
    }

    this.updateWalkCycle(deltaTime);
    this.updateArmSwing();
    this.updateBodyMotion(deltaTime);
    this.updateBlink(deltaTime);
    this.updateShieldVisual(deltaTime);
    this.updateCounterVisual(deltaTime);
    this.syncMeshPosition(deltaTime);
  }

  updateShieldHp(deltaTime) {
    if (this.shieldBroken) return;

    if (this.isShielding) {
      this.shieldRegenDelay = COMBAT_FEEL.SHIELD_REGEN_DELAY;
      return;
    }

    if (this.shieldRegenDelay > 0) {
      this.shieldRegenDelay -= deltaTime;
      return;
    }

    if (this.shieldHp < COMBAT_FEEL.SHIELD_MAX_HP) {
      this.shieldHp = Math.min(
        COMBAT_FEEL.SHIELD_MAX_HP,
        this.shieldHp + COMBAT_FEEL.SHIELD_REGEN_PER_SEC * deltaTime
      );
    }
  }

  handleDodge(inputState) {
    if (!inputState.dodge || !this.canDodge()) return;

    let dir = this.facing >= 0 ? 1 : -1;
    if (inputState.left) dir = -1;
    else if (inputState.right) dir = 1;

    audio.playDodge();
    this.isDodging = true;
    this.dodgeDir = dir;
    this.dodgeTimer = COMBAT_FEEL.DODGE_DURATION;
    this.dodgeCooldown = COMBAT_FEEL.DODGE_COOLDOWN;
    this.fighterState = FIGHTER_STATE.DODGE;
    this.cancelHeavyCharge();
    this.isShielding = false;
    this.isInvincible = true;
    this.setMeshOpacity(0.45, true);

    if (this.body) {
      this.body.setLinvel({
        x: dir * COMBAT_FEEL.DODGE_SPEED,
        y: this.body.linvel().y * 0.3,
        z: 0
      }, true);
    }
  }

  updateDodge(deltaTime) {
    this.dodgeTimer -= deltaTime;
    const elapsed = COMBAT_FEEL.DODGE_DURATION - this.dodgeTimer;
    const inIframes = elapsed < COMBAT_FEEL.DODGE_IFRAMES;

    if (this.body) {
      const decay = inIframes ? 0.98 : 0.88;
      const v = this.body.linvel();
      const targetX = this.dodgeDir * COMBAT_FEEL.DODGE_SPEED * (inIframes ? 1 : 0.35);
      this.body.setLinvel({
        x: v.x * decay + targetX * (1 - decay),
        y: v.y,
        z: 0
      }, true);
    }

    this.isInvincible = inIframes;
    if (!inIframes && this.invincibleTimer <= 0) {
      this.setMeshOpacity(0.7, true);
    }

    if (this.dodgeTimer <= 0) {
      this.endDodge();
    }
  }

  endDodge() {
    this.isDodging = false;
    this.dodgeTimer = 0;
    this.fighterState = FIGHTER_STATE.ACTIONABLE;
    if (this.invincibleTimer <= 0) {
      this.isInvincible = false;
      this.setMeshOpacity(1, false);
    }
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.4, y: v.y, z: 0 }, true);
    }
  }

  breakShield() {
    this.shieldBroken = true;
    this.shieldHp = 0;
    this.isShielding = false;
    this.shieldStunTimer = 0;
    this.cancelHeavyCharge();
    this.endAttack();
    this.fighterState = FIGHTER_STATE.SHIELD_BREAK;
    this.shieldBreakTimer = COMBAT_FEEL.SHIELD_BREAK_STUN;
    this.setMeshOpacity(0.85, true);
    if (this.body) {
      this.body.setLinvel({ x: 0, y: 4, z: 0 }, true);
    }
  }

  startVictoryPose() {
    this.victoryPose = true;
    this.victoryTimer = 0;
    this.isShielding = false;
    this.isDodging = false;
    this.fighterState = FIGHTER_STATE.ACTIONABLE;
    this.hitstunTimer = 0;
    this.hitlagTimer = 0;
    this.cancelHeavyCharge();
    this.endAttack();
    this.hideAttackVisuals();
    // Face the camera (+Z). Built facing +X; -π/2 turns face toward screen.
    this.targetYaw = -Math.PI / 2;
    this._lastFacing = this.facing;
    if (this.body) {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  updateVictoryPose(deltaTime) {
    this.victoryTimer += deltaTime;
    if (!this.bodyMesh || !this.leftArm || !this.rightArm) return;

    // Keep turning toward camera
    this.targetYaw = -Math.PI / 2;
    this.applyFacing(deltaTime);

    const t = this.victoryTimer;
    const bounce = Math.sin(t * 5.5) * 0.05;
    // Ease arms fully overhead
    const armsUp = Math.min(1, t / 0.4);
    const ease = armsUp * armsUp * (3 - 2 * armsUp);

    this.bodyMesh.position.y = this._bodyBaseY + bounce + 0.1 * ease;
    this.bodyMesh.rotation.z = Math.sin(t * 2.8) * 0.06;
    this.bodyMesh.rotation.x = -0.05 * ease;
    this.bodyMesh.rotation.y = 0;
    this.bodyMesh.scale.set(1 + 0.03 * Math.sin(t * 4.5), 1 - 0.025 * Math.sin(t * 4.5), 1);

    // Arms hang in -Y; rotate ~π around Z so they point up, slight outward spread
    const raise = Math.PI * 0.95 * ease;
    const spread = 0.35 * ease;
    const lr = this.leftArm.userData.rest;
    const rr = this.rightArm.userData.rest;
    this.leftArm.rotation.set(lr.x + 0.15 * ease, lr.y + spread, lr.z + raise);
    this.rightArm.rotation.set(rr.x + 0.15 * ease, rr.y - spread, rr.z - raise);

    if (this.leftLeg && this.rightLeg) {
      this.leftLeg.rotation.set(0, 0, 0.12);
      this.rightLeg.rotation.set(0, 0, -0.12);
    }
  }

  updateBlink(deltaTime) {
    if (!this.faceGroup) return;

    if (this.blinkTimer > 0) {
      this.blinkTimer = Math.max(0, this.blinkTimer - deltaTime);
      const half = BLINK_DURATION * 0.5;
      const t = this.blinkTimer;
      // Squash the whole square eye plate shut, then reopen
      let scaleY = 0.08;
      if (t > half) {
        const p = (t - half) / half;
        scaleY = 0.08 + 0.92 * p;
      } else if (t > 0) {
        const p = t / half;
        scaleY = 0.08 + 0.92 * (1 - p);
      } else {
        scaleY = 1;
      }
      this.faceGroup.scale.set(1, scaleY, 1);
      if (this.blinkTimer <= 0) {
        this.faceGroup.scale.set(1, 1, 1);
        this.blinkOpenTimer = BLINK_MIN_GAP + Math.random() * (BLINK_MAX_GAP - BLINK_MIN_GAP);
      }
      return;
    }

    this.blinkOpenTimer -= deltaTime;
    if (this.blinkOpenTimer <= 0) {
      this.blinkTimer = BLINK_DURATION;
    }
  }

  triggerFlinch(knockbackVector) {
    this.flinchDuration = FLINCH_DURATION;
    this.flinchTimer = FLINCH_DURATION;
    this.flinchDir = knockbackVector.x >= 0 ? 1 : -1;
  }

  triggerJumpJerk() {
    this.jumpJerkDuration = JUMP_JERK_DURATION;
    this.jumpJerkTimer = JUMP_JERK_DURATION;
  }

  triggerDoubleJumpFlip() {
    this.doubleJumpFlipTimer = DOUBLE_JUMP_FLIP_DURATION;
    // Flip toward facing direction; facing right → -Z rotation, facing left → +Z rotation
    const face = this.facing >= 0 ? 1 : -1;
    this.doubleJumpFlipDir = -face;
  }

  updateBodyMotion(deltaTime) {
    if (!this.bodyMesh || !this.mesh) return;

    if (this.flinchTimer > 0) {
      this.flinchTimer = Math.max(0, this.flinchTimer - deltaTime);
    }
    if (this.jumpJerkTimer > 0) {
      this.jumpJerkTimer = Math.max(0, this.jumpJerkTimer - deltaTime);
    }
    if (this.doubleJumpFlipTimer > 0) {
      this.doubleJumpFlipTimer = Math.max(0, this.doubleJumpFlipTimer - deltaTime);
    }

    const speedX = this.body ? Math.abs(this.body.linvel().x) : 0;
    const running = this.isGrounded
      && speedX > 0.4
      && !this.isAttacking
      && this.fighterState !== FIGHTER_STATE.HITSTUN
      && this.flinchTimer <= 0;

    let swayZ = 0;
    let leanX = 0;
    let bobY = 0;

    if (running) {
      const phase = this.walkPhase;
      swayZ = Math.sin(phase) * RUN_BODY_SWAY;
      leanX = Math.sin(phase * 0.5) * RUN_BODY_LEAN * 0.35;
      bobY = Math.abs(Math.sin(phase)) * 0.04;
    }

    let flinchTilt = 0;
    let flinchNudge = 0;
    if (this.flinchTimer > 0 && this.flinchDuration > 0) {
      const t = this.flinchTimer / this.flinchDuration;
      // Sharp hit, then ease out
      const punch = Math.sin((1 - t) * Math.PI) * t;
      flinchTilt = -this.flinchDir * FLINCH_TILT * punch;
      flinchNudge = this.flinchDir * FLINCH_NUDGE * punch;
    }

    let scaleX = 1;
    let scaleY = 1;
    let jerkY = 0;
    if (this.jumpJerkTimer > 0 && this.jumpJerkDuration > 0) {
      const t = 1 - this.jumpJerkTimer / this.jumpJerkDuration;
      if (t < 0.35) {
        const p = t / 0.35;
        scaleY = 1 - JUMP_JERK_SQUASH * p;
        scaleX = 1 + JUMP_JERK_SQUASH * 0.7 * p;
        jerkY = -0.06 * p;
      } else {
        const p = (t - 0.35) / 0.65;
        const stretch = Math.sin(p * Math.PI) * (1 - p);
        scaleY = 1 + JUMP_JERK_STRETCH * stretch;
        scaleX = 1 - JUMP_JERK_STRETCH * 0.55 * stretch;
        jerkY = 0.05 * stretch;
      }
    }

    let attackSwing = 0;
    let attackTwist = 0;
    let attackLift = 0;
    if (this.isAttacking && this.currentMove && this.flinchTimer <= 0) {
      const move = this.currentMove;
      const t = this.attackElapsed;
      const { startup, active, endlag } = move;
      const intensity = this.attackType === 'heavy' ? 1.2 : 0.9;
      const aimUp = this.attackIsUp;

      let envelope = 0;
      if (t < startup) {
        const p = t / Math.max(startup, 0.001);
        // Wind back, then snap into the swing
        envelope = p < 0.4 ? -0.55 * (p / 0.4) : -0.55 + 1.55 * ((p - 0.4) / 0.6);
      } else if (t < startup + active) {
        envelope = 1;
      } else {
        const p = (t - startup - active) / Math.max(endlag, 0.001);
        envelope = 1 - Math.min(1, p);
      }

      if (aimUp) {
        attackSwing = ATTACK_BODY_SWING * 0.35 * envelope * intensity;
        attackTwist = ATTACK_BODY_TWIST * 0.25 * envelope * intensity;
        attackLift = ATTACK_BODY_LIFT * 1.4 * Math.max(0, envelope) * intensity;
        leanX -= 0.22 * Math.max(0, envelope) * intensity;
      } else {
        attackSwing = ATTACK_BODY_SWING * envelope * intensity;
        attackTwist = ATTACK_BODY_TWIST * envelope * intensity;
        attackLift = ATTACK_BODY_LIFT * Math.max(0, envelope) * intensity;
      }
    }

    let shieldDrop = 0;
    let shieldShakeX = 0;
    let shieldShakeZ = 0;
    if (this.isShielding && this.flinchTimer <= 0) {
      this.shieldPhase += deltaTime * SHIELD_SHAKE_SPEED;
      shieldDrop = SHIELD_CROUCH;
      scaleY *= 1 - SHIELD_SQUASH;
      scaleX *= 1 + SHIELD_SQUASH * 0.55;
      shieldShakeX = Math.sin(this.shieldPhase) * SHIELD_SHAKE;
      shieldShakeZ = Math.sin(this.shieldPhase * 1.7) * SHIELD_SHAKE * 0.7;
      leanX += 0.08;
    } else if (!this.isShielding) {
      // keep shieldPhase for visual warp when regenerating; reset only if fully idle
    }

    // Idle bob / sway when standing still
    let idleBob = 0;
    let idleSway = 0;
    if (
      this.fighterState === FIGHTER_STATE.ACTIONABLE
      && this.isGrounded
      && !this.isAttacking
      && !this.isChargingHeavy
      && !this.isShielding
      && !this.isDodging
      && this.flinchTimer <= 0
      && speedX < 0.35
    ) {
      this.idlePhase += deltaTime * IDLE_BOB_SPEED;
      idleBob = Math.sin(this.idlePhase) * IDLE_BOB_AMOUNT;
      idleSway = Math.sin(this.idlePhase * 0.65) * IDLE_SWAY;
    }

    // Dodge stretch
    let dodgeLean = 0;
    if (this.isDodging) {
      dodgeLean = this.dodgeDir * 0.25;
      scaleX *= 1.15;
      scaleY *= 0.85;
    }

    // Shield break spin-out
    if (this.shieldBroken && this.fighterState === FIGHTER_STATE.SHIELD_BREAK) {
      leanX += Math.sin(this.shieldBreakTimer * 18) * 0.35;
      scaleY *= 0.9;
    }

    let chargeLean = 0;
    let chargeShake = 0;
    if (this.isChargingHeavy) {
      const p = Math.min(1, this.heavyChargeTimer / HEAVY_CHARGE_TIME);
      chargeLean = -0.18 - p * 0.12;
      chargeShake = Math.sin(this.heavyChargeTimer * 40) * (0.02 + p * 0.04);
      scaleX *= 1 + p * 0.08;
      scaleY *= 1 - p * 0.06;
      leanX += chargeLean;
    }

    let groundPoundLean = 0;
    let groundPoundSquash = 0;
    if (this.isGroundPounding && this.groundPoundPhase === 'windup') {
      groundPoundLean = -0.3;
      scaleX *= 1.08;
      scaleY *= 0.92;
    } else if (this.isGroundPounding && this.groundPoundPhase === 'recover') {
      const p = Math.max(0, Math.min(1, this.groundPoundTimer / SPECIALS.GROUND_POUND.recoverDuration));
      const shake = Math.sin(this.groundPoundTimer * 36) * 0.04;
      groundPoundLean = 0.05 + shake;
      scaleY *= 1 - 0.08 * p;
    }

    // Double jump: full somersault in the fight plane
    let flipZ = 0;
    if (this.doubleJumpFlipTimer > 0) {
      const t = 1 - this.doubleJumpFlipTimer / DOUBLE_JUMP_FLIP_DURATION;
      // Barrel roll: oscillate around Z; peak ~60°, ~1.5 back-and-forth cycles
      flipZ = this.doubleJumpFlipDir * Math.sin(t * Math.PI * 3) * 1.05;
      const squeeze = 0.05 * Math.abs(Math.sin(t * Math.PI * 3));
      scaleX *= 1 + squeeze;
      scaleY *= 1 - squeeze * 0.6;
    }

    // Hit-squash layer (from takeHit juice)
    if (this._hitSquashTimer > 0) {
      const ht = Math.max(0, this._hitSquashTimer / (this._hitSquashDuration || 0.2));
      scaleX *= 1 + 0.1 * ht;
      scaleY *= 1 - 0.12 * ht;
    }

    this.bodyMesh.rotation.z = swayZ + flinchTilt + attackSwing + shieldShakeZ + chargeShake + idleSway + dodgeLean + flipZ;
    this.bodyMesh.rotation.x = leanX + groundPoundLean;
    this.bodyMesh.rotation.y = attackTwist;
    this.bodyMesh.position.y = this._bodyBaseY + bobY + jerkY + attackLift - shieldDrop + idleBob - groundPoundSquash;
    this.bodyMesh.position.x = flinchNudge + shieldShakeX;
    this.bodyMesh.scale.set(scaleX, scaleY, 1);
  }

  handleAttacks(inputState) {
    if (!this.canAttack() || this.shieldStunTimer > 0) return;
    if (this.isShielding) return;

    // Single attack button: hold → heavy charge, release early → light
    if (inputState.attack || inputState.attackHeld) {
      this.beginHeavyCharge(!!inputState.jumpHeld);
    }
  }

  beginHeavyCharge(aimUp = false) {
    this.isChargingHeavy = true;
    this.heavyChargeTimer = 0;
    this.heavyChargeAimUp = aimUp;
    this.fighterState = FIGHTER_STATE.ACTIONABLE;
  }

  cancelHeavyCharge() {
    this.isChargingHeavy = false;
    this.heavyChargeTimer = 0;
    this.heavyChargeAimUp = false;
  }

  updateHeavyCharge(deltaTime, inputState) {
    if (this.isShielding || this.shieldStunTimer > 0) {
      this.cancelHeavyCharge();
      return;
    }

    this.heavyChargeAimUp = !!inputState.jumpHeld;
    this.heavyChargeTimer += deltaTime;

    // Slow crawl while charging
    this.handleMovement({
      ...inputState,
      left: inputState.left,
      right: inputState.right,
      jump: false
    });
    if (this.body) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x * 0.55, y: v.y, z: 0 }, true);
    }

    if (this.heavyChargeTimer >= HEAVY_CHARGE_TIME) {
      const aimUp = this.heavyChargeAimUp;
      this.cancelHeavyCharge();
      this.performAttack('heavy', aimUp);
      return;
    }

    // Release before full charge → light attack
    if (!inputState.attackHeld && !inputState.attack) {
      const aimUp = this.heavyChargeAimUp;
      this.cancelHeavyCharge();
      this.performAttack('light', aimUp);
    }
  }

  /** Su Timer reset — only when this fighter deals % damage to another. */
  noteOffense() {
    this.cowardIdleTimer = 0;
    this.cowardTickAcc = 0;
  }

  updateCowardDamage(deltaTime) {
    if (this.isDead || this.isInvincible) return;
    // Don't punish hitstun / shield break — only passive play
    if (
      this.fighterState === FIGHTER_STATE.HITSTUN ||
      this.fighterState === FIGHTER_STATE.SHIELD_BREAK
    ) {
      return;
    }

    this.cowardIdleTimer += deltaTime;
    if (this.cowardIdleTimer < COMBAT_FEEL.COWARD_GRACE) {
      this.cowardTickAcc = 0;
      return;
    }

    this.cowardTickAcc += deltaTime;
    while (this.cowardTickAcc >= COMBAT_FEEL.COWARD_TICK) {
      this.cowardTickAcc -= COMBAT_FEEL.COWARD_TICK;
      this.damage += COMBAT_FEEL.COWARD_DAMAGE;
      // Neutral tint — self-inflicted camp penalty, not a team hit
      if (this.damageColor == null) this.damageColor = 0xcccccc;
    }
  }

  performAttack(type, aimUp = false) {
    const base = this.moveSet[type];
    if (!base) return;

    this.cancelHeavyCharge();

    // aimUp true → upward hitbox/angle; false → forward ground kit
    const move = resolveMoveForStance(base, !aimUp);

    this.isAttacking = true;
    this.attackType = type;
    this.attackIsUp = aimUp;
    this.currentMove = move;
    this.attackElapsed = 0;
    this.hitTargets = new Set();
    this.fighterState = FIGHTER_STATE.ATTACK;
    this.attackCooldown = getMoveTotalDuration(move) + 0.02;
    this.hideAttackVisuals();
    audio.playSwing({ heavy: type === 'heavy' });

    const visual = this.attackVisuals[type];
    if (visual) this._randomizeSwooshCurve(visual, aimUp);
  }

  endAttack() {
    this.isAttacking = false;
    this.attackType = null;
    this.attackIsUp = false;
    this.currentMove = null;
    this.attackElapsed = 0;
    this.hitTargets = new Set();
    this.hideAttackVisuals();
    this.resetArmPose();
    if (this.fighterState === FIGHTER_STATE.ATTACK) {
      this.fighterState = FIGHTER_STATE.ACTIONABLE;
    }
  }

  resetArmPose() {
    if (!this.leftArm || !this.rightArm) return;
    const lr = this.leftArm.userData.rest;
    const rr = this.rightArm.userData.rest;
    this.leftArm.rotation.set(lr.x, lr.y, lr.z);
    this.rightArm.rotation.set(rr.x, rr.y, rr.z);
  }

  resetLegPose() {
    if (!this.leftLeg || !this.rightLeg) return;
    const lr = this.leftLeg.userData.rest;
    const rr = this.rightLeg.userData.rest;
    this.leftLeg.rotation.set(lr.x, lr.y, lr.z);
    this.rightLeg.rotation.set(rr.x, rr.y, rr.z);
  }

  updateWalkCycle(deltaTime) {
    if (!this.leftLeg || !this.rightLeg) return;

    if (this.isShielding) {
      this.walkPhase = 0;
      // Slight crouch bend while shielding
      this.leftLeg.rotation.set(0.2, 0, 0.12);
      this.rightLeg.rotation.set(0.2, 0, -0.12);
      return;
    }

    const speedX = this.body ? Math.abs(this.body.linvel().x) : 0;
    const walking = this.isGrounded && speedX > 0.4 && !this.isAttacking && this.fighterState !== FIGHTER_STATE.HITSTUN;

    if (!walking) {
      this.walkPhase = 0;
      this.resetLegPose();
      return;
    }

    const cadence = WALK_CYCLE_SPEED * (0.6 + Math.min(speedX, 12) / 12);
    this.walkPhase += deltaTime * cadence;

    const swing = Math.sin(this.walkPhase) * WALK_LEG_SWING;
    // +Z rotation swings limb forward (+X)
    this.leftLeg.rotation.set(0, 0, swing);
    this.rightLeg.rotation.set(0, 0, -swing);
  }

  updateArmSwing() {
    if (!this.leftArm || !this.rightArm) return;

    if (this.isChargingHeavy) {
      const p = Math.min(1, this.heavyChargeTimer / HEAVY_CHARGE_TIME);
      const lr = this.leftArm.userData.rest;
      const rr = this.rightArm.userData.rest;
      // Wind arms back while charging
      this.rightArm.rotation.set(rr.x - 0.2 * p, rr.y, rr.z - 0.55 * p);
      this.leftArm.rotation.set(lr.x + 0.1 * p, lr.y, lr.z + 0.25 * p);
      return;
    }

    if (this.isAttacking && this.currentMove) {
      const move = this.currentMove;
      const t = this.attackElapsed;
      const { startup, active, endlag } = move;
      const intensity = this.attackType === 'heavy' ? 1.05 : 0.85;
      const aimUp = this.attackIsUp;

      // Keep punches mostly forward; less overhead lift
      const punchAngle = Math.PI * (aimUp ? 0.42 : 0.48) * intensity;
      const windupAngle = -Math.PI * 0.22 * intensity;

      let swing = 0;
      if (t < startup) {
        const p = t / Math.max(startup, 0.001);
        if (p < 0.45) {
          swing = windupAngle * (p / 0.45);
        } else {
          const q = (p - 0.45) / 0.55;
          swing = windupAngle + (punchAngle - windupAngle) * q;
        }
      } else if (t < startup + active) {
        swing = punchAngle;
      } else {
        const p = (t - startup - active) / Math.max(endlag, 0.001);
        swing = punchAngle * (1 - Math.min(1, p));
      }

      const rr = this.rightArm.userData.rest;
      const lr = this.leftArm.userData.rest;
      if (aimUp) {
        // Mild upward tilt + forward punch (not full overhead)
        this.rightArm.rotation.set(rr.x - swing * 0.45, rr.y + swing * 0.1, swing * 0.85);
        this.leftArm.rotation.set(lr.x - swing * 0.1, lr.y - swing * 0.05, -swing * 0.12);
      } else {
        this.rightArm.rotation.set(rr.x + swing * 0.05, rr.y + swing * 0.12, swing);
        this.leftArm.rotation.set(lr.x - swing * 0.04, lr.y - swing * 0.06, -swing * 0.22);
      }
      return;
    }

    if (this.isShielding) {
      const lr = this.leftArm.userData.rest;
      const rr = this.rightArm.userData.rest;
      // Tuck arms in while crouching behind shield
      this.leftArm.rotation.set(lr.x + 0.35, lr.y, lr.z + 0.45);
      this.rightArm.rotation.set(rr.x + 0.35, rr.y, rr.z - 0.45);
      return;
    }

    const speedX = this.body ? Math.abs(this.body.linvel().x) : 0;
    const walking = this.isGrounded && speedX > 0.4;

    if (walking) {
      const armSwing = Math.sin(this.walkPhase) * WALK_ARM_SWING;
      const lr = this.leftArm.userData.rest;
      const rr = this.rightArm.userData.rest;
      // Opposite of legs
      this.leftArm.rotation.set(lr.x, lr.y, -armSwing);
      this.rightArm.rotation.set(rr.x, rr.y, armSwing);
      return;
    }

    this.resetArmPose();
  }

  isHitboxActive() {
    return this.isAttacking && this.currentMove && isMoveActive(this.currentMove, this.attackElapsed);
  }

  hasHit(defender) {
    return this.hitTargets.has(defender);
  }

  markHit(defender) {
    this.hitTargets.add(defender);
  }

  getActiveHitboxWorld() {
    if (!this.isHitboxActive() || !this.currentMove) return null;

    const hb = this.currentMove.hitbox;
    const facing = this.facing;
    const cx = this.position.x + hb.offsetX * facing;
    const cy = this.position.y + hb.offsetY;
    const cz = this.position.z;

    return {
      minX: cx - hb.width / 2,
      maxX: cx + hb.width / 2,
      minY: cy - hb.height / 2,
      maxY: cy + hb.height / 2,
      minZ: cz - hb.depth / 2,
      maxZ: cz + hb.depth / 2,
      centerX: cx,
      centerY: cy,
      centerZ: cz
    };
  }

  getHurtboxWorld() {
    const hx = this.position.x;
    const hy = this.position.y;
    const hz = this.position.z;
    return {
      minX: hx - this.hurtbox.width / 2,
      maxX: hx + this.hurtbox.width / 2,
      minY: hy - this.hurtbox.height / 2,
      maxY: hy + this.hurtbox.height / 2,
      minZ: hz - this.hurtbox.depth / 2,
      maxZ: hz + this.hurtbox.depth / 2
    };
  }

  updateAttackVisual(active) {
    this.hideAttackVisuals();
    if (!active || !this.attackType) return;

    const visual = this.attackVisuals[this.attackType];
    const move = this.currentMove;
    if (!visual || !move) return;

    const hb = move.hitbox;
    const facing = this.facing >= 0 ? 1 : -1;

    visual.visible = true;
    visual.position.set(this.position.x, this.position.y, this.position.z);

    if (this.attackIsUp) {
      // Over-top layout already uses world-up (+Y); only flip lateral for facing
      const reach = Math.max(hb.offsetY + hb.height * 0.5, 1.3);
      const scale = reach / 1.4;
      visual.scale.set(scale, scale, scale);
      visual.rotation.set(0, facing >= 0 ? 0 : Math.PI, 0);
    } else {
      const reach = Math.max(Math.hypot(hb.offsetX, hb.offsetY) + Math.max(hb.width, hb.height) * 0.35, 1.2);
      const scale = reach / 1.35;
      visual.scale.set(scale, scale, scale);
      visual.rotation.set(0, 0, facing >= 0 ? 0 : Math.PI);
    }
  }

  _updateAttackTrail(deltaTime) {
    if (this._hitSquashTimer > 0) {
      this._hitSquashTimer -= deltaTime;
    }
  }

  /** Brief squash when taking a solid hit (visual juice). */
  triggerHitSquash(intensity = 1) {
    this._hitSquashDuration = 0.18 + intensity * 0.08;
    this._hitSquashTimer = this._hitSquashDuration;
  }

  hideAttackVisuals() {
    if (this.attackVisuals.light) this.attackVisuals.light.visible = false;
    if (this.attackVisuals.heavy) this.attackVisuals.heavy.visible = false;
  }

  handleMovement(inputState) {
    const speed = MOVEMENT.WALK_SPEED * this.stats.speed;
    const airSpeed = MOVEMENT.AIR_MOBILITY * this.stats.speed;
    const linvel = this.body.linvel();

    if (inputState.left) {
      this.facing = -1;
      this.velocity.x = this.isGrounded ? -speed : -airSpeed;
    } else if (inputState.right) {
      this.facing = 1;
      this.velocity.x = this.isGrounded ? speed : airSpeed;
    } else {
      this.velocity.x = this.isGrounded ? linvel.x * 0.75 : linvel.x * 0.92;
    }

    this.body.setLinvel({ x: this.velocity.x, y: linvel.y, z: 0 }, true);
  }

  handleAttackMovement(inputState) {
    const linvel = this.body.linvel();
    let vx = linvel.x * (this.isGrounded ? 0.85 : 0.95);
    if (!this.isGrounded) {
      if (inputState.left) vx = Math.min(vx, -MOVEMENT.AIR_MOBILITY * 0.4 * this.stats.speed);
      if (inputState.right) vx = Math.max(vx, MOVEMENT.AIR_MOBILITY * 0.4 * this.stats.speed);
    }
    this.body.setLinvel({ x: vx, y: linvel.y, z: 0 }, true);
  }

  handleShieldMovement(inputState) {
    // Can shuffle while shielding, but facing stays locked (front-only shield).
    const linvel = this.body.linvel();
    const speed = MOVEMENT.WALK_SPEED * this.stats.speed * 0.35;
    let vx = 0;
    if (inputState.left) vx = -speed;
    else if (inputState.right) vx = speed;
    this.body.setLinvel({ x: vx, y: linvel.y, z: 0 }, true);
  }

  retargetYawForFacing() {
    const twoPi = Math.PI * 2;
    if (this.facing >= 0) {
      // Turn right: increase yaw until facing +X (0 mod 2π), through camera
      const phase = ((this.visualYaw % twoPi) + twoPi) % twoPi;
      const remaining = phase < 1e-4 ? 0 : twoPi - phase;
      this.targetYaw = this.visualYaw + remaining;
    } else {
      // Turn left: decrease yaw until facing -X (-π mod 2π), through camera
      const phase = (((this.visualYaw + Math.PI) % twoPi) + twoPi) % twoPi;
      const remaining = phase < 1e-4 ? 0 : phase;
      this.targetYaw = this.visualYaw - remaining;
    }
    this._lastFacing = this.facing;
  }

  applyFacing(deltaTime = 0) {
    // Victory pose owns targetYaw (camera-facing); don't retarget from combat facing
    if (!this.victoryPose && this._lastFacing !== this.facing) {
      this.retargetYawForFacing();
    }

    // Only advance the Y-turn when given a real frame dt.
    // Post-physics syncMeshPosition() may call with 0 — re-apply current yaw only
    // so mid-turn rotation is not snapped.
    if (deltaTime > 0) {
      const diff = this.targetYaw - this.visualYaw;
      if (Math.abs(diff) < 0.001) {
        this.visualYaw = this.targetYaw;
      } else {
        const rate = this.victoryPose ? TURN_RATE * 1.6 : TURN_RATE;
        const step = rate * deltaTime;
        if (Math.abs(diff) <= step) {
          this.visualYaw = this.targetYaw;
        } else {
          this.visualYaw += Math.sign(diff) * step;
        }
      }
    }

    this.mesh.rotation.y = this.visualYaw;
  }

  handleJumping(inputState) {
    // Arm aerial jump only after the button is released mid-air
    // (prevents hold-W from chaining ground jump → double jump + flip)
    if (!inputState.jumpHeld) {
      if (!this.isGrounded) this.airJumpArmed = true;
    }

    if (!inputState.jump) return;

    if (this.isGrounded) {
      this.body.setLinvel({ x: this.body.linvel().x, y: this.stats.jumpForce, z: 0 }, true);
      this.isGrounded = false;
      this.airJumpArmed = false;
      inputState.jump = false;
      this.doubleJumpFlipTimer = 0;
      this.triggerJumpJerk();
      audio.playJump({ doubleJump: false });
    } else if (this.canDoubleJump && this.airJumpArmed) {
      this.body.setLinvel({ x: this.body.linvel().x, y: MOVEMENT.DOUBLE_JUMP_FORCE, z: 0 }, true);
      this.canDoubleJump = false;
      this.airJumpArmed = false;
      inputState.jump = false;
      this.triggerJumpJerk();
      this.triggerDoubleJumpFlip();
      audio.playJump({ doubleJump: true });
    }
  }

  handleShielding(inputState) {
    if (this.shieldBroken || this.shieldHp <= 0) {
      this.isShielding = false;
      if (this.fighterState === FIGHTER_STATE.SHIELD) {
        this.fighterState = FIGHTER_STATE.ACTIONABLE;
      }
      return;
    }

    if (this.shieldStunTimer > 0) {
      this.isShielding = true;
      this.fighterState = FIGHTER_STATE.SHIELD;
      return;
    }

    const wantsShield = inputState.shield && this.isGrounded && !this.isAttacking && !this.isDodging;

    if (wantsShield) {
      this.isShielding = true;
      this.fighterState = FIGHTER_STATE.SHIELD;
    } else if (this.fighterState === FIGHTER_STATE.SHIELD) {
      this.isShielding = false;
      this.fighterState = FIGHTER_STATE.ACTIONABLE;
    } else {
      this.isShielding = false;
    }
  }

  applyDI(inputState) {
    const linvel = this.body.linvel();
    let di = 0;
    if (inputState.left) di = -1;
    if (inputState.right) di = 1;
    if (di === 0) return;

    const strength = COMBAT_FEEL.DI_STRENGTH;
    const max = COMBAT_FEEL.DI_MAX;
    const add = THREE.MathUtils.clamp(di * strength * Math.abs(linvel.x + 0.01), -max, max);
    this.body.setLinvel({
      x: linvel.x + add * 8,
      y: linvel.y,
      z: 0
    }, true);
  }

  /**
   * True when attack source is on the front hemisphere (same side as shield mesh).
   * Uses attacker/projectile world X vs body center + facing — not hitbox center.
   */
  isHitFromFront(sourcePosition) {
    if (!sourcePosition || sourcePosition.x == null) return false;
    const facing = this.facing >= 0 ? 1 : -1;
    const dx = sourcePosition.x - this.position.x;
    // Must be clearly in front of body center (matches front-only shield bubble)
    return dx * facing >= COMBAT_FEEL.SHIELD_FRONT_MIN;
  }

  takeHit(
    damage,
    knockbackVector,
    hitstun,
    hitlag,
    hitPosition = null,
    bypassShield = false,
    sourceColor = null,
    attackSource = null
  ) {
    if (this.isInvincible) return { blocked: false, ignored: true, knockbackScale: 0 };

    // Front-only shield: same half-space as the hemisphere visual (+facing X).
    // Prefer attacker/projectile body; fall back to impact point.
    const shieldSource =
      attackSource?.position != null
        ? attackSource.position
        : hitPosition;
    if (
      !bypassShield &&
      this.isShielding &&
      !this.shieldBroken &&
      this.isHitFromFront(shieldSource)
    ) {
      const shieldDmg = damage * COMBAT_FEEL.SHIELD_DAMAGE_MULT;
      this.shieldHp -= shieldDmg;
      this.shieldRegenDelay = COMBAT_FEEL.SHIELD_REGEN_DELAY;

      if (this.shieldHp <= 0) {
        this.breakShield();
        // Break still applies reduced knockback
        this.damage += damage * 0.35;
        if (sourceColor != null) this.damageColor = sourceColor;
        const knockbackMultiplier = 1 + this.damage / 40;
        const weightFactor = 1 / this.stats.weight;
        const scale = knockbackMultiplier * weightFactor * 0.55;
        const newVel = {
          x: knockbackVector.x * scale,
          y: Math.max(knockbackVector.y * scale, 5),
          z: 0
        };
        this.body.setLinvel(newVel, true);
        this.hitlagTimer = Math.min(hitlag, 0.06);
        return { blocked: false, ignored: false, shieldBreak: true, knockbackScale: scale };
      }

      const push = knockbackVector.clone().normalize().multiplyScalar(COMBAT_FEEL.SHIELD_PUSHBACK);
      push.y = Math.max(push.y, 1);
      const linvel = this.body.linvel();
      this.body.setLinvel({
        x: linvel.x + push.x,
        y: linvel.y + push.y * 0.3,
        z: 0
      }, true);
      this.shieldStunTimer = COMBAT_FEEL.SHIELD_STUN;
      this.fighterState = FIGHTER_STATE.SHIELD;
      this.isShielding = true;
      this.hitlagTimer = Math.min(hitlag, 0.05);
      return { blocked: true, ignored: false, knockbackScale: 0 };
    }

    this.damage += damage;
    if (sourceColor != null) this.damageColor = sourceColor;
    this.cancelHeavyCharge();
    this.endAttack();
    this.isShielding = false;
    if (this.isDodging) this.endDodge();
    if (this.isRolling) this.endTakoyakiRoll();
    if (this.isCountering) this.endCounter();
    if (this.isGroundPounding) this.endGroundPound();
    if (this.isGrabbing) this.endOnigiriGrab();
    if (this.isLassoing) this.endNoodleLasso();
    // Stink cloud armor stays active through hits

    // Knockback grows with defender %, so high damage percent launches much farther.
    const knockbackMultiplier = 1 + this.damage / 40;
    const weightFactor = 1 / this.stats.weight;
    const scale = knockbackMultiplier * weightFactor;

    const newVel = {
      x: knockbackVector.x * scale,
      y: knockbackVector.y * scale,
      z: 0
    };

    this.body.setLinvel(newVel, true);
    this.isGrounded = false;
    this.fighterState = FIGHTER_STATE.HITSTUN;
    this.hitstunTimer = hitstun * (0.8 + Math.min(this.damage, 150) / 200);
    this.hitlagTimer = hitlag;
    this._hitlagVel = { x: newVel.x, y: newVel.y, z: 0 };
    this.triggerFlinch(knockbackVector);
    this.triggerHitSquash(Math.min(1.5, damage / 12));
    return { blocked: false, ignored: false, knockbackScale: scale };
  }

  applyHitlag(duration) {
    this.hitlagTimer = Math.max(this.hitlagTimer, duration);
    const v = this.body.linvel();
    this._hitlagVel = { x: v.x, y: v.y, z: 0 };
  }

  updateGrounded() {
    if (this.isDead) {
      this.isGrounded = false;
      if (this.footShadow) this.footShadow.visible = false;
      return;
    }

    if (!this.game.world || !this.body) {
      this.isGrounded = this.position.y < 2;
      return;
    }

    const halfHeight = this._halfHeight ?? (
      this.type === CHARACTER_TYPES.LIGHT
        ? UNIFORM_SIZE * 0.75
        : UNIFORM_SIZE / 2
    );

    const origin = {
      x: this.position.x,
      y: this.position.y,
      z: 0
    };
    const dir = { x: 0, y: -1, z: 0 };
    const ray = new RAPIER.Ray(origin, dir);
    const maxToi = halfHeight + COMBAT_FEEL.GROUND_RAY_LENGTH;
    const solid = true;

    const hit = this.game.world.castRay(
      ray,
      maxToi,
      solid,
      undefined,
      undefined,
      undefined,
      this.body
    );

    const wasGrounded = this.isGrounded;
    const fallingOrResting = this.body.linvel().y <= 2.0;
    this.isGrounded = !!hit && fallingOrResting;

    if (this.isGrounded) {
      this.canDoubleJump = true;
      this.airJumpArmed = false;
      this.doubleJumpFlipTimer = 0;
      // Landing dust when first touching ground from a fall
      if (!wasGrounded && this._landDustCooldown <= 0) {
        const impact = Math.abs(this.body.linvel().y);
        if (impact > 3) {
          this._landDustCooldown = 0.2;
          this.game?.particles?.spawnDust?.(
            new THREE.Vector3(this.position.x, this.position.y - (this._halfHeight ?? 0.5), 0)
          );
        }
      }
    }

    if (this.footShadow) {
      this.footShadow.visible = this.isGrounded && !this.isDead;
      if (this.isGrounded) {
        const s = 0.85 + Math.min(0.25, Math.abs(this.body.linvel().x) * 0.02);
        this.footShadow.scale.set(s, s, 1);
        this.footShadow.material.opacity = 0.28 + (this.isShielding ? 0.08 : 0);
      }
    }
  }

  syncMeshPosition(deltaTime = 0) {
    if (this.isDead || !this.body) return;

    const pos = this.body.translation();
    if (Math.abs(pos.z) > 0.001) {
      this.body.setTranslation({ x: pos.x, y: pos.y, z: 0 }, true);
      pos.z = 0;
    }
    this.position.set(pos.x, pos.y, 0);
    // Lift mesh so visual soles match physics feet (legs hang below body center).
    const footDepth = this._visualFootDepth ?? this._halfHeight;
    const meshLift = footDepth - this._halfHeight;
    this.mesh.position.set(pos.x, pos.y + meshLift, 0);

    if (this.isAttacking && this.attackType && this.currentMove) {
      const active = isMoveActive(this.currentMove, this.attackElapsed);
      this.updateAttackVisual(active);
    }

    this.applyFacing(deltaTime);
  }

  respawn(position) {
    this.damage = 0;
    this.damageColor = null;
    this.cowardIdleTimer = 0;
    this.cowardTickAcc = 0;
    this.stocks--;
    this.isDead = this.stocks <= 0;
    this.fighterState = this.isDead ? FIGHTER_STATE.DEAD : FIGHTER_STATE.ACTIONABLE;
    this.isInvincible = !this.isDead;
    this.invincibleTimer = this.isDead ? 0 : 2000;
    this.canDoubleJump = true;
    this.airJumpArmed = false;
    this.hitstunTimer = 0;
    this.hitlagTimer = 0;
    this.shieldStunTimer = 0;
    this.specialCooldown = 0;
    this.shieldHp = COMBAT_FEEL.SHIELD_MAX_HP;
    this.shieldRegenDelay = 0;
    this.shieldBroken = false;
    this.shieldBreakTimer = 0;
    this.isDodging = false;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.flinchTimer = 0;
    this.flinchDuration = 0;
    this.jumpJerkTimer = 0;
    this.jumpJerkDuration = 0;
    this.doubleJumpFlipTimer = 0;
    this.victoryPose = false;
    this.endCounter();
    if (this.isGroundPounding) this.endGroundPound();
    if (this.isRolling) this.endTakoyakiRoll();
    if (this.isGrabbing) this.endOnigiriGrab();
    if (this.isLassoing) this.endNoodleLasso();
    if (this.isStinkCloud) this.endStinkCloud();
    this.cancelHeavyCharge();
    this.endAttack();
    this.isShielding = false;
    if (this.bodyMesh) {
      this.bodyMesh.rotation.x = 0;
      this.bodyMesh.rotation.y = 0;
      this.bodyMesh.rotation.z = 0;
      this.bodyMesh.position.x = 0;
      this.bodyMesh.position.y = this._bodyBaseY;
      this.bodyMesh.scale.set(1, 1, 1);
    }
    this.blinkTimer = 0;
    this.blinkOpenTimer = BLINK_MIN_GAP + Math.random() * (BLINK_MAX_GAP - BLINK_MIN_GAP);
    if (this.faceGroup) this.faceGroup.scale.set(1, 1, 1);

    // Last stock: eliminate — hide model, do not respawn on stage
    if (this.isDead) {
      if (this.mesh) this.mesh.visible = false;
      if (this.footShadow) this.footShadow.visible = false;
      Object.values(this.attackVisuals).forEach((v) => {
        if (v) v.visible = false;
      });
      // Park body far off-stage so it can't collide or re-enter blast zones
      this.body.setTranslation({ x: 0, y: -200, z: 0 }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setEnabled?.(false);
      this.position.set(0, -200, 0);
      return;
    }

    if (this.mesh) this.mesh.visible = true;
    this.body.setEnabled?.(true);
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);

    // Face center of stage after respawn
    this.facing = position.x <= 0 ? 1 : -1;
    this.visualYaw = this.facing >= 0 ? 0 : -Math.PI;
    this.targetYaw = this.visualYaw;
    this._lastFacing = this.facing;
    if (this.mesh) this.applyFacing();
  }

  setMeshOpacity(opacity, transparent) {
    if (!this.meshMaterials) return;
    for (const mat of this.meshMaterials) {
      // Leave team marker alone — it owns its own cooldown flash
      if (mat === this.teamMarkerConeMat || mat === this.teamMarkerRingMat) continue;
      mat.transparent = transparent;
      mat.opacity = opacity;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    Object.values(this.attackVisuals).forEach(v => {
      if (v) this.scene.remove(v);
    });
    if (this.lassoMesh) {
      this.scene.remove(this.lassoMesh);
      this.lassoMesh = null;
    }
    if (this.stinkCloudMesh) {
      this.scene.remove(this.stinkCloudMesh);
      this.stinkCloudMesh = null;
      this.stinkSwirls = [];
    }
  }
}
