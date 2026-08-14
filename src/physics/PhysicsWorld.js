import * as THREE from 'three';
import { RAPIER } from '@dimforge/rapier3d';

let world;
let bodies = [];
let eventQueue;

export async function initPhysics() {
  RAPIER.init().then(() => {
    world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    eventQueue = new RAPIER.EventQueue(true);
  });
}

export function createGround(x = 0, y = 0, z = 0, width = 20, height = 1, depth = 5) {
  const bodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(x, y, z);
  const body = world.createRigidBody(bodyDesc);
  
  const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
    .setFriction(0.5)
    .setRestitution(0.1);
  world.createCollider(colliderDesc, body);
  
  return body;
}

export function createDynamicBody(x, y, z, width, height, depth, mass = 1) {
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinearDamping(0.5)
    .setAngularDamping(0.5);
  const body = world.createRigidBody(bodyDesc);
  
  const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
    .setFriction(0.5)
    .setRestitution(0.1)
    .setMass(mass);
  world.createCollider(colliderDesc, body);
  
  bodies.push(body);
  return body;
}

export function createSphereBody(x, y, z, radius, mass = 1) {
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinearDamping(0.5)
    .setAngularDamping(0.5);
  const body = world.createRigidBody(bodyDesc);
  
  const colliderDesc = RAPIER.ColliderDesc.ball(radius)
    .setFriction(0.5)
    .setRestitution(0.1)
    .setMass(mass);
  world.createCollider(colliderDesc, body);
  
  bodies.push(body);
  return body;
}

export function applyImpulse(body, x, y, z) {
  body.applyImpulse({ x, y, z }, true);
}

export function setLinearVelocity(body, x, y, z) {
  body.setLinvel({ x, y, z }, true);
}

export function getTranslation(body) {
  return body.translation();
}

export function step() {
  if (world) {
    world.step(eventQueue);
  }
}

export function removeBody(body) {
  const index = bodies.indexOf(body);
  if (index > -1) {
    bodies.splice(index, 1);
  }
  world.removeRigidBody(body);
}

export { world, bodies, eventQueue };