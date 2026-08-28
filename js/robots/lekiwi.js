/**
 * robots/lekiwi.js — LeKiwi robot configuration
 *
 * Drive type : 3-wheel omnidirectional base + 2-DOF pan-tilt head
 * URDF source: github.com/adityakamath/lekiwi_ros2 (lekiwi_description/urdf/base_pantilt/base_pantilt.urdf)
 */
import { updateJoints }    from '../kinematics/lekiwi.js';
import { lekiwiProfile }  from '../input/profiles/lekiwi.js';

export const config = {
  robotType:  'mobile-arm',
  title:      'LeKiwi Dojo',
  repoBase:   'https://raw.githubusercontent.com/adityakamath/lekiwi_ros2/main/lekiwi_description/urdf/base_pantilt/',
  urdfPath:   'base_pantilt.urdf',
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
    description: 'LeKiwi is an open-source mobile robot built on a holonomic drive, originally part of the LeRobot platform for robotics research and education. Built with 3D-printed parts, it includes serial bus servo motors with omni-wheels, a webcam, and supports the attachment of a SO101 robot arm. This build extends the base with a LiDAR, an IMU, an optional PT101 pan-tilt mechanism with a depth camera instead of a SO101 arm, and full ROS 2 support.',
    githubUrl:   'https://github.com/adityakamath/lekiwi_ros2',
  },

  /**
   * Mesh paths come from the URDF's package:// URIs (e.g. "package://lekiwi_description/
   * meshes/lekiwi_base.stl"), which urdf-loader passes through as "/lekiwi_description/
   * meshes/lekiwi_base.stl" — a ROS package name, not a path relative to repoBase (which
   * points at urdf/base_pantilt/, three directories deeper than where the mesh dirs live).
   * lekiwi_description meshes are in this repo; pt_description is a git submodule (payloads/
   * pantilt_ros2) pointing at the separate pantilt_ros2 repo — the same one PT101 uses.
   */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const clean = path.replace(/^\/+/, '');
    if (clean.startsWith('pt_description/')) {
      return 'https://raw.githubusercontent.com/adityakamath/pantilt_ros2/main/' + clean;
    }
    return 'https://raw.githubusercontent.com/adityakamath/lekiwi_ros2/main/' + clean;
  },
};

export { updateJoints };
export { lekiwiProfile as inputProfile };
