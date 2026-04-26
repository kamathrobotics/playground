/**
 * robots/lekiwi2.js — LeKiwi 2 robot configuration
 *
 * Drive type : 3-wheel omnidirectional base + 2-DOF pan-tilt head
 * URDF source: github.com/adityakamath/lekiwi_ros2 (lekiwi_description/urdf/)
 */
import { updateJoints }    from '../kinematics/lekiwi2.js';
import { lekiwi2Profile }  from '../input/profiles/lekiwi2.js';

export const config = {
  robotType:  'mobile-arm',
  title:      'LeKiwi Playground',
  repoBase:   'https://raw.githubusercontent.com/adityakamath/lekiwi_ros2/main/lekiwi_description/urdf/',
  urdfPath:   'lekiwi.urdf',
  zOffset:    0.0,
  controlsIds: ['wheeled-controls'],
  pantilt: true,

  kinematics: {
    wheelRadius:  0.051,
    robotRadius:  0.132239,
    maxWheelVel:  (2720 * 2 * Math.PI) / 4096,
  },

  telemetry: {
    icon: '⌖',
    colWidths: ['9ch', '9ch', '11ch'],
    rows: [
      [
        { id: 'x',     label: 'x',    getValue: s => s.pose.x.toFixed(2) + ' m' },
        { id: 'y',     label: 'y',    getValue: s => s.pose.y.toFixed(2) + ' m' },
        { id: 'theta', label: 'θ',    getValue: s => (((s.pose.theta % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)).toFixed(2) + ' rad' },
      ],
      [
        { id: 'pan',  label: 'pan',  getValue: s => (s.joints?.pan_joint  ?? 0).toFixed(2) + ' rad' },
        { id: 'tilt', label: 'tilt', getValue: s => (s.joints?.tilt_joint ?? 0).toFixed(2) + ' rad' },
      ],
    ],
  },

  about: {
    description: 'LeKiwi is an open-source mobile robot built on a holonomic drive, originally part of the LeRobot platform for robotics research and education. Built with 3D-printed parts, it includes serial bus servo motors with omni-wheels, a webcam, and supports the attachment of a SO100/101 robot arm. This build extends the base with a LiDAR, an IMU, an optional PT100 pan-tilt mechanism with a depth camera instead of a SO100 arm, and full ROS 2 support.',
    githubUrl:   'https://github.com/adityakamath/lekiwi_ros2',
  },

  /**
   * Mesh paths in the URDF are relative. Resolve against the URDF directory
   * so that ../meshes/... traversal works correctly.
   */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return new URL(path, this.repoBase).href;
  },
};

export { updateJoints };
export { lekiwi2Profile as inputProfile };
