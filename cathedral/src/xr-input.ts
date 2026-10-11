import { InputComponent, Quaternion, Vector3, type World } from '@iwsdk/core';

export interface XrFrame {
  /** A trigger went down this frame (select) */
  trigger: boolean;
  /** The talk button (A or X) went down / came up this frame */
  talkDown: boolean;
  talkUp: boolean;
  /** B or Y went down: step back */
  back: boolean;
  /** The ray of the controller that is pointing: where it is and which way */
  ray: { origin: Vector3; dir: Vector3 } | null;
}

/**
 * The headset's controllers, through IWSDK's input (world.input.xr): trigger acts on what the ray
 * points at, A or X (held) talks to Trurl, B or Y steps back. Teleport and the 30 degree snap turn
 * belong to IWSDK's locomotion and are not read here. The ray is a controller's own, for pointing.
 */
export class XrInput {
  private readonly frame: XrFrame = { trigger: false, talkDown: false, talkUp: false, back: false, ray: null };
  private readonly origin = new Vector3();
  private readonly dir = new Vector3();
  private readonly q = new Quaternion();
  private active: 'left' | 'right' = 'right';

  constructor(private readonly world: World) {}

  poll(): XrFrame {
    const f = this.frame;
    f.trigger = false;
    f.talkDown = false;
    f.talkUp = false;
    f.back = false;
    f.ray = null;
    const pads = this.world.input.xr.gamepads;
    for (const hand of ['right', 'left'] as const) {
      const pad = pads[hand];
      if (!pad) continue;
      if (pad.getButtonDown(InputComponent.Trigger)) {
        f.trigger = true;
        this.active = hand;
      }
      if (pad.getButtonDown(hand === 'right' ? InputComponent.A_Button : InputComponent.X_Button)) f.talkDown = true;
      if (pad.getButtonUp(hand === 'right' ? InputComponent.A_Button : InputComponent.X_Button)) f.talkUp = true;
      if (pad.getButtonDown(hand === 'right' ? InputComponent.B_Button : InputComponent.Y_Button)) f.back = true;
    }
    const space = this.world.player.raySpaces[this.active] ?? this.world.player.raySpaces.right;
    if (space) {
      space.getWorldPosition(this.origin);
      space.getWorldQuaternion(this.q);
      this.dir.set(0, 0, -1).applyQuaternion(this.q);
      f.ray = { origin: this.origin, dir: this.dir };
    }
    return f;
  }
}
