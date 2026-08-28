/**
 * interaction/jointDrag.js — Mouse-driven joint selection and drag for arm robots
 *
 * Raycast-pick a URDF joint's link mesh, then drag the mouse to rotate that
 * joint about its own axis. THREE is a global injected by the classic
 * <script> tag in index.html (see main.js).
 */

import { camera, renderer } from '../scene.js';

const HOVER_EMISSIVE = new THREE.Color(0x1c2b31);  // dim steel blue — hover

const raycaster  = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

let jointByObject   = new Map();  // Object3D (URDFJoint) -> joint name
let meshesByJoint    = new Map(); // joint name -> THREE.Mesh[] (that joint's own link meshes)
let originalEmissive = new Map(); // THREE.Mesh -> THREE.Color (cached, for restore)
let hoveredJoint      = null;

/** Stop descending as soon as a child URDFJoint is reached — same stopping
 *  condition as collision.js's walkOwnMeshes() (collision.js:99), replicated
 *  here since that helper isn't exported. */
function walkOwnMeshes(node, root, callback) {
  if (node !== root && node.isURDFJoint) return;
  if (node.isMesh) callback(node);
  for (const child of node.children) walkOwnMeshes(child, root, callback);
}

/**
 * (Re)register the draggable joints for a newly loaded robot. Pass null to
 * clear registration (e.g. when switching to a non-arm robot type).
 */
export function initJointDrag(robot) {
  if (hoveredJoint) clearHighlight(hoveredJoint);

  jointByObject.clear();
  meshesByJoint.clear();
  originalEmissive.clear();
  hoveredJoint = null;
  renderer.domElement.style.cursor = '';

  if (!robot) return;

  for (const [name, joint] of Object.entries(robot.joints)) {
    if (joint.jointType !== 'revolute' && joint.jointType !== 'continuous') continue;
    jointByObject.set(joint, name);

    const meshes = [];
    walkOwnMeshes(joint, joint, (mesh) => meshes.push(mesh));
    meshesByJoint.set(name, meshes);
    for (const mesh of meshes) {
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

function onPointerMove(event) {
  updatePointerNDC(event);

  const jointName = raycastJoint();
  if (jointName === hoveredJoint) return;
  if (hoveredJoint) clearHighlight(hoveredJoint);
  hoveredJoint = jointName;
  if (hoveredJoint) setHighlight(hoveredJoint, HOVER_EMISSIVE);
  renderer.domElement.style.cursor = hoveredJoint ? 'grab' : '';
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
