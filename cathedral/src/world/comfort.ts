import { BackSide, CylinderGeometry, Mesh, MeshBasicMaterial, MathUtils, ShaderMaterial, SphereGeometry, type Object3D } from '@iwsdk/core';

/**
 * The comfort layer, attached to the camera: a vignette that closes in during a guided move
 * (stronger on the descent) and a fade to black for a cut. Nothing here moves the view.
 */
export class Comfort {
  private readonly vignette: Mesh;
  private readonly fadeMesh: Mesh;
  private vignetteTarget = 0;
  private fadeTarget = 0;
  private fadeValue = 0;

  constructor(camera: Object3D) {
    // The same shape as IWSDK's own slide vignette: a short open cone just in front of the eyes,
    // clear in the middle and dark toward the edge.
    this.vignette = new Mesh(
      new CylinderGeometry(0.3, 0.15, 0.3, 24, 1, true),
      new ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uAlpha; varying vec2 vUv; void main(){ gl_FragColor = vec4(0.0,0.0,0.0,uAlpha * vUv.y); }',
        uniforms: { uAlpha: { value: 0 } },
        depthTest: false,
        side: BackSide,
        transparent: true,
      }),
    );
    this.vignette.frustumCulled = false;
    this.vignette.renderOrder = 998;
    this.vignette.rotateX(Math.PI / 2);
    this.vignette.position.z = -0.15;
    this.vignette.visible = false;
    this.fadeMesh = new Mesh(new SphereGeometry(0.4, 12, 8), new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, opacity: 0, depthTest: false }));
    this.fadeMesh.frustumCulled = false;
    this.fadeMesh.renderOrder = 999;
    this.fadeMesh.visible = false;
    camera.add(this.vignette, this.fadeMesh);
  }

  /** 0..1 */
  setVignette(strength: number): void {
    this.vignetteTarget = MathUtils.clamp(strength, 0, 1);
  }

  /** 0 clear, 1 black. Eases toward the target over `seconds` as update() runs. */
  setFade(target: number): void {
    this.fadeTarget = MathUtils.clamp(target, 0, 1);
  }

  get fade(): number {
    return this.fadeValue;
  }

  update(dt: number, fadeSeconds: number): void {
    const u = (this.vignette.material as ShaderMaterial).uniforms.uAlpha as { value: number };
    u.value = MathUtils.lerp(u.value, this.vignetteTarget, Math.min(1, dt * 4));
    this.vignette.visible = u.value > 0.01;
    const step = dt / Math.max(0.05, fadeSeconds);
    this.fadeValue = this.fadeValue < this.fadeTarget ? Math.min(this.fadeTarget, this.fadeValue + step) : Math.max(this.fadeTarget, this.fadeValue - step);
    (this.fadeMesh.material as MeshBasicMaterial).opacity = this.fadeValue;
    this.fadeMesh.visible = this.fadeValue > 0.005;
  }
}
