/**
 * input/profiles/lekiwi2.js — Combined input profile for LeKiwi 2
 *
 * Drives the omni base with W/A/S/D/Q/E keys (speed set by the two
 * wheeled velocity sliders) AND the pan-tilt mechanism via its own
 * DOM sliders — both active simultaneously.
 *
 * Wheeled slider DOM IDs (shared with wheeledProfile):
 *   linearVelocitySlider / angularVelocitySlider
 *
 * Pan-tilt slider DOM IDs (shared with pantiltProfile):
 *   ptSlider_pan / ptSlider_tilt / ptSlider_speed
 */

import { isEstopActive } from '../../input.js';

const PT_JOINTS = [
  { id: 'pan',  name: 'pan_joint',  min: -2.0,         max: 2.0,          default: 0.0 },
  { id: 'tilt', name: 'tilt_joint', min: -Math.PI / 2, max: Math.PI / 2,  default: 0.0 },
];

const SPEED_DEFAULT = 1.0;

export const lekiwi2Profile = {

  keys: ['w', 'a', 's', 'd', 'q', 'e'],

  sliders: {
    slider1: {
      id:       'linearVelocitySlider',
      valueId:  'linearVelocityValue',
      label:    'Linear Vel',
      unit:     'm/s',
      min:      0,
      max:      0.2,
      step:     0.01,
      default:  0.1,
      decimals: 2,
    },
    slider2: {
      id:       'angularVelocitySlider',
      valueId:  'angularVelocityValue',
      label:    'Angular Vel',
      unit:     'rad/s',
      min:      0,
      max:      1.57,
      step:     0.01,
      default:  Math.PI / 4,
      decimals: 2,
    },
  },

  /**
   * Return velocity commands for the base AND joint targets for the pan-tilt.
   * When E-stop is active: all velocities zero, joint speed zero (joints freeze).
   */
  processInput({ keys, slider1, slider2 }) {
    const estop = isEstopActive();

    const velX       = estop ? 0 : (keys['w'] ? slider1 : 0) - (keys['s'] ? slider1 : 0);
    const velY       = estop ? 0 : (keys['a'] ? slider1 : 0) - (keys['d'] ? slider1 : 0);
    const velAngular = estop ? 0 : (keys['q'] ? slider2 : 0) - (keys['e'] ? slider2 : 0);

    const speed = estop
      ? 0
      : parseFloat(document.getElementById('ptSlider_speed')?.value ?? SPEED_DEFAULT);

    const jointTargets = {};
    for (const joint of PT_JOINTS) {
      const el = document.getElementById('ptSlider_' + joint.id);
      jointTargets[joint.name] = el ? parseFloat(el.value) : joint.default;
    }

    return { velX, velY, velAngular, jointTargets, speed };
  },

  /** Reset pan-tilt sliders to defaults (wheeled sliders are reset by applyProfile). */
  reset() {
    for (const joint of PT_JOINTS) {
      const slider = document.getElementById('ptSlider_' + joint.id);
      const badge  = document.getElementById('ptSliderValue_' + joint.id);
      if (slider) slider.value      = joint.default;
      if (badge)  badge.textContent = joint.default.toFixed(2);
    }
    const speedSlider = document.getElementById('ptSlider_speed');
    const speedBadge  = document.getElementById('ptSliderValue_speed');
    if (speedSlider) speedSlider.value      = SPEED_DEFAULT;
    if (speedBadge)  speedBadge.textContent = SPEED_DEFAULT.toFixed(2);
  },
};
