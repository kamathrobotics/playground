/**
 * robots/kr003.js — KR003 robot configuration
 *
 * Drive type : 4-wheel mecanum
 * URDF source: github.com/adityakamath/kr0003_description
 */
import { updateJoints }   from '../kinematics/mecanum.js';
import { wheeledProfile } from '../input/profiles/wheeled.js';

export const config = {
  title:    'KR003 Playground',
  repoBase: 'https://raw.githubusercontent.com/adityakamath/kr0003_description/main/urdf/',
  urdfPath: 'robot.urdf',
  zOffset:  0.0,  // robot base sits flush on the ground plane

  // Robot geometry passed to mecanum kinematics at runtime
  kinematics: {
    lx:          0.0495,     // half-wheelbase   (centre → wheel, X axis, metres, from URDF)
    ly:          0.0854225,  // half-track-width (centre → wheel, Y axis, metres, from URDF)
    wheelRadius: 0.0385,     // metres (from URDF)
  },

  // TODO(portfolio): replace dummy description and confirm githubUrl before launch
  about: {
    description: 'KR003 is a compact four-wheel mecanum drive robot designed for indoor navigation research. Its holonomic drive allows full omnidirectional movement without turning, making it ideal for tight-space autonomy experiments.',
    githubUrl:   'https://github.com/adityakamath/kr0003_description',
  },

  /** Mesh paths are relative to the URDF's base URL — no package:// remapping needed. */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return this.repoBase + path;
  },
};

export { updateJoints };
export { wheeledProfile as inputProfile };
