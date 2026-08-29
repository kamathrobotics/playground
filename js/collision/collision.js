/**
 * collision/collision.js — Self-collision checking + resolution for URDF arms
 *
 * Browser port of so_arm_ros2's self_collision_checker.py / collision_resolution.py.
 * Same overall design (bounding-volume broad phase, sweep-determined checked pairs,
 * path-sampled resolution with per-joint then per-group clamping) adapted to run in
 * real time against Three.js/urdf-loader data instead of ROS + python-fcl:
 *
 *   - Narrow phase here is an oriented-bounding-box (OBB) SAT test per link, built
 *     from the already-loaded visual meshes (this app skips separate collision
 *     geometry — see main.js's `parseCollision = false` — since for these URDFs
 *     collision meshes mirror the visuals). This trades exact mesh-vs-mesh
 *     precision for something cheap enough to run every frame in a browser.
 *   - Forward kinematics is computed independently of the live scene graph (rather
 *     than mutating robot.joints and reading back matrixWorld), so a hypothetical
 *     joint configuration can be probed without visibly moving the rendered robot.
 *
 * THREE is a global injected by the classic <script> tag in index.html (see main.js).
 */

const ONE = new THREE.Vector3(1, 1, 1);

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * OBB-vs-OBB separating-axis test (Ericson, Real-Time Collision Detection) — but
 * instead of a plain boolean, returns the minimum per-axis overlap. A negative
 * value means a separating axis was found (boxes apart by |value| along that
 * axis, i.e. not colliding); a positive value approximates penetration depth.
 * Comparing this against a per-pair rest-pose baseline (see SelfCollisionChecker)
 * is what keeps a link's own motor housing — always slightly "overlapping" its
 * neighbor in this loose box proxy — from reading as a permanent false collision.
 */
function obbOverlapDepth(a, b) {
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const AbsR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const EPS = 1e-6;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      R[i][j] = a.axes[i].dot(b.axes[j]);
      AbsR[i][j] = Math.abs(R[i][j]) + EPS;
    }

  const t = b.center.clone().sub(a.center);
  const tA = [t.dot(a.axes[0]), t.dot(a.axes[1]), t.dot(a.axes[2])];
  const ea = [a.halfSize.x, a.halfSize.y, a.halfSize.z];
  const eb = [b.halfSize.x, b.halfSize.y, b.halfSize.z];

  let minOverlap = Infinity;

  // Axes L = A0, A1, A2
  for (let i = 0; i < 3; i++) {
    const ra = ea[i];
    const rb = eb[0] * AbsR[i][0] + eb[1] * AbsR[i][1] + eb[2] * AbsR[i][2];
    const overlap = ra + rb - Math.abs(tA[i]);
    if (overlap < 0) return overlap;
    if (overlap < minOverlap) minOverlap = overlap;
  }
  // Axes L = B0, B1, B2
  for (let j = 0; j < 3; j++) {
    const ra = ea[0] * AbsR[0][j] + ea[1] * AbsR[1][j] + ea[2] * AbsR[2][j];
    const rb = eb[j];
    const tBj = tA[0] * R[0][j] + tA[1] * R[1][j] + tA[2] * R[2][j];
    const overlap = ra + rb - Math.abs(tBj);
    if (overlap < 0) return overlap;
    if (overlap < minOverlap) minOverlap = overlap;
  }
  // 9 cross-product axes L = Ai x Bj
  for (let i = 0; i < 3; i++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3;
    for (let j = 0; j < 3; j++) {
      const j1 = (j + 1) % 3, j2 = (j + 2) % 3;
      const ra = ea[i1] * AbsR[i2][j] + ea[i2] * AbsR[i1][j];
      const rb = eb[j1] * AbsR[i][j2] + eb[j2] * AbsR[i][j1];
      const tCross = tA[i2] * R[i1][j] - tA[i1] * R[i2][j];
      const overlap = ra + rb - Math.abs(tCross);
      if (overlap < 0) return overlap;
      if (overlap < minOverlap) minOverlap = overlap;
    }
  }
  return minOverlap; // no separating axis found — approximate penetration depth
}

function findParentLink(node) {
  let n = node;
  while (n && !n.isURDFLink) n = n.parent;
  return n;
}

/**
 * Visit only the meshes that belong directly to this link — i.e. stop descending as
 * soon as a child URDFJoint is reached, since that marks the start of the next link
 * down the kinematic chain. A plain link.traverse() would otherwise pull every
 * downstream link's meshes into this one's bounds (joints/links nest as ordinary
 * Object3D children), making every link's box balloon to contain its whole subtree.
 */
function walkOwnMeshes(node, root, callback) {
  if (node !== root && node.isURDFJoint) return;
  if (node.isMesh) callback(node);
  for (const child of node.children) walkOwnMeshes(child, root, callback);
}

/** Local-frame axis-aligned bounds of a link, from its own (non-descendant) visual meshes. */
function computeLocalBounds(link) {
  const box = new THREE.Box3();
  const invLink = link.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  let found = false;
  walkOwnMeshes(link, link, (c) => {
    if (!c.geometry) return;
    found = true;
    const rel = invLink.clone().multiply(c.matrixWorld);
    const pos = c.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      box.expandByPoint(v);
    }
  });
  if (!found) return null;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const halfSize = size.multiplyScalar(0.5);
  return { center, halfSize, radius: halfSize.length() };
}

export class SelfCollisionChecker {

  /**
   * @param {object} robot  loaded URDFRobot (from urdf-loader), meshes already attached
   * @param {number} collisionMargin     broad-phase proximity gate (m)
   * @param {number} intersectionMargin  minimum approximate penetration beyond a pair's
   *   own rest-pose baseline to count as a real collision (m). Kept slightly above zero
   *   by default to absorb floating-point noise from the chained FK matrix multiplies —
   *   the OBB proxy has nowhere near the numerical stability of the mesh-based FCL
   *   penetration depth this design is ported from.
   */
  constructor(robot, { collisionMargin = 0.01, intersectionMargin = 0.0005 } = {}) {
    this._collisionMargin = collisionMargin;
    this._intersectionMargin = intersectionMargin;

    robot.updateMatrixWorld(true);

    this._linkBounds = new Map();
    for (const [name, link] of Object.entries(robot.links)) {
      const bounds = computeLocalBounds(link);
      if (bounds) this._linkBounds.set(name, bounds);
    }

    this._joints = new Map();
    this._childrenOf = new Map();
    for (const [name, joint] of Object.entries(robot.joints)) {
      const parentLink = findParentLink(joint.parent);
      const childLink = joint.children.find((c) => c.isURDFLink);
      if (!parentLink || !childLink) continue;
      const origPosition = (joint.origPosition ?? joint.position).clone();
      const origQuaternion = (joint.origQuaternion ?? joint.quaternion).clone();
      const info = {
        parent: parentLink.name,
        child: childLink.name,
        origPosition,
        origQuaternion,
        axis: (joint.axis ?? new THREE.Vector3(1, 0, 0)).clone(),
        type: joint.jointType,
        limit: joint.jointType === 'revolute' ? { lower: joint.limit.lower, upper: joint.limit.upper } : null,
      };
      this._joints.set(name, info);
      if (!this._childrenOf.has(info.parent)) this._childrenOf.set(info.parent, []);
      this._childrenOf.get(info.parent).push(name);
    }

    const allChildren = new Set([...this._joints.values()].map((j) => j.child));
    const allParents = new Set([...this._joints.values()].map((j) => j.parent));
    this._rootLink = [...allParents].find((p) => !allChildren.has(p)) ?? [...allParents][0];

    // frozenset(parent, child) -> joint name, for links with mesh geometry only.
    const adjacentJoint = new Map();
    for (const [jname, j] of this._joints) {
      if (this._linkBounds.has(j.parent) && this._linkBounds.has(j.child)) {
        adjacentJoint.set(pairKey(j.parent, j.child), jname);
      }
    }
    this._adjacentPairs = new Set(adjacentJoint.keys());

    const linkNames = [...this._linkBounds.keys()];
    const candidatePairs = [];
    for (let i = 0; i < linkNames.length; i++)
      for (let k = i + 1; k < linkNames.length; k++)
        candidatePairs.push([linkNames[i], linkNames[k]]);

    // Pairs already touching at rest are a valid touch, not a collision.
    const restPose = {};
    for (const [jname, j] of this._joints)
      restPose[jname] = j.limit ? Math.min(Math.max(0, j.limit.lower), j.limit.upper) : 0;

    // Adjacent (parent-child) links routinely overlap at rest in this OBB proxy —
    // their mounting hardware sits right at the joint, and an axis-aligned-in-local-
    // frame box is a loose fit around an elongated link. Calibrate each adjacent
    // pair's own rest-pose overlap once and treat that as its baseline "always
    // touching" depth, so only overlap deeper than the pair's own resting contact
    // counts as a real self-collision (mirrors Python's per-pair FCL contact depth,
    // which is naturally tight since it uses the real mesh instead of a box proxy).
    this._adjacentRestDepth = new Map();
    const adjacentPairList = [...adjacentJoint.keys()].map((key) => key.split('|'));
    for (const [key, depth] of this._rawDepths(restPose, adjacentPairList))
      this._adjacentRestDepth.set(key, Math.max(0, depth));

    const nonAdjacent = candidatePairs.filter(([a, b]) => !adjacentJoint.has(pairKey(a, b)));
    const alwaysTouchingAtRest = new Set(
      this._collide(restPose, nonAdjacent).map(([a, b]) => pairKey(a, b))
    );

    // Determine which pairs are worth checking at runtime: non-adjacent pairs that
    // aren't always touching, plus adjacent pairs whose joint's full sweep ever collides.
    // Matches so_arm_ros2's self_collision_checker.py: an adjacent pair is checked if
    // ANY sample across its joint's range collides — no upper-bound exclusion for pairs
    // that collide across most of the sweep. (An earlier version of this port added such
    // an exclusion, reasoning a mostly-colliding pair must be an intentional mechanism
    // like a gripper's jaw — but the coarse OBB proxy here can read as "mostly colliding"
    // for a real, narrow hazard too, e.g. elbow_flex's upper/lower arm links, silently
    // dropping it from checkedPairs and leaving that joint's real self-collision unchecked.)
    const SWEEP_SAMPLES = 40;
    this.checkedPairs = [];
    for (const [a, b] of candidatePairs) {
      const key = pairKey(a, b);
      const jname = adjacentJoint.get(key);
      if (jname === undefined) {
        if (!alwaysTouchingAtRest.has(key)) this.checkedPairs.push([a, b]);
        continue;
      }
      const j = this._joints.get(jname);
      if (j.type === 'fixed') continue; // rigid assembly — never a runtime self-collision
      if (!j.limit) { this.checkedPairs.push([a, b]); continue; }
      const { lower, upper } = j.limit;
      let anyColliding = false;
      for (let s = 0; s < SWEEP_SAMPLES; s++) {
        const angle = lower + (s / (SWEEP_SAMPLES - 1)) * (upper - lower);
        if (this._collide({ [jname]: angle }, [[a, b]]).length) { anyColliding = true; break; }
      }
      if (anyColliding) this.checkedPairs.push([a, b]);
    }

    // Joint path from root to each link, for joints_between().
    this._jointPathTo = new Map([[this._rootLink, []]]);
    const frontier = [this._rootLink];
    while (frontier.length) {
      const parent = frontier.pop();
      for (const jname of this._childrenOf.get(parent) ?? []) {
        const child = this._joints.get(jname).child;
        this._jointPathTo.set(child, [...this._jointPathTo.get(parent), jname]);
        frontier.push(child);
      }
    }

    this.jointsBetweenCache = new Map();
    for (const [a, b] of this.checkedPairs)
      this.jointsBetweenCache.set(pairKey(a, b), this.jointsBetween(a, b));
  }

  /** Joint names on the kinematic path between two links. */
  jointsBetween(linkA, linkB) {
    const pathA = this._jointPathTo.get(linkA) ?? [];
    const pathB = this._jointPathTo.get(linkB) ?? [];
    let i = 0;
    while (i < pathA.length && i < pathB.length && pathA[i] === pathB[i]) i++;
    return new Set([...pathA.slice(i), ...pathB.slice(i)]);
  }

  /** joint name -> angle (rad), defaulting unspecified joints to 0. Returns link -> Matrix4. */
  _forwardKinematics(jointValues) {
    const transforms = new Map([[this._rootLink, new THREE.Matrix4()]]);
    const frontier = [this._rootLink];
    while (frontier.length) {
      const parent = frontier.pop();
      const parentM = transforms.get(parent);
      for (const jname of this._childrenOf.get(parent) ?? []) {
        const j = this._joints.get(jname);
        let quat = j.origQuaternion;
        if (j.type === 'revolute' || j.type === 'continuous') {
          const angle = jointValues[jname] ?? 0;
          const axisAngle = new THREE.Quaternion().setFromAxisAngle(j.axis, angle);
          quat = j.origQuaternion.clone().multiply(axisAngle);
        }
        const localM = new THREE.Matrix4().compose(j.origPosition, quat, ONE);
        const childM = parentM.clone().multiply(localM);
        transforms.set(j.child, childM);
        frontier.push(j.child);
      }
    }
    return transforms;
  }

  /** pairKey -> approximate OBB penetration depth (see obbOverlapDepth) for the given pose. */
  _rawDepths(jointValues, pairs) {
    const transforms = this._forwardKinematics(jointValues);
    const links = new Set(pairs.flat());
    const worldBounds = new Map();
    for (const link of links) {
      const M = transforms.get(link);
      const bounds = this._linkBounds.get(link);
      if (!M || !bounds) continue;
      const center = bounds.center.clone().applyMatrix4(M);
      const axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      M.extractBasis(axes[0], axes[1], axes[2]);
      axes.forEach((a) => a.normalize());
      worldBounds.set(link, { center, axes, halfSize: bounds.halfSize, radius: bounds.radius });
    }

    const depths = new Map();
    for (const [a, b] of pairs) {
      const A = worldBounds.get(a), B = worldBounds.get(b);
      if (!A || !B) continue;
      const key = pairKey(a, b);
      // Cheap bounding-sphere reject before the OBB SAT test.
      if (A.center.distanceTo(B.center) > A.radius + B.radius + this._collisionMargin) {
        depths.set(key, -Infinity);
        continue;
      }
      depths.set(key, obbOverlapDepth(A, B));
    }
    return depths;
  }

  _collide(jointValues, pairs) {
    const depths = this._rawDepths(jointValues, pairs);
    const colliding = [];
    for (const [a, b] of pairs) {
      const key = pairKey(a, b);
      const depth = depths.get(key);
      if (depth === undefined) continue;
      // Adjacent (parent-child) links are calibrated against their own rest-pose
      // overlap; only overlap deeper than that baseline counts as a real collision.
      const baseline = this._adjacentPairs.has(key) ? (this._adjacentRestDepth.get(key) ?? 0) : 0;
      if (depth > baseline + this._intersectionMargin) colliding.push([a, b]);
    }
    return colliding;
  }

  /** Return the (link_a, link_b) pairs colliding; checks `pairs` or every tracked pair. */
  check(jointValues, pairs = null) {
    return this._collide(jointValues, pairs ?? this.checkedPairs);
  }
}

export class CollisionResolver {

  // rad — path-sample spacing/cap, and boundary-scan resolution/retry count.
  static PATH_CHECK_RESOLUTION = 0.02;
  static PATH_CHECK_MAX_SAMPLES = 14;
  static SCAN_STEPS = 8;
  static RESOLVE_ROUNDS = 4;

  constructor(checker, commandableJoints) {
    this._checker = checker;
    this._commandable = new Set(commandableJoints);
  }

  /** Colliding pairs at the first unsafe point along the straight-line path to jointValues. */
  _checkPath(jointValues, current, pairs) {
    let maxDelta = 0;
    for (const name in jointValues) {
      if (!(name in current)) continue;
      maxDelta = Math.max(maxDelta, Math.abs(jointValues[name] - current[name]));
    }
    let samples = Math.ceil(maxDelta / CollisionResolver.PATH_CHECK_RESOLUTION);
    samples = Math.max(1, Math.min(CollisionResolver.PATH_CHECK_MAX_SAMPLES, samples));
    for (let i = 1; i <= samples; i++) {
      const frac = i / samples;
      const sample = {};
      for (const name in jointValues) {
        if (!(name in current)) continue;
        sample[name] = current[name] + frac * (jointValues[name] - current[name]);
      }
      const colliding = this._checker.check(sample, pairs);
      if (colliding.length) return colliding;
    }
    return [];
  }

  /** Clamp each joint in `needed` to its own collision boundary, one joint at a time. */
  _scanToBoundary(jointValues, requested, needed, pairs, safeValues) {
    const trial = { ...jointValues };
    for (const name of [...needed].sort()) {
      const target = requested[name], safe = safeValues[name];
      let lastSafe = safe;
      for (let step = 1; step <= CollisionResolver.SCAN_STEPS; step++) {
        trial[name] = safe + (step / CollisionResolver.SCAN_STEPS) * (target - safe);
        if (this._checker.check(trial, pairs).length) { trial[name] = lastSafe; break; }
        lastSafe = trial[name];
      }
      jointValues[name] = trial[name];
    }
  }

  /** Fall back to a joint-group scan for collisions that need multiple joints to move together. */
  _scanToBoundaryGroup(jointValues, requested, needed, pairs, safeValues) {
    const trial = { ...jointValues };
    const lastSafe = { ...safeValues };
    for (let step = 1; step <= CollisionResolver.SCAN_STEPS; step++) {
      const frac = step / CollisionResolver.SCAN_STEPS;
      for (const name of needed) trial[name] = safeValues[name] + frac * (requested[name] - safeValues[name]);
      if (this._checker.check(trial, pairs).length) break;
      for (const name of needed) lastSafe[name] = trial[name];
    }
    for (const name of needed) jointValues[name] = lastSafe[name];
  }

  /**
   * Clamp jointValues in place until the motion from `current` is collision-free.
   * Tries a per-joint clamp first, escalating to a group clamp only where that alone
   * can't clear it. Returns false if unresolvable (jointValues left at last safe clamp).
   */
  resolve(jointValues, current) {
    const requested = { ...jointValues };
    // Only joints actually being driven this frame (target != current) may be moved to
    // resolve a collision. Without this, a collision between two links far apart in the
    // kinematic chain (whose jointsBetween() path spans several joints) would let the
    // resolver reach into sliders the user never touched and swing them to whatever
    // value happens to be collision-free — surprising behavior for direct slider control,
    // where a joint should only ever move because its own slider asked it to.
    const driven = new Set(Object.keys(requested).filter((n) => requested[n] !== current[n]));
    const touched = new Set();
    let lastColliding = [];
    for (let round = 0; round < CollisionResolver.RESOLVE_ROUNDS; round++) {
      const jointsBetween = this._checker.jointsBetweenCache;
      let checkPairs = null;
      if (touched.size) {
        checkPairs = [];
        for (const [key, set] of jointsBetween) {
          for (const t of touched) {
            if (set.has(t)) { checkPairs.push(key.split('|')); break; }
          }
        }
      }
      const colliding = this._checkPath(jointValues, current, checkPairs);
      lastColliding = colliding;
      if (!colliding.length) {
        if (touched.size) console.warn('Self-collision avoided by clamping', [...touched]);
        return true;
      }

      const needed = new Set();
      for (const [a, b] of colliding) {
        const set = jointsBetween.get(pairKey(a, b));
        if (set) for (const j of set) needed.add(j);
      }
      const uncommandable = [...needed].filter((n) => !this._commandable.has(n) || !driven.has(n));
      if (uncommandable.length) {
        // The caller applies jointValues regardless of this return value, so a driven
        // joint that's part of the collision must be frozen back to its last safe
        // (current) value here — otherwise it would keep creeping into the collision
        // a tiny step every frame while resolve() keeps rejecting it as unresolvable.
        for (const n of needed) if (driven.has(n)) jointValues[n] = current[n];
        console.warn('Self-collision', colliding, 'can only be resolved by moving', uncommandable, '- rejecting target.');
        return false;
      }

      const newlyTouched = [...needed].filter((n) => !touched.has(n));
      let resolved = false;
      if (newlyTouched.length) {
        this._scanToBoundary(jointValues, requested, newlyTouched, colliding, current);
        for (const n of newlyTouched) touched.add(n);
        resolved = this._checkPath(jointValues, current, colliding).length === 0;
      }
      if (!resolved) {
        this._scanToBoundaryGroup(jointValues, requested, needed, colliding, current);
        for (const n of needed) touched.add(n);
      }
    }
    console.warn('Could not resolve self-collision', lastColliding, '- rejecting target.');
    return false;
  }
}
