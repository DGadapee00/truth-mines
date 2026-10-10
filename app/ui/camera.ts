import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * The desktop camera: orbit, pan and zoom with the mouse or touch, plus travel to a node.
 *
 * Travel only ever starts from something the student did (a click, a search, a key), never on its
 * own (CLAUDE.md rule 6), and it eases in and out over under a second.
 */
export const HOME = { pos: new THREE.Vector3(0, 28, 118), target: new THREE.Vector3(0, -26, 0) };

export function createCameraRig(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 260;
  controls.screenSpacePanning = true;
  camera.position.copy(HOME.pos);
  controls.target.copy(HOME.target);
  controls.update();

  let trip: { t: number; fromP: THREE.Vector3; fromT: THREE.Vector3; toP: THREE.Vector3; toT: THREE.Vector3 } | null = null;
  controls.addEventListener('start', () => (trip = null));

  return {
    controls,
    /** Travel so `target` is in front of the camera, `distance` away, keeping the current heading. */
    travelTo(target: THREE.Vector3, distance = 22) {
      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
      dir.normalize();
      trip = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toT: target.clone(), toP: target.clone().addScaledVector(dir, distance) };
    },
    home() {
      trip = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toT: HOME.target.clone(), toP: HOME.pos.clone() };
    },
    get travelling() {
      return !!trip;
    },
    update(dt: number) {
      if (trip) {
        trip.t = Math.min(1, trip.t + dt / 0.8);
        const k = trip.t * trip.t * (3 - 2 * trip.t);
        camera.position.lerpVectors(trip.fromP, trip.toP, k);
        controls.target.lerpVectors(trip.fromT, trip.toT, k);
        if (trip.t >= 1) trip = null;
      }
      controls.update();
    },
  };
}
