/**
 * interaction/jointDrag.js — Mouse-driven joint selection and drag for arm/pan-tilt joints
 *
 * Raycast-pick a URDF joint's link mesh, then drag the mouse to rotate that
 * joint about its own axis. Each frame, the mouse ray is intersected with a
 * 3D plane normal to the joint's world axis, anchored at the *clicked
 * point's own height along that axis* (not the joint's origin — see
 * radialDirection() for why), and the joint is rotated by exactly the angle
 * needed to carry the previous frame's plane point to this frame's plane
 * point, ignoring any component of that motion along the axis itself. The
 * literal grabbed point in 3D tracks the mouse.
 *
 * A joint is only draggable if it has a matching UI slider
 * (data-joint-name="<jointName>" in index.html), which scopes this to arm
 * and pan-tilt joints without hardcoding any robot or joint name here.
 * Wheel joints have no slider and aren't yet draggable — dragging a wheel
 * to drive the robot via its kinematics is a planned future feature (see
 * README's Roadmap / Known Limitations), not implemented yet.
 *
 * Only revolute/continuous joints are draggable. Nothing here assumes a
 * particular robot shape — draggable joints, their limits, and the set of
 * joints fed to the collision resolver are all derived from the loaded
 * robot's own URDF joints, not from any one robot's input profile.
 *
 * On every drag move, the resolved angle is applied two places:
 *   1. joint.setJointValue() — instant, bypasses the kinematics lerp.
 *   2. The DOM slider tagged data-joint-name="<jointName>" (value + badge)
 *      — so that profile's processInput() picks it up as the next frame's
 *      jointTarget, making its updateJoints() lerp a no-op (current ≈
 *      target). This is what prevents snap-back on release.
 *
 * THREE is a global injected by the classic <script> tag in index.html (see
 * main.js).
 */

import { camera, renderer, orbitControls } from '../scene.js';
import { isEstopActive } from '../input.js';

// Injected by main.js (see connectBaseDrag below) rather than imported
// directly from baseDrag.js — a static import in that direction would make
// this module and baseDrag.js circularly dependent, which reverses which of
// the two's `addEventListener('pointerdown', ...)` calls actually runs
// first (whichever module's evaluation completes first wins the race), and
// this module MUST register first: it has "first refusal" on every
// pointerdown, letting a click on a draggable joint claim the event via
// stopImmediatePropagation() before baseDrag.js ever sees it. Wiring this
// through main.js — which already imports both modules non-circularly —
// keeps that registration order intact.
let clearBaseHover  = () => {};
let isBaseDragging  = () => false;

/** Called once from main.js after both drag modules are loaded, so this
 *  module can clear/query baseDrag.js's state without importing it. */
export function connectBaseDrag(hooks) {
  clearBaseHover = hooks.clearBaseHover;
  isBaseDragging = hooks.isBaseDragging;
}

// Subtle steel-blue accents, shared with baseDrag.js for a consistent
// "this is interactive" (hover) / "this is being dragged" (drag) visual
// language across joints and the base.
export const HOVER_EMISSIVE = new THREE.Color(0x0c1417);
export const DRAG_EMISSIVE  = new THREE.Color(0x1d2f36);

const raycaster  = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

let jointByObject   = new Map();  // Object3D (URDFJoint) -> joint name
let meshesByJoint    = new Map(); // joint name -> THREE.Mesh[] (that joint's own link meshes)
let originalEmissive = new Map(); // THREE.Mesh -> THREE.Color (cached, for restore)
let jointLimits      = new Map(); // joint name -> { min, max } | null (no/non-finite URDF limit)

let currentRobot = null;
let hoveredJoint  = null;
let drag          = null; // { jointName, joint, axisWorld, originWorld, planeAnchor, lastDir, angle }

/** Stop descending as soon as a child REVOLUTE/CONTINUOUS joint is reached —
 *  fixed child joints (camera mounts, end-effector frames, etc.) are rigidly
 *  attached extensions of the current link, not independent DOFs, so their
 *  meshes stay part of the nearest draggable ancestor's grabbable region. */
function walkOwnMeshes(node, root, callback) {
  if (node !== root && node.isURDFJoint &&
      (node.jointType === 'revolute' || node.jointType === 'continuous')) return;
  if (node.isMesh) callback(node);
  for (const child of node.children) walkOwnMeshes(child, root, callback);
}

/**
 * (Re)register the draggable joints for a newly loaded robot. Pass null to
 * clear registration (e.g. while a robot is unloaded) — this also cancels
 * any in-progress drag and restores orbit control.
 */
export function initJointDrag(robot) {
  if (hoveredJoint) clearHighlight(hoveredJoint);
  if (drag) endDrag();

  currentRobot = robot;
  jointByObject.clear();
  meshesByJoint.clear();
  originalEmissive.clear();
  jointLimits.clear();
  hoveredJoint = null;
  orbitControls.enabled = true;
  renderer.domElement.style.cursor = '';

  if (!robot) return;

  for (const [name, joint] of Object.entries(robot.joints)) {
    if (joint.jointType !== 'revolute' && joint.jointType !== 'continuous') continue;
    // Only joints with a UI slider are draggable — this excludes wheel
    // joints (drive-by-drag is a planned future feature, not yet wired to
    // the wheeled kinematics modules) without hardcoding any joint name.
    if (!document.querySelector(`[data-joint-name="${name}"]`)) continue;
    jointByObject.set(joint, name);

    // Continuous joints have no meaningful limit; revolute joints without a
    // finite limit in the URDF are treated the same way.
    const limit = joint.limit;
    jointLimits.set(name,
      limit && Number.isFinite(limit.lower) && Number.isFinite(limit.upper)
        ? { min: limit.lower, max: limit.upper }
        : null);

    const meshes = [];
    walkOwnMeshes(joint, joint, (mesh) => meshes.push(mesh));
    meshesByJoint.set(name, meshes);
    for (const mesh of meshes) {
      if (mesh.material) {
        mesh.material = mesh.material.clone();
      }
      if (mesh.material?.emissive) originalEmissive.set(mesh, mesh.material.emissive.clone());
    }
  }
}

function findJointName(object) {
  let n = object;
  while (n) {
    const name = jointByObject.get(n);
    if (name) return name;
    n = n.parent;
  }
  return null;
}

function setHighlight(jointName, color) {
  const meshes = meshesByJoint.get(jointName);
  if (!meshes) return;
  for (const mesh of meshes) {
    if (mesh.material?.emissive) mesh.material.emissive.copy(color);
  }
}

function clearHighlight(jointName) {
  const meshes = meshesByJoint.get(jointName);
  if (!meshes) return;
  for (const mesh of meshes) {
    const orig = originalEmissive.get(mesh);
    if (orig && mesh.material?.emissive) mesh.material.emissive.copy(orig);
  }
}

function updatePointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

/** Raycast against all draggable meshes. Returns { jointName, point } for the
 *  closest hit, or null. `point` is the literal 3D point on the mesh surface
 *  where the ray hit — not derived from any plane/origin assumption. */
function raycastMesh() {
  raycaster.setFromCamera(pointerNDC, camera);
  const allMeshes = [];
  for (const meshes of meshesByJoint.values()) allMeshes.push(...meshes);
  const hits = raycaster.intersectObjects(allMeshes, false);
  if (!hits.length) return null;
  const jointName = findJointName(hits[0].object);
  if (!jointName) return null;
  return { jointName, point: hits[0].point };
}

function raycastJoint() {
  return raycastMesh()?.jointName ?? null;
}

/** Signed angle (radians) from unit vector u to unit vector v, as measured
 *  looking along `axis` (right-hand rule). */
function signedAngleAround(u, v, axis) {
  const cross = new THREE.Vector3().crossVectors(u, v);
  const sin = cross.dot(axis);
  const cos = u.dot(v);
  return Math.atan2(sin, cos);
}

/** Raycast the current pointer onto a plane through `planeAnchor`, normal to
 *  `axisWorld`. Returns the intersection point, or null if the ray is
 *  parallel to the plane (camera looking straight down the axis). */
function planePointFromPointer(axisWorld, planeAnchor) {
  raycaster.setFromCamera(pointerNDC, camera);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisWorld, planeAnchor);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point) ? point : null;
}

/** Direction from `originWorld` to `point`, around `axisWorld` only — the
 *  component of (point - originWorld) *along* the axis is discarded before
 *  normalizing. Without this, a joint whose clickable mesh sits far from its
 *  own rotation origin along the axis (common when a joint's origin isn't
 *  centered in its own link's geometry) forces the drag plane to sit far
 *  from the actual click point, so the ray has to be extrapolated a long
 *  way to reach it — and that extrapolation's direction is highly sensitive
 *  to which side of the mesh the camera is viewing from, flipping the felt
 *  drag direction between viewing angles. Stripping the axial component
 *  keeps the result a pure rotational direction regardless of where the
 *  origin sits relative to the mesh. */
function radialDirection(point, originWorld, axisWorld) {
  const rel = point.clone().sub(originWorld);
  const axial = axisWorld.clone().multiplyScalar(rel.dot(axisWorld));
  return rel.sub(axial).normalize();
}

function applyToSlider(jointName, angle) {
  const sliders = document.querySelectorAll(`[data-joint-name="${jointName}"]`);
  if (!sliders.length) return;
  for (const slider of sliders) {
    slider.value = angle;
    // Naming convention (index.html): "<prefix>Slider_<id>" -> "<prefix>SliderValue_<id>".
    const badge = document.getElementById(slider.id.replace('Slider_', 'SliderValue_'));
    if (badge) badge.textContent = angle.toFixed(2);
  }
}

function onPointerMove(event) {
  updatePointerNDC(event);

  if (drag) {
    const point = planePointFromPointer(drag.axisWorld, drag.planeAnchor);
    if (!point) return;
    const v = radialDirection(point, drag.originWorld, drag.axisWorld);
    // Accumulate a small per-frame delta from the previous frame's direction,
    // rather than a single delta from the drag-start direction — atan2 only
    // returns angles in (-pi, pi], so a delta measured from a fixed start
    // wraps (and jumps to the opposite sign) once the total sweep exceeds
    // pi radians. Consecutive mouse positions are always close together, so
    // their delta never approaches that wrap boundary.
    const delta = signedAngleAround(drag.lastDir, v, drag.axisWorld);
    drag.lastDir = v;
    drag.angle += delta;

    const limits = jointLimits.get(drag.jointName);
    // Clamp the persisted angle itself, not just the value applied this
    // frame — otherwise continuing to drag past a limit "winds up" past it,
    // and reversing direction wouldn't move the joint again until that
    // wind-up unwound.
    if (limits) drag.angle = Math.max(limits.min, Math.min(limits.max, drag.angle));
    let angle = drag.angle;

    const resolver = currentRobot?.userData?.collisionResolver;
    if (resolver) {
      // Pass every revolute/continuous joint's real current angle, not just
      // the dragged one — CollisionResolver's forward kinematics defaults
      // any joint absent from these maps to 0 rad, which would silently
      // pose the rest of the robot at zero (not its actual configuration)
      // and miss collisions against links further down the chain. Derived
      // from the robot's own joints so this works for any robot shape, not
      // just one hardcoded joint list.
      const current  = {};
      const proposed = {};
      for (const [name, otherJoint] of Object.entries(currentRobot.joints)) {
        if (otherJoint.jointType !== 'revolute' && otherJoint.jointType !== 'continuous') continue;
        const cur = otherJoint.angle ?? 0;
        current[name]  = cur;
        proposed[name] = name === drag.jointName ? angle : cur;
      }
      resolver.resolve(proposed, current);
      angle = proposed[drag.jointName];
      // Sync the persisted angle to what was actually applied — otherwise,
      // same wind-up problem as the URDF-limit clamp above: continuing to
      // drag into a collision would keep accumulating drag.angle past the
      // point the resolver allows, and reversing direction wouldn't move
      // the joint again until that unwound.
      drag.angle = angle;
    }

    drag.joint.setJointValue(angle);
    applyToSlider(drag.jointName, angle);
    return;
  }

  // Another module (baseDrag.js) has a drag in progress — while dragging,
  // only the thing actually being dragged may be highlighted, no matter
  // what the cursor passes over. This module's own drag is handled by the
  // early return above; this covers the other module's.
  if (isBaseDragging()) {
    if (hoveredJoint) clearHighlight(hoveredJoint);
    hoveredJoint = null;
    return;
  }

  const jointName = raycastJoint();
  if (jointName === hoveredJoint) return;
  if (hoveredJoint) clearHighlight(hoveredJoint);
  hoveredJoint = jointName;
  if (hoveredJoint) setHighlight(hoveredJoint, HOVER_EMISSIVE);
  renderer.domElement.style.cursor = hoveredJoint ? 'grab' : '';
}

function onPointerDown(event) {
  if (isEstopActive() || !currentRobot) return;
  updatePointerNDC(event);
  const hit = raycastMesh();
  if (!hit) return;
  const { jointName } = hit;

  const joint = currentRobot.joints[jointName];
  const axisLocal   = joint.axis ?? new THREE.Vector3(1, 0, 0);
  const axisWorld   = axisLocal.clone().transformDirection(joint.matrixWorld).normalize();
  const originWorld = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);

  // Anchor the drag plane at the clicked point's own height along the axis,
  // not at the joint's origin — see radialDirection() for why this matters.
  const clickAxial  = axisWorld.dot(hit.point.clone().sub(originWorld));
  const planeAnchor = originWorld.clone().addScaledVector(axisWorld, clickAxial);

  const startPoint = planePointFromPointer(axisWorld, planeAnchor);
  if (!startPoint) return;

  drag = {
    jointName,
    joint,
    axisWorld,
    originWorld,
    planeAnchor,
    lastDir: radialDirection(startPoint, originWorld, axisWorld),
    angle: joint.angle ?? 0,
  };

  // Concurrent hover highlights (e.g. base + this joint) are fine, but once
  // a drag actually starts, anything else's leftover hover highlight must
  // clear — otherwise it can stay lit indefinitely (nothing else will ever
  // fire a pointermove over it to notice the cursor left).
  clearBaseHover();

  orbitControls.enabled = false;
  setHighlight(jointName, DRAG_EMISSIVE);
  renderer.domElement.style.cursor = 'grabbing';
  event.preventDefault();
  // Claim this event so baseDrag.js (registered after this module, on the
  // same element) never sees it — a click on a draggable joint should only
  // ever start a joint drag, never a base drag.
  event.stopImmediatePropagation();
}

/** Clear whatever joint is currently hover-highlighted — called by
 *  baseDrag.js when a base drag starts, so a leftover joint hover highlight
 *  doesn't stay lit once the pointer's actually busy dragging the base. */
export function clearHoveredJoint() {
  if (!hoveredJoint) return;
  clearHighlight(hoveredJoint);
  hoveredJoint = null;
}

/** Is a joint drag currently in progress? Queried by baseDrag.js so it can
 *  suppress its own hover highlight while a joint drag has the pointer. */
export function isJointDragging() {
  return !!drag;
}

function endDrag() {
  if (!drag) return;
  const jointName = drag.jointName;
  drag = null;
  orbitControls.enabled = true;
  if (hoveredJoint === jointName) setHighlight(jointName, HOVER_EMISSIVE);
  else clearHighlight(jointName);
  renderer.domElement.style.cursor = hoveredJoint ? 'grab' : '';
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointerleave', endDrag);
