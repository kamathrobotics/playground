/**
 * interaction/baseDrag.js — Click-drag base translation/rotation for wheeled robots
 *
 * Click-drag anywhere on a wheeled or mobile-arm robot's body (any mesh not
 * already claimed by jointDrag) to drive it like a virtual joystick: drag
 * distance in screen pixels, clamped to MAX_RADIUS_PX, maps linearly to
 * speed up to the active profile's linear-velocity slider max. Drag
 * direction is projected through the camera's current view onto the world
 * ground plane, so "drag right" moves the robot right on screen regardless
 * of which way it's currently facing. Holding SHIFT switches the same drag
 * to yaw: horizontal offset maps to angular velocity instead of translation.
 *
 * jointDrag.js gets first refusal on every pointerdown — it's registered
 * first and calls stopImmediatePropagation() when it claims a joint, so
 * this module's own pointerdown handler only ever runs for clicks that
 * land elsewhere on the robot (chassis, wheels, any non-joint-draggable
 * mesh).
 *
 * This module never drives the robot directly. getDragCommand() is polled
 * once per animation frame from main.js and combined additively with the
 * keyboard-derived command there, then clamped to the same velocity limits.
 *
 * THREE is a global injected by the classic <script> tag in index.html (see
 * main.js), same convention as jointDrag.js.
 */

import { camera, renderer, orbitControls } from '../scene.js';
import { isEstopActive } from '../input.js';
import { HOVER_EMISSIVE, DRAG_EMISSIVE, clearHoveredJoint, isJointDragging } from './jointDrag.js';

const MAX_RADIUS_PX = 120;

const raycaster  = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

let currentRobot     = null;
let robotMeshes       = [];  // every mesh on the robot — used for hit-testing only
let baseLinkMeshes    = [];  // only the base link's own meshes — used for highlighting
let originalEmissive  = new Map(); // THREE.Mesh -> THREE.Color (cached, for restore)
let dragEnabled       = false; // true only while the loaded robot is 'wheeled' / 'mobile-arm'
let hovering          = false;

let drag = null; // { anchorX, anchorY, dx, dy, shift }

function setHighlight(color) {
  for (const mesh of baseLinkMeshes) {
    if (mesh.material?.emissive) mesh.material.emissive.copy(color);
  }
}

function clearHighlight() {
  for (const mesh of baseLinkMeshes) {
    const orig = originalEmissive.get(mesh);
    if (orig && mesh.material?.emissive) mesh.material.emissive.copy(orig);
  }
}

/** Collect only the meshes that belong to the robot's own base link — stop
 *  descending as soon as ANY joint is reached, fixed or movable. Wheels
 *  (continuous joints) and payload/sensors (lidar, camera, IMU — attached
 *  via fixed joints) each live on their own child link, so this correctly
 *  excludes them from the highlight while jointDrag's own walkOwnMeshes
 *  (which stops only at revolute/continuous joints) still treats them as
 *  part of their parent's grabbable region for drag purposes. */
function collectBaseLinkMeshes(node, root, out) {
  if (node !== root && node.isURDFJoint) return;
  if (node.isMesh) out.push(node);
  for (const child of node.children) collectBaseLinkMeshes(child, root, out);
}

/**
 * (Re)register the active robot for base-drag. Pass null to clear
 * registration (e.g. while a robot is unloaded) — this also cancels any
 * in-progress drag and restores orbit control.
 */
export function initBaseDrag(robot, config) {
  if (drag) endDrag();
  hovering     = false;
  currentRobot = robot;
  dragEnabled  = !!robot && (config?.robotType === 'wheeled' || config?.robotType === 'mobile-arm');
  robotMeshes  = [];
  baseLinkMeshes = [];
  originalEmissive.clear();
  if (!robot) return;

  robot.traverse((c) => { if (c.isMesh) robotMeshes.push(c); });
  // The root URDFRobot node isn't always "base_link" itself — some URDFs
  // (e.g. KR003) root at "base_footprint" with "base_link" nested one fixed
  // joint below it. Look the link up by name so highlighting always targets
  // the actual base_link, not whatever link happens to be the tree root.
  const baseLink = robot.links?.base_link ?? robot;
  collectBaseLinkMeshes(baseLink, baseLink, baseLinkMeshes);
  for (const mesh of baseLinkMeshes) {
    if (mesh.material) mesh.material = mesh.material.clone();
    if (mesh.material?.emissive) originalEmissive.set(mesh, mesh.material.emissive.clone());
  }
}

function updatePointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function hitsRobot(event) {
  updatePointerNDC(event);
  raycaster.setFromCamera(pointerNDC, camera);
  return raycaster.intersectObjects(robotMeshes, false).length > 0;
}

/** Same raycast, but scoped to the base link's own meshes only — the set
 *  that setHighlight()/clearHighlight() actually affect. hitsRobot() is
 *  intentionally broad (wheels, sensors, anything on the robot can start a
 *  drag), but using that same broad check for the *hover highlight* meant
 *  moving the cursor onto a joint (still "on the robot") never counted as
 *  leaving the base, so the base stayed highlighted underneath whatever
 *  jointDrag.js was also highlighting. */
function hitsBaseLink(event) {
  updatePointerNDC(event);
  raycaster.setFromCamera(pointerNDC, camera);
  return raycaster.intersectObjects(baseLinkMeshes, false).length > 0;
}

/** Camera-relative ground-plane basis: right and forward, both unit-length
 *  and confined to the XY (ground) plane, so screen drag directions
 *  translate into world-frame motion regardless of the robot's own
 *  heading. Degenerate only if the camera looks straight down/up, which
 *  this app's fixed camera.up + orbit setup never reaches — guarded
 *  anyway rather than assumed. */
function groundBasis() {
  const right = new THREE.Vector3();
  const up    = new THREE.Vector3();
  const back  = new THREE.Vector3(); // camera's local +Z (points toward the viewer)
  camera.matrixWorld.extractBasis(right, up, back);

  right.z = 0;
  const forward = back.clone().negate();
  forward.z = 0;

  if (right.lengthSq() < 1e-8 || forward.lengthSq() < 1e-8) return null;
  return { right: right.normalize(), forward: forward.normalize() };
}

function onPointerDown(event) {
  if (isEstopActive() || !dragEnabled || !currentRobot) return;
  if (!hitsRobot(event)) return;

  drag = { anchorX: event.clientX, anchorY: event.clientY, dx: 0, dy: 0, shift: event.shiftKey };

  // Concurrent hover highlights (e.g. this base + some joint) are fine, but
  // once a drag actually starts, anything else's leftover hover highlight
  // must clear — see the matching call in jointDrag.js's onPointerDown.
  clearHoveredJoint();

  orbitControls.enabled = false;
  setHighlight(DRAG_EMISSIVE);
  renderer.domElement.style.cursor = 'grabbing';
  event.preventDefault();
  // Only reached when jointDrag didn't already claim this event (it calls
  // stopImmediatePropagation() itself when it starts a joint drag), but
  // claim it here too so nothing else on the same element double-handles it.
  event.stopImmediatePropagation();
}

function onPointerMove(event) {
  if (drag) {
    drag.dx    = event.clientX - drag.anchorX;
    drag.dy    = event.clientY - drag.anchorY;
    drag.shift = event.shiftKey;
    return;
  }

  if (!dragEnabled || !currentRobot) return;

  // A joint drag is in progress (jointDrag.js's own module-local `drag`,
  // queried here since this listener fires independently of that one) —
  // while dragging, only the thing actually being dragged may be
  // highlighted, no matter what the cursor passes over.
  if (isJointDragging()) {
    if (hovering) { hovering = false; clearHighlight(); }
    return;
  }

  const hit = hitsBaseLink(event);
  if (hit === hovering) return;
  hovering = hit;
  if (hovering) setHighlight(HOVER_EMISSIVE);
  else clearHighlight();
  renderer.domElement.style.cursor = hovering ? 'grab' : '';
}

/** Clear the base's hover highlight — called by jointDrag.js when a joint
 *  drag starts, so a leftover base hover highlight doesn't stay lit once
 *  the pointer's actually busy dragging a joint. */
export function clearBaseHover() {
  if (!hovering) return;
  hovering = false;
  clearHighlight();
}

/** Is a base drag currently in progress? Queried by jointDrag.js (via the
 *  hook injected through connectBaseDrag() in main.js) so it can suppress
 *  its own hover highlight while a base drag has the pointer. */
export function isBaseDragging() {
  return !!drag;
}

function endDrag() {
  if (!drag) return;
  drag = null;
  orbitControls.enabled = true;
  if (hovering) setHighlight(HOVER_EMISSIVE);
  else clearHighlight();
  renderer.domElement.style.cursor = hovering ? 'grab' : '';
}

/**
 * Poll the current drag state and return a robot-frame velocity
 * contribution — zero in every field when not dragging, e-stopped, or the
 * loaded robot doesn't support base-drag.
 *
 * @param {number} theta       robotPose.theta (radians) — the world-frame
 *                              drag vector is rotated into the robot frame
 *                              that the rest of the velocity pipeline
 *                              (keyboard commands, updateJoints, pose
 *                              integration) already works in.
 * @param {number} linearMax   active profile's linear-velocity slider max (m/s)
 * @param {number} angularMax  active profile's angular-velocity slider max (rad/s)
 */
export function getDragCommand(theta, linearMax, angularMax) {
  if (!drag || isEstopActive()) return { velX: 0, velY: 0, velAngular: 0 };

  if (drag.shift) {
    const frac = Math.max(-1, Math.min(1, drag.dx / MAX_RADIUS_PX));
    return { velX: 0, velY: 0, velAngular: -frac * angularMax };
  }

  const pixelDist = Math.hypot(drag.dx, drag.dy);
  if (pixelDist < 1e-6) return { velX: 0, velY: 0, velAngular: 0 };

  const basis = groundBasis();
  if (!basis) return { velX: 0, velY: 0, velAngular: 0 };

  const dirX = drag.dx / pixelDist;
  const dirY = -drag.dy / pixelDist; // screen "up" (negative clientY delta) = forward, away from camera
  const worldDirX = basis.right.x * dirX + basis.forward.x * dirY;
  const worldDirY = basis.right.y * dirX + basis.forward.y * dirY;

  const speedFrac = Math.min(pixelDist, MAX_RADIUS_PX) / MAX_RADIUS_PX;
  const worldVelX = worldDirX * speedFrac * linearMax;
  const worldVelY = worldDirY * speedFrac * linearMax;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    velX:        cosT * worldVelX + sinT * worldVelY,
    velY:       -sinT * worldVelX + cosT * worldVelY,
    velAngular:  0,
  };
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointerleave', endDrag);
