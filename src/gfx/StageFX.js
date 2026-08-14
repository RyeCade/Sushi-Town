import * as THREE from 'three';

/**
 * Animated water material (vertex wave + scrolling highlight).
 */
export function createWaterMaterial(opts = {}) {
  const {
    color = 0x1c4868,
    opacity = 0.78,
    speed = 1.0
  } = opts;

  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uSpeed: { value: speed },
    uDeep: { value: new THREE.Color(0x0a2038) }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uSpeed;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x * 1.8 + uTime * 1.6 * uSpeed) * 0.04
                + cos(p.z * 2.2 + uTime * 1.2 * uSpeed) * 0.03;
        p.y += w;
        vWave = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform vec3 uDeep;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float sparkle = sin(vUv.x * 40.0 + uTime * 3.0) * sin(vUv.y * 36.0 - uTime * 2.2);
        sparkle = smoothstep(0.7, 1.0, sparkle) * 0.35;
        float fres = 0.15 + vWave * 4.0;
        vec3 col = mix(uDeep, uColor, 0.55 + fres);
        col += vec3(0.45, 0.7, 0.85) * sparkle;
        gl_FragColor = vec4(col, uOpacity);
      }
    `
  });

  material.userData.isWater = true;
  material.userData.uniforms = uniforms;
  return material;
}

/** Soft volumetric god-ray cones — disabled (looked like spikes at screen top). */
export function createGodRays() {
  return [];
}

/** Floating food props drifting slowly in the backdrop. */
export function createFloatingProps(parent, {
  count = 8,
  z = -8,
  colors = [0xffcc66, 0xff8866, 0x88dd88, 0xf0e8dc]
} = {}) {
  const props = [];
  for (let i = 0; i < count; i++) {
    const kind = i % 3;
    let mesh;
    const color = colors[i % colors.length];
    const mat = new THREE.MeshToonMaterial({
      color,
      transparent: true,
      opacity: 0.55
    });

    if (kind === 0) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat);
      mesh.scale.set(1.2, 0.7, 1);
    } else if (kind === 1) {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 10), mat);
      mesh.rotation.z = Math.PI / 2;
    } else {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 12), mat);
    }

    mesh.position.set(
      -12 + Math.random() * 24,
      2 + Math.random() * 8,
      z + Math.random() * 3
    );
    mesh.castShadow = false;
    parent.add(mesh);
    props.push({
      mesh,
      baseY: mesh.position.y,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.5,
      amp: 0.15 + Math.random() * 0.25,
      spin: (Math.random() - 0.5) * 0.6
    });
  }
  return props;
}

/** Update stage FX lists each frame. */
export function updateStageFX(stage, deltaTime, time) {
  if (stage._waterMaterials) {
    for (const m of stage._waterMaterials) {
      if (m.userData?.uniforms?.uTime) {
        m.userData.uniforms.uTime.value = time;
      }
    }
  }
  if (stage._godRays) {
    for (const r of stage._godRays) {
      r.mat.opacity = r.baseOpacity * (0.75 + 0.25 * Math.sin(time * r.speed + r.phase));
    }
  }
  if (stage._floatingProps) {
    for (const p of stage._floatingProps) {
      p.mesh.position.y = p.baseY + Math.sin(time * p.speed + p.phase) * p.amp;
      p.mesh.rotation.y += p.spin * deltaTime;
      p.mesh.rotation.z += p.spin * 0.4 * deltaTime;
    }
  }
}
