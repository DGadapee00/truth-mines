import { createSystem } from '@iwsdk/core';
import type { CathedralApp } from './app';

/** Runs the app once a frame, inside IWSDK's loop (after input and locomotion have updated). */
export class DriverSystem extends createSystem({}) {
  update(delta: number): void {
    (this.globals.cathedral as CathedralApp | undefined)?.update(Math.min(delta, 0.1));
  }
}
