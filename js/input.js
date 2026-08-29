/**
 * input.js — Raw keyboard state + slider tracker + E-stop
 *
 * This module tracks raw hardware state only — it does not interpret keys as
 * velocities. Interpretation is the responsibility of each robot's input
 * profile (js/input/profiles/).
 *
 * Exports:
 *   getCommands(profile)    → commands object (zeros when E-stop active)
 *   isEstopActive()         → boolean
 *   resetEstop()            clear E-stop state (call on robot-type switch)
 *   applyProfile(profile)   configure sliders for a new profile + reset state
 *   resetInput()            clear key highlights only (no slider change)
 */

// ── Raw keyboard state ─────────────────────────────────────────────────────────
const keysDown = {};

document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase();

  // X is reserved for E-stop toggle — not tracked as a movement key
  if (key === 'x') { e.preventDefault(); toggleEstop(); return; }
  // H is reserved for the reset-view shortcut (handled in main.js) — not
  // tracked as a movement key
  if (key === 'h') { e.preventDefault(); return; }

  if (estopActive) return;
  if (!keysDown[key]) {
    e.preventDefault();
    keysDown[key] = true;
    document.getElementById('key-' + key)?.classList.add('active');
  }
});

document.addEventListener('keyup', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if (keysDown[key]) {
    keysDown[key] = false;
    document.getElementById('key-' + key)?.classList.remove('active');
  }
});

// ── Slider state ───────────────────────────────────────────────────────────────
let slider1Value = 0.1;
let slider2Value = Math.PI / 4;

document.getElementById('linearVelocitySlider').addEventListener('input', (e) => {
  slider1Value = parseFloat(e.target.value);
  document.getElementById('linearVelocityValue').textContent = slider1Value.toFixed(2);
  e.target.blur();
});

document.getElementById('angularVelocitySlider').addEventListener('input', (e) => {
  slider2Value = parseFloat(e.target.value);
  document.getElementById('angularVelocityValue').textContent = slider2Value.toFixed(2);
  e.target.blur();
});

// ── E-stop ─────────────────────────────────────────────────────────────────────
// Declared before the keydown listener so the guard closure can reference it.
let estopActive = false;

function toggleEstop() {
  estopActive = !estopActive;
  document.getElementById('key-x')?.classList.toggle('active', estopActive);

  if (estopActive) {
    // Immediately clear all movement key state so the robot stops
    for (const key of Object.keys(keysDown)) {
      keysDown[key] = false;
      document.getElementById('key-' + key)?.classList.remove('active');
    }
  }
}

// Allow clicking the X key with the mouse as well
document.getElementById('key-x')?.addEventListener('click', toggleEstop);

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the active input profile and return velocity commands.
 *
 * E-stop is enforced here — no profile ever needs to handle it.
 * When E-stop is active every component is zero regardless of key state.
 *
 * @param {object} profile  The robot's input profile (e.g. wheeledProfile)
 * @returns {object}  Commands object as defined by the profile's processInput()
 */
export function getCommands(profile) {
  if (estopActive) return profile.processInput({ keys: {}, slider1: 0, slider2: 0 });
  return profile.processInput({
    keys:    { ...keysDown },
    slider1: slider1Value,
    slider2: slider2Value,
  });
}

/** True while the E-stop toggle is active. */
export function isEstopActive() {
  return estopActive;
}

/**
 * Reset the E-stop to inactive.
 * Call when switching to a robot of a different type so the new robot starts clean.
 */
export function resetEstop() {
  if (!estopActive) return;
  estopActive = false;
  document.getElementById('key-x')?.classList.remove('active');
}

/**
 * Configure the slider DOM for a new profile and reset everything to defaults.
 * Call when switching to a robot that uses a different input profile.
 *
 * @param {object} profile  An input profile (e.g. wheeledProfile)
 */
export function applyProfile(profile) {
  const { slider1: s1, slider2: s2 } = profile.sliders;

  // Reconfigure slider 1
  const el1  = document.getElementById(s1.id);
  const val1 = document.getElementById(s1.valueId);
  if (el1)  { el1.min = s1.min; el1.max = s1.max; el1.step = s1.step; el1.value = s1.default; }
  if (val1) val1.textContent = s1.default.toFixed(s1.decimals);
  slider1Value = s1.default;

  // Reconfigure slider 2
  const el2  = document.getElementById(s2.id);
  const val2 = document.getElementById(s2.valueId);
  if (el2)  { el2.min = s2.min; el2.max = s2.max; el2.step = s2.step; el2.value = s2.default; }
  if (val2) val2.textContent = s2.default.toFixed(s2.decimals);
  slider2Value = s2.default;

  // Clear all key highlights
  for (const key of Object.keys(keysDown)) {
    keysDown[key] = false;
    document.getElementById('key-' + key)?.classList.remove('active');
  }
}

/**
 * Clear key highlights and reset active key state.
 * Use when loading a new robot without changing the input profile.
 */
export function resetInput() {
  for (const key of Object.keys(keysDown)) {
    keysDown[key] = false;
    document.getElementById('key-' + key)?.classList.remove('active');
  }
}
