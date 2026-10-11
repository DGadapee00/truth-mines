import type { DoorState } from '../../../core/doors';

/** How a door shows itself in each state. Pure, so the mapping is tested without a renderer. */
export interface DoorLook {
  /** Emissive strength 0..1 */
  glow: number;
  opacity: number;
  /** sRGB hex of the door panel */
  colour: number;
  /** Whether a pedestal stands in front of it */
  pedestal: boolean;
  /** Whether its living preview plays */
  preview: boolean;
  /** Whether the visitor can go through it */
  enterable: boolean;
}

const LOOKS: Record<DoorState, DoorLook> = {
  frontier: { glow: 1, opacity: 0.95, colour: 0xffd27a, pedestal: true, preview: true, enterable: true },
  dim: { glow: 0.28, opacity: 0.6, colour: 0x6f86c9, pedestal: false, preview: false, enterable: false },
  sealed: { glow: 0.05, opacity: 0.28, colour: 0x3a3f55, pedestal: false, preview: false, enterable: false },
};

export const doorLook = (state: DoorState): DoorLook => LOOKS[state];
