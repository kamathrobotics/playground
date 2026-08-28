# Dojo

![Project Status](https://img.shields.io/badge/Status-Active-green)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-yellow?style=flat&logo=javascript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r128-black?style=flat&logo=threedotjs&logoColor=white)
[![CI](https://github.com/kamathrobotics/dojo/actions/workflows/ci.yml/badge.svg)](https://github.com/kamathrobotics/dojo/actions/workflows/ci.yml)
![License](https://img.shields.io/github/license/kamathrobotics/dojo?label=License)

Dojo is an interactive 3D robot playground in the browser. Load a robot, drive it around with keyboard controls, or pose a robotic arm with joint sliders — all running client-side with Three.js and URDF models loaded straight from GitHub.

## Robots

| Robot | Type | Drive | Kinematics |
|-------|------|-------|------------|
| [LeKiwi](https://github.com/adityakamath/lekiwi_ros2) | Mobile + arm | 3-wheel omnidirectional | `omni3.js` |
| [SO101](https://github.com/adityakamath/so_arm_ros2) | Arm | 6-DOF serial | `5dof_arm.js` |
| [PT101](https://github.com/adityakamath/pantilt_ros2) | Arm | Pan-tilt (2-DOF) | `pt101.js` |
| [KR003](https://github.com/adityakamath/kr0003_description) | Wheeled | 4-wheel mecanum | `mecanum.js` |
| [AKROS](https://github.com/adityakamath/akros2) | Wheeled | 4-wheel mecanum | `mecanum.js` |

## Controls

**Wheeled robots** — WASD for translation, Q/E for rotation, X for e-stop. Velocity limits adjustable via sliders.

**Arm robots** — per-joint sliders for shoulder pan, shoulder lift, elbow flex, wrist flex, wrist roll, and gripper.

## How It Works

- URDF models are fetched from their respective GitHub repos at runtime (no local assets needed beyond favicons/logos)
- Three.js renders the scene with orbit camera controls
- Kinematics modules compute wheel velocities or joint angles each frame
- A self-collision checker/resolver prevents arm meshes from interpenetrating
- Telemetry is shown in the footer bar (pose for wheeled, joint angles for arms)
- No build step — vanilla HTML/CSS/JS with ES modules

## Project Structure

```
index.html              ← App shell, controls UI, CDN script tags
css/style.css           ← Styling
js/
  main.js               ← Orchestrator (robot loading, animation loop)
  scene.js              ← Three.js scene, camera, renderer, lighting
  input.js              ← Keyboard input + profile switching
  input/profiles/
    wheeled.js           ← WASD key bindings for wheeled robots
    5dof_arm.js           ← Slider bindings for 5-DOF arms
    pt101.js              ← Slider bindings for the PT101 pan-tilt
    lekiwi.js             ← Slider + WASD bindings for LeKiwi's arm + base
  kinematics/
    omni3.js              ← 3-wheel omnidirectional inverse kinematics
    mecanum.js             ← 4-wheel mecanum inverse kinematics
    5dof_arm.js            ← Direct joint control for 5-DOF serial arms
    pt101.js               ← Direct joint control for the PT101 pan-tilt
    lekiwi.js               ← Combined base + arm kinematics for LeKiwi
  collision/
    collision.js           ← Self-collision detection + resolution for arms
  robots/
    registry.js           ← Central robot registry (add new robots here)
    lekiwi.js               ← LeKiwi config + geometry
    akros.js                ← AKROS config + geometry
    kr003.js                 ← KR003 config + geometry
    so101.js                 ← SO101 config
    pt101.js                 ← PT101 config
assets/                  ← Favicons, logos, OG images
wrangler.jsonc           ← Cloudflare Pages deployment config
.github/workflows/ci.yml ← HTML/JS lint + link check
```

## Adding a New Robot

1. Create `js/robots/<name>.js` with a `config` and `updateJoints` export
2. If it needs new kinematics, create `js/kinematics/<type>.js`
3. Import and register it in `js/robots/registry.js`
4. Add an `<option>` to `#robotSelect` in `index.html`

See `js/robots/registry.js` for the full specification.

## CI

Every push and pull request runs:
- **HTML lint** — `htmlhint` against `index.html`
- **JS syntax check** — `node --check` on every file in `js/`
- **Link check** — [lychee](https://github.com/lycheeverse/lychee-action) verifies links in `README.md` and `index.html` aren't broken

## Deployment

Deployed on [Cloudflare Pages](https://pages.cloudflare.com/) — static files served directly, no build step.

## License

Apache-2.0 — see [LICENSE](LICENSE).
