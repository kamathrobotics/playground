/**
 * kinematics/lekiwi2.js — Combined kinematics for LeKiwi 2
 *
 * Drives the 3-wheel omni base (via omni3) and the 2-DOF pan-tilt
 * mechanism (via lepantilt) in a single updateJoints call.
 *
 * Used by: LeKiwi 2
 */

import { updateJoints as omni3Update }    from './omni3.js';
import { updateJoints as pantiltUpdate }  from './lepantilt.js';

/**
 * @param {object} robot     URDFRobot instance
 * @param {object} commands  from lekiwi2 input profile:
 *   @param {number} commands.velX        forward velocity (m/s)
 *   @param {number} commands.velY        lateral velocity (m/s)
 *   @param {number} commands.velAngular  yaw rate (rad/s)
 *   @param {object} commands.jointTargets  pan/tilt joint targets (rad)
 *   @param {number} commands.speed         max joint velocity (rad/s)
 * @param {number} dt      time step (s)
 * @param {object} params  robot geometry from config.kinematics (omni3 fields)
 * @returns {object}  current pan/tilt joint angles for telemetry
 */
export function updateJoints(robot, commands, dt, params) {
  omni3Update(robot, commands, dt, params);
  return pantiltUpdate(robot, commands, dt, params);
}
