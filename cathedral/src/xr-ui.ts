import { MathUtils, Vector3, type UIKit, type UIKitMLAsset, type World } from '@iwsdk/core';

/**
 * Trurl's words, the place and a hint, as a panel in the world for a headset (the DOM is not
 * visible there). A UIKitML panel (public/ui/trurl.uikitml). It stays where it is until the visitor
 * has turned well away from it or walked off, then glides back in front of them: never head-locked.
 */
export class XrPanel {
  private readonly place: UIKit.Text | null;
  private readonly caption: UIKit.Text | null;
  private readonly hint: UIKit.Text | null;
  private readonly shown = { place: '', caption: '', hint: '' };
  private readonly target = new Vector3();
  private readonly forward = new Vector3();
  private moving = false;

  private constructor(readonly panel: UIKitMLAsset) {
    this.place = panel.getElementById<UIKit.Text>('place') ?? null;
    this.caption = panel.getElementById<UIKit.Text>('caption') ?? null;
    this.hint = panel.getElementById<UIKit.Text>('hint') ?? null;
    panel.scale.setScalar(0.0028); // 380 cm-units wide becomes about a metre
    panel.visible = false;
  }

  static async create(world: World): Promise<XrPanel> {
    const panel = await world.assets.instantiate<UIKitMLAsset>('trurl-panel');
    world.createTransformEntity(panel);
    return new XrPanel(panel);
  }

  setText(t: { place: string; caption: string; hint: string }): void {
    if (this.shown.place !== t.place) this.place?.setProperties({ text: (this.shown.place = t.place) });
    if (this.shown.caption !== t.caption) this.caption?.setProperties({ text: (this.shown.caption = t.caption) });
    if (this.shown.hint !== t.hint) this.hint?.setProperties({ text: (this.shown.hint = t.hint) });
  }

  setVisible(on: boolean): void {
    this.panel.visible = on;
  }

  /** Keep the panel in front of the visitor without chasing their head. `yaw` is the way they face (descriptor yaw). */
  follow(dt: number, head: Vector3, yaw: number): void {
    const dx = this.panel.position.x - head.x;
    const dz = this.panel.position.z - head.z;
    const dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz);
    const off = Math.abs(Math.atan2(Math.sin(bearing - yaw), Math.cos(bearing - yaw)));
    if (dist > 2.6 || dist < 0.6 || off > 0.65) this.moving = true;
    if (this.moving) {
      this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.target.copy(head).addScaledVector(this.forward, 1.5);
      this.target.y = head.y - 0.1;
      const k = 1 - Math.exp(-dt * 3);
      this.panel.position.lerp(this.target, k);
      if (this.panel.position.distanceTo(this.target) < 0.03) this.moving = false;
    }
    // Panels face +Z: yaw toward the head with no extra half turn.
    this.panel.rotation.y = MathUtils.lerp(this.panel.rotation.y, Math.atan2(head.x - this.panel.position.x, head.z - this.panel.position.z), 0.2);
  }

  /** Place it in front of the visitor at once (a new scene) */
  snap(head: Vector3, yaw: number): void {
    this.moving = true;
    this.panel.position.copy(head);
    this.follow(10, head, yaw);
    this.panel.position.copy(this.target);
  }
}
