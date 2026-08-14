import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Soft vignette + warm color grade for food-fighter look. */
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.38 },
    warmth: { value: 0.06 },
    contrast: { value: 1.08 },
    saturation: { value: 1.12 },
    brightness: { value: 0.02 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float warmth;
    uniform float contrast;
    uniform float saturation;
    uniform float brightness;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;

      // Contrast + brightness
      c = (c - 0.5) * contrast + 0.5 + brightness;

      // Warmth (lift red/yellow, slight blue cut)
      c.r += warmth;
      c.g += warmth * 0.45;
      c.b -= warmth * 0.35;

      // Saturation
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(luma), c, saturation);

      // Vignette
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette * 2.2;
      c *= clamp(v, 0.55, 1.0);

      // Very light film grain
      float grain = fract(sin(dot(vUv * 800.0, vec2(12.9898, 78.233))) * 43758.5453);
      c += (grain - 0.5) * 0.008;

      gl_FragColor = vec4(c, tex.a);
    }
  `
};

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.45,  // strength
      0.55,  // radius
      0.72   // threshold — only bright hits/lanterns bloom
    );
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.gradePass);

    this.smaaPass = new SMAAPass(
      w * pixelRatio,
      h * pixelRatio
    );
    this.composer.addPass(this.smaaPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  setSize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    this.smaaPass.setSize(width * pixelRatio, height * pixelRatio);
  }

  /** Brief bloom punch on big hits / KO. */
  punchBloom(amount = 0.35) {
    this._bloomPunch = Math.max(this._bloomPunch ?? 0, amount);
  }

  update(deltaTime) {
    if (this._bloomPunch > 0) {
      this._bloomPunch = Math.max(0, this._bloomPunch - deltaTime * 1.8);
      this.bloomPass.strength = 0.45 + this._bloomPunch;
    } else {
      this.bloomPass.strength = 0.45;
    }
  }

  render() {
    if (this.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
