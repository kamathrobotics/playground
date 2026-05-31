/**
 * input/profiles/lekiwi.js — Combined input profile for LeKiwi
 *
 * Drives the omni base with W/A/S/D/Q/E keys (speed set by the two
 * wheeled velocity sliders) AND the pan-tilt mechanism via its own
 * DOM sliders — both active simultaneously.
 *
 * Composed from wheeledProfile (keys, sliders, base velocities) and
 * pantiltProfile (joint targets, speed, reset).
 */

import { isEstopActive }  from '../../input.js';
import { wheeledProfile } from './wheeled.js';
import { pantiltProfile } from './pt100.js';

export const lekiwiProfile = {

  keys:    wheeledProfile.keys,
  sliders: wheeledProfile.sliders,

  /**
   * Return velocity commands for the base AND joint targets for the pan-tilt.
   * When E-stop is active: all velocities zero, joint speed zero (joints freeze).
   */
  processInput(rawInput) {
    const estop = isEstopActive();
    const { velX, velY, velAngular } = wheeledProfile.processInput(rawInput);
    const { jointTargets, speed }    = pantiltProfile.processInput(rawInput);
    return {
      velX:       estop ? 0 : velX,
      velY:       estop ? 0 : velY,
      velAngular: estop ? 0 : velAngular,
      jointTargets,
      speed,
    };
  },

  /** Reset pan-tilt sliders to defaults (wheeled sliders are reset by applyProfile). */
  reset() {
    pantiltProfile.reset();
  },
};

