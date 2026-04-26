/**
 * robots/registry.js — Central robot registry
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO ADD A NEW ROBOT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Create  js/robots/<name>.js  with a `config` export and an `updateJoints` export.
 *     - If it uses an existing drive type, import updateJoints from the matching
 *       file in js/kinematics/.
 *     - If it needs new kinematics, create js/kinematics/<type>.js first.
 *  2. Import the new module here and add it to ROBOTS.
 *  3. Add  <option value="<name>">Display Name</option>  to #robotSelect in index.html.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as lekiwi   from './lekiwi.js';
import * as lekiwi2  from './lekiwi2.js';
import * as kr003    from './kr003.js';
import * as akros    from './akros.js';
import * as so100    from './so100.js';
import * as lepantilt from './lepantilt.js';

/**
 * ROBOTS — map from dropdown option value → { config, updateJoints, inputProfile }
 *
 * Each entry must provide:
 *   config.robotType        string — robot category (e.g. 'wheeled', 'arm', 'drone')
 *   config.title          string   — shown in the panel header
 *   config.repoBase       string   — raw GitHub base URL
 *   config.urdfPath       string   — path to robot.urdf (relative to repoBase)
 *   config.zOffset        number   — metres to elevate robot above Z=0 plane
 *   config.kinematics     object   — robot geometry passed to updateJoints
 *   config.resolveMeshPath(path)   — translates a URDF mesh path to a fetchable URL
 *
 *   updateJoints(robot, commands, dt, params)   — drive-specific IK
 *   inputProfile                               — profile from js/input/profiles/
 */
export const ROBOTS = {
  lekiwi,
  lekiwi2,
  kr003,
  akros,
  so100,
  lepantilt,
};
