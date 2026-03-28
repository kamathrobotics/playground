/**
 * robots/so100.js — SO-ARM100 robot configuration
 *
 * Robot type : 6-DOF robotic arm
 * URDF source: github.com/adityakamath/SO-ARM100
 */
import { updateJoints } from '../kinematics/arm.js';
import { armProfile }   from '../input/profiles/arm.js';

export const config = {
  robotType: 'arm',
  title:     'SO-ARM100 Playground',
  repoBase:  'https://raw.githubusercontent.com/adityakamath/SO-ARM100/main/Simulation/SO100/',
  urdfPath:  'so100.urdf',
  zOffset:   0.0,

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
    description: 'The SO-ARM100 is an open-source 6-DOF robotic arm driven by serial bus servo motors. Designed for manipulation research and education, it can be mounted on a LeKiwi mobile base for a full mobile manipulation system.',
    githubUrl:   'https://github.com/adityakamath/SO-ARM100',
  },

  /**
   * Mesh paths in the SO100 URDF are relative (e.g. "assets/Base.stl").
   * Prepend repoBase to make them fetchable.
   */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return this.repoBase + path;
  },
};

export { updateJoints };
export { armProfile as inputProfile };
