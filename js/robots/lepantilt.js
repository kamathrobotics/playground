/**
 * robots/pantilt.js — LePanTilt robot configuration
 *
 * Robot type : 2-DOF pan-tilt mechanism
 * URDF source: github.com/adityakamath/lekiwi_ros2 (lekiwi_description/urdf/pantilt/)
 */
import { updateJoints }   from '../kinematics/lepantilt.js';
import { pantiltProfile } from '../input/profiles/lepantilt.js';

export const config = {
  robotType: 'arm',
  title:     'PT100 Playground',
  repoBase:  'https://raw.githubusercontent.com/adityakamath/lekiwi_ros2/main/lekiwi_description/urdf/pantilt/',
  urdfPath:  'pantilt.urdf',
  zOffset:   0.0,
  controlsId: 'pt100-box',

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
    description: 'LePanTilt is a 2-DOF pan-tilt mechanism built from the first two joints of the SO100 arm, driven by serial bus servo motors. Designed as a compact camera or sensor mount with full ROS 2 support, it mounts an OAK-D-S2 depth camera for perception tasks.',
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
