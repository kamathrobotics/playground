# Playground

Interactive 3D robot playground in the browser. Load a robot, drive it around with keyboard controls, or pose a robotic arm with joint sliders — all running client-side with Three.js and URDF models loaded straight from GitHub.

**Live at [playground.kamathrobotics.com](https://playground.kamathrobotics.com)**

## Robots

| Robot | Type | Drive | Kinematics |
|-------|------|-------|------------|
| [LeKiwi](https://github.com/adityakamath/lekiwi_ros2) | Wheeled | 3-wheel omnidirectional | `omni3.js` |
| [AKROS](https://github.com/adityakamath/akros2) | Wheeled | 4-wheel mecanum | `mecanum.js` |
| [KR003](https://github.com/adityakamath/kr0003_description) | Wheeled | 4-wheel mecanum | `mecanum.js` |
| [SO-ARM100](https://github.com/adityakamath/SO-ARM100) | Arm | 6-DOF serial | `arm.js` |

## Controls

**Wheeled robots** — WASD for translation, Q/E for rotation, X for e-stop. Velocity limits adjustable via sliders.

**Arm robots** — per-joint sliders for shoulder pan, shoulder lift, elbow flex, wrist flex, wrist roll, and gripper.

## How It Works

- URDF models are fetched from their respective GitHub repos at runtime (no local assets needed beyond favicons/logos)
- Three.js renders the scene with orbit camera controls
- Kinematics modules compute wheel velocities or joint angles each frame
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
    arm.js               ← Slider bindings for arm robots
  kinematics/
    omni3.js             ← 3-wheel omnidirectional inverse kinematics
    mecanum.js           ← 4-wheel mecanum inverse kinematics
    arm.js               ← Direct joint control for serial arms
  robots/
    registry.js          ← Central robot registry (add new robots here)
    lekiwi.js            ← LeKiwi config + geometry
    akros.js             ← AKROS config + geometry
    kr003.js             ← KR003 config + geometry
    so100.js             ← SO-ARM100 config
assets/                  ← Favicons, logos, OG images
wrangler.jsonc           ← Cloudflare Pages deployment config
```

## Adding a New Robot

1. Create `js/robots/<name>.js` with a `config` and `updateJoints` export
2. If it needs new kinematics, create `js/kinematics/<type>.js`
3. Import and register it in `js/robots/registry.js`
4. Add an `<option>` to `#robotSelect` in `index.html`

See `js/robots/registry.js` for the full specification.

## Deployment

Deployed on [Cloudflare Pages](https://pages.cloudflare.com/) — static files served directly, no build step.

## License

Apache-2.0 — see [LICENSE](LICENSE).
