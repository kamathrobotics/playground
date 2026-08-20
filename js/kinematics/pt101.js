/**
 * kinematics/pt101.js — Direct joint position control for pan-tilt mechanisms
 *
 * No IK. Each joint lerps toward its slider-set target at a configurable
 * speed (rad/s). Returns current joint angles for telemetry.
 *
 * Used by: PT101
 */

const JOINT_NAMES = [
  'pan_joint',
  'tilt_joint',
];

/**
 * @param {object} robot     URDFRobot instance
 * @param {object} commands  from pantilt input profile:
 *   @param {object} commands.jointTargets  joint name → target angle (rad)
 *   @param {number} commands.speed         max joint velocity (rad/s); 0 = freeze
 * @param {number} dt        time step (s)
 * @param {object} _params   unused (kept for API consistency)
 * @returns {object}  current joint angles { pan_joint, tilt_joint }
 */
export function updateJoints(robot, commands, dt, _params) {
  if (!robot?.joints) return {};

  const { jointTargets, speed } = commands;
  const maxDelta = (speed ?? 0) * dt;

  const current  = {};
  const proposed = {};
  for (const name of JOINT_NAMES) {
    const joint = robot.joints[name];
    if (!joint) continue;

    const cur    = joint.angle ?? 0;
    const target = jointTargets?.[name] ?? cur;
    const delta  = target - cur;

    current[name]  = cur;
    proposed[name] = cur + Math.max(-maxDelta, Math.min(maxDelta, delta));
  }

  // Clamp the proposed step so the pan-tilt links never intersect each other.
  const resolver = robot.userData?.collisionResolver;
  if (resolver) resolver.resolve(proposed, current);

  const result = {};
  for (const name of JOINT_NAMES) {
    const joint = robot.joints[name];
    if (!joint) continue;
    joint.setJointValue(proposed[name]);
    result[name] = joint.angle ?? proposed[name];
  }

  return result;
}
