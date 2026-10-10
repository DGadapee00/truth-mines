// The parts of troika-three-text this app uses. The package ships no types of its own.
declare module 'troika-three-text' {
  import type { Color, Material, Mesh } from 'three';

  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    anchorX: number | 'left' | 'center' | 'right';
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom';
    maxWidth: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    color: number | string | Color | null;
    fillOpacity: number;
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    outlineOpacity: number;
    depthOffset: number;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export class BatchedText extends Text {
    addText(text: Text): void;
    removeText(text: Text): void;
  }

  export function configureTextBuilder(config: { useWorker?: boolean; unicodeFontsURL?: string; defaultFontURL?: string }): void;
}
