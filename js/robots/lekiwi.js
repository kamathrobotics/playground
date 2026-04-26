/**
 * robots/lekiwi.js — LeKiwi robot configuration
 *
 * Drive type : 3-wheel omnidirectional
 * URDF source: github.com/adityakamath/lekiwi_ros2
 */
import { updateJoints }   from '../kinematics/omni3.js';
import { wheeledProfile } from '../input/profiles/wheeled.js';

export const config = {
  robotType: 'wheeled',
  title:    'LeKiwi Playground',
  repoBase: 'https://raw.githubusercontent.com/adityakamath/lekiwi_ros2/main/',
  urdfPath: 'lekiwi_description/urdf/base/base.urdf',
  zOffset:  0.0,  // robot base sits flush on the ground plane

  // Robot geometry passed to omni3 kinematics at runtime
  kinematics: {
    wheelRadius:  0.051,     // metres (from URDF)
    robotRadius:  0.132239,  // centre → wheel contact point (metres, from URDF)
    maxWheelVel:  (2720 * 2 * Math.PI) / 4096,  // ≈ 4.17 rad/s (motor limit from URDF)
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
    description: 'LeKiwi is an open-source mobile robot built on a holonomic drive, originally part of the LeRobot platform for robotics research and education. Built with 3D-printed parts, it includes serial bus servo motors with omni-wheels, a webcam, and supports the attachment of a SO-100/101 robot arm. This build extends LeKiwi with a LiDAR for spatial awareness and full ROS 2 support.',
    githubUrl:   'https://github.com/adityakamath/lekiwi_ros2',
  },

  /**
   * Translate a mesh path from the URDF into a fetchable URL.
   * LeKiwi uses ROS package:// URIs that must be rewritten to raw GitHub URLs.
   */
  resolveMeshPath(path) {
    const PKG = 'package://lekiwi_description/';
    if (path.startsWith(PKG))
      return path.replace(PKG, this.repoBase + 'lekiwi_description/');
    if (path.startsWith('http://') || path.startsWith('https://'))
      return path;
    return this.repoBase + path;
  },
};

export { updateJoints };
export { wheeledProfile as inputProfile };
