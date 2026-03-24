/**
 * robots/lekiwi.js — LeKiwi robot configuration
 *
 * Drive type : 3-wheel omnidirectional
 * URDF source: github.com/adityakamath/lekiwi_ros2
 */
import { updateJoints }   from '../kinematics/omni3.js';
import { wheeledProfile } from '../input/profiles/wheeled.js';

export const config = {
  title:    'LeKiwi Playground',
  repoBase: 'https://raw.githubusercontent.com/adityakamath/lekiwi_ros2/main/',
  urdfPath: 'lekiwi_description/urdf/base.urdf',
  zOffset:  0.0,  // robot base sits flush on the ground plane

  // Robot geometry passed to omni3 kinematics at runtime
  kinematics: {
    wheelRadius:  0.051,     // metres (from URDF)
    robotRadius:  0.132239,  // centre → wheel contact point (metres, from URDF)
    maxWheelVel:  (2720 * 2 * Math.PI) / 4096,  // ≈ 4.17 rad/s (motor limit from URDF)
  },

  // TODO(portfolio): replace dummy description and confirm githubUrl before launch
  about: {
    description: 'LeKiwi is a low-cost, open-source omnidirectional mobile robot built on a three-wheel holonomic drive. Designed for research and education, it uses custom 3D-printed parts and off-the-shelf components, and runs fully on <a href="https://ros.org" target="_blank">ROS 2</a>.',
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
