/**
 * robots/pt100.js — PT100 robot configuration
 *
 * Robot type : 2-DOF pan-tilt mechanism
 * URDF source: github.com/adityakamath/pantilt100 (pt100_description/urdf/)
 */
import { updateJoints }   from '../kinematics/pt100.js';
import { pantiltProfile } from '../input/profiles/pt100.js';

export const config = {
  robotType: 'arm',
  title:     'PT100 Playground',
  repoBase:  'https://raw.githubusercontent.com/adityakamath/pantilt100/refs/heads/main/pt100_description/urdf/',
  urdfPath:  'pantilt.urdf',
  zOffset:   0.0,
  controlsIds: [],
  pantilt: true,

  // No geometry params needed — pantilt.js does direct joint control
  kinematics: {},

  telemetry: {
    icon: '⊕',
    colWidths: ['9ch', '9ch'],
    rows: [
      [
        { id: 'pan',  label: 'pan',  getValue: s => (s.joints?.pan_joint  ?? 0).toFixed(2) + ' rad' },
        { id: 'tilt', label: 'tilt', getValue: s => (s.joints?.tilt_joint ?? 0).toFixed(2) + ' rad' },
      ],
    ],
  },

  about: {
    description: 'Pan Tilt 100 or PT100 is a 2-DOF pan-tilt mechanism built from the first two joints of the SO100 arm, driven by serial bus servo motors. Designed as a compact camera or sensor mount with full ROS 2 support, it mounts an OAK-D S2 depth camera for visual-inertial odometry and SLAM tasks.',
    githubUrl:   'https://github.com/adityakamath/lepantilt_ros2',
  },

  /**
   * Mesh paths in the URDF are relative (e.g. "../meshes/pantilt_base.stl").
   * Use new URL() to resolve them against repoBase so ../ traversal works correctly.
   */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return new URL(path, this.repoBase).href;
  },
};

export { updateJoints };
export { pantiltProfile as inputProfile };
