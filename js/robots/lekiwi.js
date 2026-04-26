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
  repoBase: 'https://raw.githubusercontent.com/adityakamath/lekiwi_ros2/main/lekiwi_description/urdf/base/',
  urdfPath: 'base.urdf',
  zOffset:  0.0,  // robot base sits flush on the ground plane
  controlsIds: ['wheeled-controls'],

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
    description: 'LeKiwi is an open-source mobile robot built on a holonomic drive, originally part of the LeRobot platform for robotics research and education. Built with 3D-printed parts, it includes serial bus servo motors with omni-wheels, a webcam, and supports the attachment of a SO100/101 robot arm. This build extends the base with a LiDAR, an IMU, an optional PT100 pan-tilt mechanism with a depth camera instead of a SO100 arm, and full ROS 2 support, making it a complete mobile perception platform.',
    githubUrl:   'https://github.com/adityakamath/lekiwi_ros2',
  },

  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return new URL(path, this.repoBase).href;
  },
};

export { updateJoints };
export { wheeledProfile as inputProfile };
