/**
 * interaction/jointDrag.js — Mouse-driven joint selection and drag for arm robots
 *
 * Raycast-pick a URDF joint's link mesh, then drag the mouse to rotate that
 * joint about its own axis. The drag direction is computed by projecting the
 * mouse onto a plane through the joint's world origin, normal to the joint's
 * world axis — this stays correct regardless of camera orientation, unlike a
 * plain screen-space delta (it only degrades when the axis points straight
 * at the camera — an accepted edge case, not handled specially).
 *
 * Only revolute/continuous joints are draggable.
 *
 * On every drag move, the resolved angle is applied two places:
 *   1. joint.setJointValue() — instant, bypasses the kinematics lerp.
 *   2. The matching armSlider_<id> DOM element (value + badge) — so
 *      armProfile.processInput() (input/profiles/5dof_arm.js) picks it up as
 *      the next frame's jointTarget, making 5dof_arm.js's updateJoints() lerp
 *      a no-op (current ≈ target). This is what prevents snap-back on release.
 *
 * THREE is a global injected by the classic <script> tag in index.html (see
 * main.js).
 */

import { camera, renderer, orbitControls } from '../scene.js';
import { isEstopActive } from '../input.js';
import { ARM_JOINTS } from '../input/profiles/5dof_arm.js';

const HOVER_EMISSIVE = new THREE.Color(0x1c2b31);  // dim steel blue — hover
const DRAG_EMISSIVE  = new THREE.Color(0x6fa6c4);  // brand steel-blue accent — active drag

const raycaster  = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

let jointByObject   = new Map();  // Object3D (URDFJoint) -> joint name
let meshesByJoint    = new Map(); // joint name -> THREE.Mesh[] (that joint's own link meshes)
let originalEmissive = new Map(); // THREE.Mesh -> THREE.Color (cached, for restore)
let idByJointName    = new Map(); // joint name -> ARM_JOINTS[i].id (slider DOM suffix)
let jointLimits      = new Map(); // joint name -> { min, max }

let currentRobot = null;
let hoveredJoint  = null;
let drag          = null; // { jointName, joint, axisWorld, originWorld, lastDir, angle }

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
 * clear registration (e.g. when switching to a non-arm robot type) — this
 * also cancels any in-progress drag and restores orbit control.
 */
export function initJointDrag(robot) {
  if (hoveredJoint) clearHighlight(hoveredJoint);
  if (drag) endDrag();

  currentRobot = robot;
  jointByObject.clear();
  meshesByJoint.clear();
  originalEmissive.clear();
  idByJointName.clear();
  jointLimits.clear();
  hoveredJoint = null;
  orbitControls.enabled = true;
  renderer.domElement.style.cursor = '';

  if (!robot) return;

  for (const j of ARM_JOINTS) {
    idByJointName.set(j.name, j.id);
    jointLimits.set(j.name, { min: j.min, max: j.max });
  }

  for (const [name, joint] of Object.entries(robot.joints)) {
    if (joint.jointType !== 'revolute' && joint.jointType !== 'continuous') continue;
    jointByObject.set(joint, name);

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

function raycastJoint() {
  raycaster.setFromCamera(pointerNDC, camera);
  const allMeshes = [];
  for (const meshes of meshesByJoint.values()) allMeshes.push(...meshes);
  const hits = raycaster.intersectObjects(allMeshes, false);
  if (!hits.length) return null;
  return findJointName(hits[0].object);
}

/** Signed angle (radians) from unit vector u to unit vector v, as measured
 *  looking along `axis` (right-hand rule). */
function signedAngleAround(u, v, axis) {
  const cross = new THREE.Vector3().crossVectors(u, v);
  const sin = cross.dot(axis);
  const cos = u.dot(v);
  return Math.atan2(sin, cos);
}

/** Raycast the current pointer onto a plane through `originWorld`, normal to
 *  `axisWorld`. Returns the intersection point, or null if the ray is
 *  parallel to the plane (camera looking straight down the axis). */
function planePointFromPointer(axisWorld, originWorld) {
  raycaster.setFromCamera(pointerNDC, camera);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisWorld, originWorld);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point) ? point : null;
}

function applyToSlider(jointName, angle) {
  const suffix = idByJointName.get(jointName);
  if (!suffix) return;
  const slider = document.getElementById('armSlider_' + suffix);
  const badge  = document.getElementById('armSliderValue_' + suffix);
  if (slider) slider.value = angle;
  if (badge)  badge.textContent = angle.toFixed(2);
}

function onPointerMove(event) {
  updatePointerNDC(event);

  if (drag) {
    const point = planePointFromPointer(drag.axisWorld, drag.originWorld);
    if (!point) return;
    const v = point.sub(drag.originWorld).normalize();
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
      // Pass every arm joint's real current angle, not just the dragged
      // one — CollisionResolver's forward kinematics defaults any joint
      // absent from these maps to 0 rad, which would silently pose the
      // rest of the arm at zero (not its actual configuration) and miss
      // collisions against links further down the chain.
      const current  = {};
      const proposed = {};
      for (const j of ARM_JOINTS) {
        const otherJoint = currentRobot.joints[j.name];
        const cur = otherJoint?.angle ?? 0;
        current[j.name]  = cur;
        proposed[j.name] = j.name === drag.jointName ? angle : cur;
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
  const jointName = raycastJoint();
  if (!jointName) return;

  const joint = currentRobot.joints[jointName];
  const axisLocal   = joint.axis ?? new THREE.Vector3(1, 0, 0);
  const axisWorld   = axisLocal.clone().transformDirection(joint.matrixWorld).normalize();
  const originWorld = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);

  const startPoint = planePointFromPointer(axisWorld, originWorld);
  if (!startPoint) return;

  drag = {
    jointName,
    joint,
    axisWorld,
    originWorld,
    lastDir: startPoint.sub(originWorld).normalize(),
    angle: joint.angle ?? 0,
  };

  orbitControls.enabled = false;
  setHighlight(jointName, DRAG_EMISSIVE);
  renderer.domElement.style.cursor = 'grabbing';
  event.preventDefault();
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
