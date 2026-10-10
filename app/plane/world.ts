import type * as THREE from 'three';
import type { PlaneFile } from '../../core/schema';
import { groundMesh } from './ground';
import { buildOverlook, type Overlook } from './overlook';
import { buildPlaza, type Plaza } from './plaza';
import { buildRoad, type Road } from './road';

/** Everything the plane draws, built once from the descriptors. */
export function buildGround(plane: PlaneFile): THREE.Mesh {
  return groundMesh(plane.ground);
}

export function buildWorld(plane: PlaneFile, colours: Map<number, THREE.Color>): { road: Road; plaza: Plaza; overlook: Overlook } {
  return { road: buildRoad(plane, colours), plaza: buildPlaza(plane, colours), overlook: buildOverlook(plane) };
}
