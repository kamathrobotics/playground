/**
 * robots/so100.js — SO100 robot configuration
 *
 * Robot type : 6-DOF robotic arm
 * URDF source: github.com/adityakamath/soarm_ros2
 */
import { updateJoints } from '../kinematics/arm.js';
import { armProfile }   from '../input/profiles/arm.js';

export const config = {
  robotType: 'arm',
  title:     'SO100 Playground',
  repoBase:  'https://raw.githubusercontent.com/adityakamath/soarm_ros2/main/soarm_description/urdf/so100/',
  urdfPath:  'so100.urdf',
  zOffset:     0.0,
  thetaOffset: Math.PI / 2,  // rotate 90° CCW so the arm faces forward in the scene

  // No geometry params needed — arm.js does direct joint control
  kinematics: {},

  telemetry: {
    icon: '∠',
    colWidths: ['9ch', '9ch', '9ch'],
    rows: [
      [
        { id: 'pan',   label: 'pan',   getValue: s => ((s.joints?.shoulder_pan  ?? 0)).toFixed(2) + ' rad' },
        { id: 'lift',  label: 'lift',  getValue: s => ((s.joints?.shoulder_lift ?? 0)).toFixed(2) + ' rad' },
        { id: 'flex',  label: 'flex',  getValue: s => ((s.joints?.elbow_flex    ?? 0)).toFixed(2) + ' rad' },
      ],
      [
        { id: 'wrist', label: 'wrist', getValue: s => ((s.joints?.wrist_flex    ?? 0)).toFixed(2) + ' rad' },
        { id: 'roll',  label: 'roll',  getValue: s => ((s.joints?.wrist_roll    ?? 0)).toFixed(2) + ' rad' },
        { id: 'grip',  label: 'grip',  getValue: s => ((s.joints?.gripper       ?? 0)).toFixed(2) + ' rad' },
      ],
    ],
  },

  about: {
    description: 'The SO100 is an open-source 6-DOF robotic arm driven by serial bus servo motors. Designed for manipulation research and education, it can be mounted on a LeKiwi mobile base for a full mobile manipulation system.',
    githubUrl:   'https://github.com/adityakamath/soarm_ros2',
  },

  /**
   * Mesh paths in this URDF are relative (e.g. "../../meshes/so100/Base.stl").
   * Use new URL() to resolve them against repoBase so ../.. traversal works correctly.
   */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return new URL(path, this.repoBase).href;
  },
};

export { updateJoints };
export { armProfile as inputProfile };
