/**
 * input/profiles/arm.js — Input profile for robotic arms
 *
 * Ignores keyboard input and the two wheeled velocity sliders.
 * Instead reads from arm-specific DOM sliders injected in index.html.
 *
 * Slider DOM IDs (defined in index.html):
 *   armSlider_shoulder_pan / shoulder_lift / elbow_flex / wrist_flex / wrist_roll / gripper
 *   armSlider_speed
 */

import { isEstopActive } from '../../input.js';

// Joint configuration: DOM id suffix, URDF joint name, URDF limits, default
const ARM_JOINTS = [
  { id: 'shoulder_pan',  name: 'shoulder_pan_joint',  min: -2.0,          max: 2.0,     default: 0.0 },
  { id: 'shoulder_lift', name: 'shoulder_lift_joint', min:  0.0,          max: 3.5,     default: 0.0 },
  { id: 'elbow_flex',    name: 'elbow_flex_joint',    min: -Math.PI,      max: 0.0,     default: 0.0 },
  { id: 'wrist_flex',    name: 'wrist_flex_joint',    min: -2.5,          max: 1.2,     default: 0.0 },
  { id: 'wrist_roll',    name: 'wrist_roll_joint',    min: -Math.PI,      max: Math.PI, default: 0.0 },
  { id: 'gripper',       name: 'gripper_joint',       min: -0.2,          max: 2.0,     default: 0.0 },
];

const SPEED_DEFAULT = 1.0;

export const armProfile = {

  /** No keys used — arm is slider-only */
  keys: [],

  /**
   * Dummy slider config — IDs do not exist in the DOM so applyProfile()
   * silently no-ops for the DOM parts while still resetting slider1Value / slider2Value.
   */
  sliders: {
    slider1: { id: 'armNoop1', valueId: 'armNoop1V', min: 0, max: 1, step: 1, default: 0, decimals: 2 },
    slider2: { id: 'armNoop2', valueId: 'armNoop2V', min: 0, max: 1, step: 1, default: 0, decimals: 2 },
  },

  /**
   * Read arm slider DOM values and return joint targets + speed.
   * Ignores the standard { keys, slider1, slider2 } parameters entirely.
   * When E-stop is active, returns speed: 0 so joints freeze in place.
   */
  processInput(_rawInput) {
    const speed = isEstopActive()
      ? 0
      : parseFloat(document.getElementById('armSlider_speed')?.value ?? SPEED_DEFAULT);

    const jointTargets = {};
    for (const joint of ARM_JOINTS) {
      const el = document.getElementById('armSlider_' + joint.id);
      jointTargets[joint.name] = el ? parseFloat(el.value) : joint.default;
    }

    return { velX: 0, velY: 0, velAngular: 0, jointTargets, speed };
  },

  /** Reset all arm slider DOM elements to their default values. */
  reset() {
    for (const joint of ARM_JOINTS) {
      const slider = document.getElementById('armSlider_' + joint.id);
      const badge  = document.getElementById('armSliderValue_' + joint.id);
      if (slider) slider.value      = joint.default;
      if (badge)  badge.textContent = joint.default.toFixed(2);
    }
    const speedSlider = document.getElementById('armSlider_speed');
    const speedBadge  = document.getElementById('armSliderValue_speed');
    if (speedSlider) speedSlider.value      = SPEED_DEFAULT;
    if (speedBadge)  speedBadge.textContent = SPEED_DEFAULT.toFixed(2);
  },
};
