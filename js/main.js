/**
 * main.js — Orchestrator
 *
 * Ties together scene, input, and robot modules.
 * Handles robot loading, UI events, and the animation loop.
 *
 * THREE / URDFLoader are globals injected by the classic <script> tags in
 * index.html and are available here because ES modules execute after all
 * synchronous scripts have run.
 */

import {
  scene,
  camera,
  renderer,
  orbitControls,
} from './scene.js';

import {
  getCommands,
  applyProfile,
  resetInput,
  resetEstop,
} from './input.js';

import { ROBOTS } from './robots/registry.js';
import { SelfCollisionChecker, CollisionResolver } from './collision/collision.js';
import { initJointDrag, connectBaseDrag } from './interaction/jointDrag.js';
import { initBaseDrag, getDragCommand, clearBaseHover, isBaseDragging } from './interaction/baseDrag.js';

// jointDrag.js needs to clear/query baseDrag.js's hover-highlight state, but
// can't import it directly — see the comment on connectBaseDrag() in
// jointDrag.js for why that would create a circular import that breaks
// pointerdown listener registration order. Wiring it here instead, since
// main.js already imports both modules without a cycle.
connectBaseDrag({ clearBaseHover, isBaseDragging });

// ── Fade helpers ───────────────────────────────────────────────────────────────
function fadeRobotOut(target, duration) {
  target.traverse(c => {
    if (c.isMesh && c.material) { c.material.transparent = true; c.material.needsUpdate = true; }
  });
  const start = performance.now();
  (function step() {
    const t = Math.min((performance.now() - start) / duration, 1);
    target.traverse(c => { if (c.isMesh && c.material) c.material.opacity = 1 - t; });
    if (t < 1) requestAnimationFrame(step);
    else scene.remove(target);
  })();
}

function fadeRobotIn(target, duration) {
  target.traverse(c => {
    if (c.isMesh && c.material) {
      c.material.transparent = true;
      c.material.opacity     = 0;
      c.material.needsUpdate = true;
    }
  });
  const start = performance.now();
  (function step() {
    const t = Math.min((performance.now() - start) / duration, 1);
    target.traverse(c => { if (c.isMesh && c.material) c.material.opacity = t; });
    if (t < 1) requestAnimationFrame(step);
    else target.traverse(c => {
      if (c.isMesh && c.material) {
        c.material.transparent = false;
        c.material.opacity     = 1;
        c.material.needsUpdate = true;
      }
    });
  })();
}

// ── Camera reset animation ───────────────────────────────────────────────────
const CAMERA_HOME_POSITION = new THREE.Vector3(0.75, -0.75, 0.35);
const CAMERA_HOME_TARGET   = new THREE.Vector3(0, 0, 0.06);
let cameraAnimId = null;

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animateCameraTo(targetPos, targetTarget, duration) {
  if (cameraAnimId !== null) cancelAnimationFrame(cameraAnimId);
  const startPos    = camera.position.clone();
  const startTarget = orbitControls.target.clone();
  const start = performance.now();
  (function step() {
    const t = Math.min((performance.now() - start) / duration, 1);
    const e = easeOutCubic(t);
    camera.position.lerpVectors(startPos, targetPos, e);
    orbitControls.target.lerpVectors(startTarget, targetTarget, e);
    orbitControls.update();
    if (t < 1) {
      cameraAnimId = requestAnimationFrame(step);
    } else {
      cameraAnimId = null;
    }
  })();
}

// ── Runtime state ──────────────────────────────────────────────────────────────
let robot       = null;   // active URDFRobot
let robotPose   = { x: 0, y: 0, theta: 0 };
let lastTime    = performance.now();
let loadGen     = 0;      // bumped on every robot switch; stale callbacks check against it
let robotResetAnim = null; // { start, duration, startX, startY, startTheta, deltaTheta } while driving back to origin

// Shortest signed angular delta from `from` to `to`, wrapped to [-π, π] —
// avoids the long way around when interpolating heading back to 0.
function shortestAngleDelta(from, to) {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
let activeRobot = null;   // reference to active entry from ROBOTS
// ── Robot loader ───────────────────────────────────────────────────────────────
function loadRobot(key) {
  const entry = ROBOTS[key];
  if (!entry) { console.error('Unknown robot key:', key); return; }

  // Capture outgoing robot type before overwriting activeRobot
  // mobile-arm shares the same (x, y, θ) pose space as wheeled, so treat them as equivalent
  const poseFamily = t => (t === 'mobile-arm' ? 'wheeled' : t);
  const prevRobot  = activeRobot;
  const sameType   = prevRobot !== null &&
                     !!prevRobot.config.robotType &&
                     poseFamily(prevRobot.config.robotType) === poseFamily(entry.config.robotType);

  // Snapshot pose — persist if same type, zero otherwise
  const nextPose = sameType ? { ...robotPose } : { x: 0, y: 0, theta: 0 };

  activeRobot     = entry;
  const { config } = entry;
  const myGen     = ++loadGen;

  // Update page title to reflect selected robot
  document.title = config.title;

  // Disable selector while loading to avoid rapid switching
  const sel = document.getElementById('robotSelect');
  sel.disabled = true;

  // ── Tear down previous robot ────────────────────────────────────────────────
  if (robot) { fadeRobotOut(robot, 200); robot = null; }

  robotPose       = nextPose;
  robotResetAnim  = null;  // switching robots cancels any in-progress drive-home

  // Reset input state and configure sliders for this robot's profile
  applyProfile(entry.inputProfile);

  // Reset arm slider values to defaults (no-op for wheeled profiles)
  if (entry.inputProfile.reset) entry.inputProfile.reset();

  // Show/hide main control groups
  const ALL_CONTROLS = ['wheeled-controls', 'arm-controls'];
  const activeControls = config.controlsIds
    ?? (config.controlsId ? [config.controlsId]
      : [config.robotType === 'arm' ? 'arm-controls' : 'wheeled-controls']);
  for (const id of ALL_CONTROLS)
    document.getElementById(id).style.display = activeControls.includes(id) ? '' : 'none';

  // PT101 section — pan/tilt sliders (shown whenever config.pantilt is true)
  const showPantilt = !!config.pantilt;
  document.getElementById('pt101-toggle-row').style.display = 'none';
  document.getElementById('pantilt-controls').style.display = showPantilt ? '' : 'none';

  if (!sameType) resetEstop();

  // Point the GitHub button at this robot's repo
  const infoBtn = document.getElementById('infoButton');
  if (infoBtn) infoBtn.href = entry.config.about.githubUrl;

  // ── Loading status ──────────────────────────────────────────────────────────
  const status = document.getElementById('loadingStatus');
  status.style.color = 'rgba(255,255,255,0.5)';
  status.textContent = 'Loading robot…';
  status.classList.add('visible', 'loading');

  // ── Build a fresh loader for this robot ─────────────────────────────────────
  const mgr    = new THREE.LoadingManager();
  const loader = new URDFLoader(mgr);
  loader.fetchOptions   = { mode: 'cors' };
  loader.parseCollision = false;  // collision geometry mirrors visuals; skip to halve fetch count

  // Translate URDF mesh paths → fetchable URLs using per-robot resolver.
  loader.loadMeshCb = (path, manager, onComplete) => {
    const url = config.resolveMeshPath(path);
    console.log('Mesh:', path, '→', url);

    new THREE.STLLoader(manager).load(
      url,
      (geometry) => {
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: false })
        );
        mesh.castShadow = mesh.receiveShadow = true;
        onComplete(mesh);
      },
      undefined,
      (err) => { console.error('Mesh error:', url, err); onComplete(null); }
    );
  };

  mgr.onProgress = (url, loaded, total) => {
    if (myGen !== loadGen) return;
    status.textContent = `Loading… ${loaded}/${total}`;
  };

  mgr.onLoad = () => {
    if (myGen !== loadGen) return;
    status.classList.remove('loading');
    status.textContent = '✓ Robot loaded';
    setTimeout(() => { if (myGen === loadGen) status.classList.remove('visible'); }, 2000);
    sel.disabled = false;

    // Build a self-collision resolver for joint-driven robots (arms + pan-tilt) so
    // slider-commanded moves can't drive the robot's own links into each other.
    if (robot && (config.robotType === 'arm' || config.pantilt)) {
      try {
        const checker = new SelfCollisionChecker(robot);
        const commandableJoints = Object.keys(robot.joints)
          .filter((name) => robot.joints[name].jointType === 'revolute');
        robot.userData.collisionResolver = new CollisionResolver(checker, commandableJoints);
        console.log('Self-collision checker:', checker.checkedPairs.length, 'pair(s) monitored');
      } catch (err) {
        console.error('Self-collision checker failed to build:', err);
      }
    }

    // Register draggable joints for this robot. jointDrag itself only
    // registers joints that have a matching UI slider (arm/pan-tilt joints),
    // so this works for any robot config without robotType gating. Wheel
    // joints have no slider and aren't yet draggable — see README.
    initJointDrag(robot);

    // Register base-drag (click-drag the body to drive) for wheeled/
    // mobile-arm robots. No-op for arm-type robots.
    initBaseDrag(robot, config);
  };

  mgr.onError = (url) => {
    if (myGen !== loadGen) return;
    console.error('Manager error:', url);
    status.classList.remove('loading');
    status.textContent = 'Failed to load model assets. Check your connection and try again.';
    status.style.color = '#ff7070';
    sel.disabled = false;
  };

  const urdfURL = config.repoBase + config.urdfPath;
  console.log('Loading URDF:', urdfURL);

  loader.load(
    urdfURL,
    (urdfRobot) => {
      if (myGen !== loadGen) return;  // stale — a newer load superseded this one

      robot = urdfRobot;
      robot.traverse(c => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });

      robot.position.set(robotPose.x, robotPose.y, config.zOffset);
      robot.rotation.z = robotPose.theta;
      scene.add(robot);
      fadeRobotIn(robot, 350);
      console.log('Robot in scene:', key);
    },
    (progress) => {
      if (progress?.lengthComputable)
        console.log('URDF:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
    },
    (err) => {
      if (myGen !== loadGen) return;
      console.error('URDF error:', err);
      status.classList.remove('loading');
      status.textContent = 'Could not load robot model. Select another robot to continue.';
      status.style.color = '#ff7070';
      sel.disabled = false;
    }
  );
}

// ── Animation loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  if (robot) {
    const commands = getCommands(activeRobot.inputProfile);
    let { velX, velY, velAngular } = commands;

    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.1);
    lastTime  = now;

    const robotType = activeRobot.config.robotType;

    // Base-drag applies only to wheeled/mobile-arm robots — add its
    // contribution to the keyboard-derived command, then clamp the result
    // to the *currently configured* MAX LINEAR / MAX ANGULAR slider values
    // (not the slider's range ceiling) so drag + keys together never exceed
    // the same speed limit keyboard driving alone already respects.
    if (robotType === 'wheeled' || robotType === 'mobile-arm') {
      const linearMax  = parseFloat(document.getElementById('linearVelocitySlider').value);
      const angularMax = parseFloat(document.getElementById('angularVelocitySlider').value);
      const drag = getDragCommand(robotPose.theta, linearMax, angularMax);
      velX       += drag.velX;
      velY       += drag.velY;
      velAngular += drag.velAngular;

      const speed = Math.hypot(velX, velY);
      if (speed > linearMax) {
        const scale = linearMax / speed;
        velX *= scale;
        velY *= scale;
      }
      velAngular = Math.max(-angularMax, Math.min(angularMax, velAngular));
    }

    const mergedCommands = { ...commands, velX, velY, velAngular };

    if (robotResetAnim) {
      // Driving back to origin after a reset — interpolate the base pose
      // instead of processing normal drive commands this frame. Not subject
      // to the MAX LINEAR / MAX ANGULAR slider caps — those only govern
      // manual driving.
      const t = Math.min((now - robotResetAnim.start) / robotResetAnim.duration, 1);
      const e = easeOutCubic(t);

      const prevX     = robotPose.x;
      const prevY     = robotPose.y;
      const prevTheta = robotPose.theta;

      robotPose.x     = robotResetAnim.startX     * (1 - e);
      robotPose.y     = robotResetAnim.startY     * (1 - e);
      robotPose.theta = robotResetAnim.startTheta + robotResetAnim.deltaTheta * e;
      robot.position.set(robotPose.x, robotPose.y, activeRobot.config.zOffset);
      robot.rotation.z = robotPose.theta;

      // Derive this frame's body-frame velocity from the pose delta so the
      // wheels spin in the correct direction/speed while driving home (and,
      // for mobile-arm, the pan/tilt joints keep lerping toward their
      // already-reset slider targets via the preserved jointTargets field).
      if (dt > 0) {
        const dx    = robotPose.x     - prevX;
        const dy    = robotPose.y     - prevY;
        const cosT  = Math.cos(prevTheta);
        const sinT  = Math.sin(prevTheta);
        const driveCommands = {
          ...commands,
          velX:       (dx * cosT + dy * sinT) / dt,
          velY:       (-dx * sinT + dy * cosT) / dt,
          velAngular: (robotPose.theta - prevTheta) / dt,
        };
        activeRobot.updateJoints(robot, driveCommands, dt, activeRobot.config.kinematics);
      }

      if (t >= 1) robotResetAnim = null;

    } else if (robotType === 'arm') {
      // Arm: lerp joints toward slider targets every frame (no pose integration)
      activeRobot.updateJoints(robot, commands, dt, activeRobot.config.kinematics);

    } else if (robotType === 'mobile-arm') {
      // Mobile arm: joint lerp (pan-tilt) + wheeled pose integration, always running
      activeRobot.updateJoints(robot, mergedCommands, dt, activeRobot.config.kinematics);

      if (velX !== 0 || velY !== 0 || velAngular !== 0) {
        const cosT = Math.cos(robotPose.theta);
        const sinT = Math.sin(robotPose.theta);
        robotPose.x     += (velX * cosT - velY * sinT) * dt;
        robotPose.y     += (velX * sinT + velY * cosT) * dt;
        robotPose.theta += velAngular * dt;

        robot.position.set(robotPose.x, robotPose.y, activeRobot.config.zOffset);
        robot.rotation.z = robotPose.theta;
      }

    } else if (velX !== 0 || velY !== 0 || velAngular !== 0) {
      // Wheeled: drive-type IK + integrate body pose in world frame
      activeRobot.updateJoints(robot, mergedCommands, dt, activeRobot.config.kinematics);

      const cosT = Math.cos(robotPose.theta);
      const sinT = Math.sin(robotPose.theta);
      robotPose.x     += (velX * cosT - velY * sinT) * dt;
      robotPose.y     += (velX * sinT + velY * cosT) * dt;
      robotPose.theta += velAngular * dt;

      robot.position.set(robotPose.x, robotPose.y, activeRobot.config.zOffset);
      robot.rotation.z = robotPose.theta;
    }
  } else {
    lastTime = performance.now();
  }

  orbitControls.update();
  renderer.render(scene, camera);
}

// ── UI event wiring ────────────────────────────────────────────────────────────

// Resets the camera and the active robot back to their starting pose.
// Triggered by clicking #resetButton or pressing H (see keydown listener
// below) — H is intentionally not shown anywhere in the UI; see README.
function resetView() {
  const resetBtn = document.getElementById('resetButton');
  resetBtn.classList.add('active');

  // Smoothly animate camera back to its default position/target
  animateCameraTo(CAMERA_HOME_POSITION, CAMERA_HOME_TARGET, 500);

  // Return robot to world origin — smoothly drive back if it has a base
  // pose (wheeled / mobile-arm); pure arm robots (so101, pt101) have no
  // x/y/theta to animate, so snap those instantly as before.
  const robotType = activeRobot?.config.robotType;
  if (robot && activeRobot) {
    if (robotType === 'wheeled' || robotType === 'mobile-arm') {
      robotResetAnim = {
        start:      performance.now(),
        duration:   500,
        startX:     robotPose.x,
        startY:     robotPose.y,
        startTheta: robotPose.theta,
        deltaTheta: shortestAngleDelta(robotPose.theta, 0),
      };
    } else {
      robotPose = { x: 0, y: 0, theta: 0 };
      robot.position.set(0, 0, activeRobot.config.zOffset);
      robot.rotation.z = 0;
    }
  } else {
    robotPose = { x: 0, y: 0, theta: 0 };
  }

  // Reset input sliders to current profile defaults + clear key state
  if (activeRobot) applyProfile(activeRobot.inputProfile);
  // Reset arm joint sliders to defaults (no-op for wheeled)
  if (activeRobot?.inputProfile?.reset) activeRobot.inputProfile.reset();

  // For robots with pan-tilt or arm joints, explicitly reset joint angles
  // to their home positions (slider defaults) immediately, don't wait for lerp
  if (robot && activeRobot && (robotType === 'arm' || robotType === 'mobile-arm')) {
    // Get the default joint targets from the profile after reset
    const homeCommands = getCommands(activeRobot.inputProfile);
    if (homeCommands.jointTargets && robot.joints) {
      for (const [jointName, targetAngle] of Object.entries(homeCommands.jointTargets)) {
        const joint = robot.joints[jointName];
        if (joint) joint.setJointValue(targetAngle);
      }
    }
  }

  // Brief teal flash — remove active state once reset is complete
  setTimeout(() => resetBtn.classList.remove('active'), 400);
}

document.getElementById('resetButton').addEventListener('click', resetView);

document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key.toLowerCase() === 'h') {
    e.preventDefault();
    resetView();
  }
});

document.getElementById('robotSelect').addEventListener('change', (e) => {
  const key = e.target.value;
  // Reflect selection in the URL without reloading the page.
  // LeKiwi is the default — omit the param to keep the base URL clean.
  if (key === 'lekiwi') {
    history.replaceState(null, '', window.location.pathname);
  } else {
    history.replaceState(null, '', `?robot=${key}`);
  }
  loadRobot(key);
});


document.getElementById('infoButton').addEventListener('click', (e) => {
  e.preventDefault();
  window.open(e.currentTarget.href, '_blank', 'noopener,noreferrer');
});

document.querySelectorAll('.collapsible-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.collapsible').classList.toggle('open');
  });
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────

// URL parameter: ?robot=<key> pre-selects a robot on load.
// Default (no param or unrecognised key) → lekiwi.
const urlKey     = new URLSearchParams(window.location.search).get('robot');
const initialKey = (urlKey && ROBOTS[urlKey]) ? urlKey : 'lekiwi';
document.getElementById('robotSelect').value = initialKey;
loadRobot(initialKey);
animate();
