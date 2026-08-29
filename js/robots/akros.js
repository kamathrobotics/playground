/**
 * robots/akros.js — AKROS robot configuration
 *
 * Drive type : 4-wheel mecanum
 * URDF source: github.com/adityakamath/akros2
 */
import { updateJoints }   from '../kinematics/mecanum.js';
import { wheeledProfile } from '../input/profiles/wheeled.js';

export const config = {
  robotType: 'wheeled',
  title:    'AKROS Sandbox',
  repoBase: 'https://raw.githubusercontent.com/adityakamath/akros2/main/akros2_description/urdf/',
  urdfPath: 'robot.urdf',
  zOffset:  0.01539,  // 15.39 mm — AKROS base_link elevated above ground in URDF

  // Robot geometry passed to mecanum kinematics at runtime
  kinematics: {
    lx:          0.0495,     // half-wheelbase   (centre → wheel, X axis, metres, from URDF)
    ly:          0.0854225,  // half-track-width (centre → wheel, Y axis, metres, from URDF)
    wheelRadius: 0.0385,     // metres (from URDF)
  },

  about: {
    description: 'AKROS is a mecanum-drive mobile robot designed for navigation experiments and sensor integration/testing. Originally running on ROS 1 Noetic, it was later migrated to ROS 2 and micro-ROS before being retired in 2025. It features a LiDAR and a webcam, alongside wireless charging capabilities, and has been used for testing experimental payloads such as depth/VIO cameras and optical flow sensors.',
    githubUrl:   'https://github.com/adityakamath/akros2',
  },

  /** Mesh paths are relative to the URDF's base URL — no package:// remapping needed. */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return this.repoBase + path;
  },
};

export { updateJoints };
export { wheeledProfile as inputProfile };
