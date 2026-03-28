/**
 * kinematics/arm.js — Direct joint position control for robotic arms
 *
 * No IK. Each joint lerps toward its slider-set target at a configurable
 * speed (rad/s). Returns current joint angles for telemetry.
 *
 * Used by: SO-ARM100
 */

const JOINT_NAMES = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow_flex',
  'wrist_flex',
  'wrist_roll',
  'gripper',
];

/**
 * @param {object} robot     URDFRobot instance
 * @param {object} commands  from arm input profile:
 *   @param {object} commands.jointTargets  joint name → target angle (rad)
 *   @param {number} commands.speed         max joint velocity (rad/s); 0 = freeze
 * @param {number} dt        time step (s)
 * @param {object} _params   unused (kept for API consistency with wheeled modules)
 * @returns {object}  current joint angles { shoulder_pan, shoulder_lift, ... }
 */
export function updateJoints(robot, commands, dt, _params) {
  if (!robot?.joints) return {};

  const { jointTargets, speed } = commands;
  const maxDelta = (speed ?? 0) * dt;
  const result   = {};

  for (const name of JOINT_NAMES) {
    const joint = robot.joints[name];
    if (!joint) continue;

    const current = joint.angle ?? 0;
    const target  = jointTargets?.[name] ?? current;
    const delta   = target - current;
    const move    = Math.max(-maxDelta, Math.min(maxDelta, delta));

    joint.setJointValue(current + move);
    // Read back the applied angle; fall back to predicted value if the loader does not expose it
    result[name] = joint.angle ?? (current + move);
  }

  return result;
}
