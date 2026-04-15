/**
 * input/profiles/pantilt.js — Input profile for pan-tilt mechanisms
 *
 * Ignores keyboard input and the two wheeled velocity sliders.
 * Instead reads from pan-tilt-specific DOM sliders injected in index.html.
 *
 * Slider DOM IDs (defined in index.html):
 *   ptSlider_pan / tilt
 *   ptSlider_speed
 */

import { isEstopActive } from '../../input.js';

// Joint configuration: DOM id suffix, URDF joint name, URDF limits, default
const PT_JOINTS = [
  { id: 'pan',  name: 'pan_joint',  min: -2.0,          max: 2.0,          default: 0.0 },
  { id: 'tilt', name: 'tilt_joint', min: -Math.PI / 2,  max: Math.PI / 2,  default: 0.0 },
];

const SPEED_DEFAULT = 1.0;

export const pantiltProfile = {

  /** No keys used — pan-tilt is slider-only */
  keys: [],

  /**
   * Dummy slider config — IDs do not exist in the DOM so applyProfile()
   * silently no-ops for the DOM parts while still resetting slider1Value / slider2Value.
   */
  sliders: {
    slider1: { id: 'ptNoop1', valueId: 'ptNoop1V', min: 0, max: 1, step: 1, default: 0, decimals: 2 },
    slider2: { id: 'ptNoop2', valueId: 'ptNoop2V', min: 0, max: 1, step: 1, default: 0, decimals: 2 },
  },

  /**
   * Read pan-tilt slider DOM values and return joint targets + speed.
   * Ignores the standard { keys, slider1, slider2 } parameters entirely.
   * When E-stop is active, returns speed: 0 so joints freeze in place.
   */
  processInput(_rawInput) {
    const speed = isEstopActive()
      ? 0
      : parseFloat(document.getElementById('ptSlider_speed')?.value ?? SPEED_DEFAULT);

    const jointTargets = {};
    for (const joint of PT_JOINTS) {
      const el = document.getElementById('ptSlider_' + joint.id);
      jointTargets[joint.name] = el ? parseFloat(el.value) : joint.default;
    }

    return { velX: 0, velY: 0, velAngular: 0, jointTargets, speed };
  },

  /** Reset all pan-tilt slider DOM elements to their default values. */
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
