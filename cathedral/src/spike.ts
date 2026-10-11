import { buildRoad, primeColours } from '../../app/plane/road';
import type { PlaneFile } from '../../core/schema';
export function spike(plane: PlaneFile) {
  return buildRoad(plane, primeColours(plane));
}
