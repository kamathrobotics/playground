/**
 * robots/kr003.js — KR003 robot configuration
 *
 * Drive type : 4-wheel mecanum
 * URDF source: github.com/adityakamath/kr0003_description
 */
import { updateJoints }   from '../kinematics/mecanum.js';
import { wheeledProfile } from '../input/profiles/wheeled.js';

export const config = {
  robotType: 'wheeled',
  title:    'KR003 Dojo',
  repoBase: 'https://raw.githubusercontent.com/adityakamath/kr0003_description/main/urdf/',
  urdfPath: 'robot.urdf',
  zOffset:  0.0,  // robot base sits flush on the ground plane

  // Robot geometry passed to mecanum kinematics at runtime
  kinematics: {
    lx:          0.0495,     // half-wheelbase   (centre → wheel, X axis, metres, from URDF)
    ly:          0.0854225,  // half-track-width (centre → wheel, Y axis, metres, from URDF)
    wheelRadius: 0.0385,     // metres (from URDF)
  },

  telemetry: {
    icon: '⌖',
    colWidths: ['9ch', '9ch', '11ch'],
    rows: [
      [
        { id: 'x',     label: 'x', getValue: s => s.pose.x.toFixed(2) + ' m' },
        { id: 'y',     label: 'y', getValue: s => s.pose.y.toFixed(2) + ' m' },
        { id: 'theta', label: 'θ', getValue: s => (((s.pose.theta % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)).toFixed(2) + ' rad' },
      ],
      [
        { id: 'u',     label: 'u', getValue: s => s.vel.vx.toFixed(2)    + ' m/s' },
        { id: 'v',     label: 'v', getValue: s => s.vel.vy.toFixed(2)    + ' m/s' },
        { id: 'omega', label: 'ω', getValue: s => s.vel.omega.toFixed(2) + ' rad/s' },
      ],
    ],
  },

  about: {
    description: 'KR003 is an off-the-shelf mecanum-drive robot platform for robotics R&D. It features industrial DC motors with planetary gearboxes and encoder support, and four ultrasonic sensors for proximity detection. This open-source project covers the development of its URDF for future ROS 2 integration. KR003 was used for a proprietary VR-supported teleoperation and simulation MVP for an engineering company in the Netherlands.',
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
