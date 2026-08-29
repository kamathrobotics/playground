/**
 * robots/so101.js — SO101 robot configuration
 *
 * Robot type : 6-DOF robotic arm
 * URDF source: github.com/adityakamath/so_arm_ros2
 */
import { updateJoints } from '../kinematics/5dof_arm.js';
import { armProfile }   from '../input/profiles/5dof_arm.js';

export const config = {
  robotType: 'arm',
  title:     'SO101 Sandbox',
  repoBase:  'https://raw.githubusercontent.com/adityakamath/so_arm_ros2/main/so_arm_description/urdf/so101/',
  urdfPath:  'so101.urdf',
  zOffset:     0.0,

  // No geometry params needed — 5dof_arm.js does direct joint control
  kinematics: {},

  about: {
    description: 'The SO101 is an open-source 6-DoF robotic arm (5 DoF + gripper), driven by serial bus servo motors. Originally designed for the LeRobot platform, this build extends it with full ROS 2 support. It can be mounted on a LeKiwi mobile base for a complete mobile manipulator system.',
    githubUrl:   'https://github.com/adityakamath/so_arm_ros2',
  },

  /**
   * Mesh paths in this URDF are relative (e.g. "../../meshes/so101/Base.stl").
   * Use new URL() to resolve them against repoBase so ../.. traversal works correctly.
   */
  resolveMeshPath(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return new URL(path, this.repoBase).href;
  },
};

export { updateJoints };
export { armProfile as inputProfile };
