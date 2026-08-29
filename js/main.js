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
import { initJointDrag } from './interaction/jointDrag.js';

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

// ── Runtime state ──────────────────────────────────────────────────────────────
let robot       = null;   // active URDFRobot
let originLine  = null;   // line from world origin → robot origin
let robotPose   = { x: 0, y: 0, theta: 0 };
let lastTime    = performance.now();
let loadGen     = 0;      // bumped on every robot switch; stale callbacks check against it
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
  if (robot)      { fadeRobotOut(robot, 200); robot = null; }
  if (originLine) { scene.remove(originLine); originLine = null; }

  robotPose = nextPose;

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

    // Register (or clear) draggable joints for this robot. Passing null for
    // non-arm types also cancels any leftover registration from a previous
    // arm robot, so stale mesh references never get raycast against.
    initJointDrag(config.robotType === 'arm' ? robot : null);
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

      // Origin trail line — only for mobile robots that translate in the world
      if (config.robotType === 'wheeled') {
        originLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(robotPose.x, robotPose.y, 0),
          ]),
          new THREE.LineBasicMaterial({ color: 0x00b8d9 })
        );
        scene.add(originLine);
      }

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
    const { velX, velY, velAngular } = commands;

    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.1);
    lastTime  = now;

    if (activeRobot.config.robotType === 'arm') {
      // Arm: lerp joints toward slider targets every frame (no pose integration)
      activeRobot.updateJoints(robot, commands, dt, activeRobot.config.kinematics);

    } else if (activeRobot.config.robotType === 'mobile-arm') {
      // Mobile arm: joint lerp (pan-tilt) + wheeled pose integration, always running
      activeRobot.updateJoints(robot, commands, dt, activeRobot.config.kinematics);

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
      activeRobot.updateJoints(robot, commands, dt, activeRobot.config.kinematics);

      const cosT = Math.cos(robotPose.theta);
      const sinT = Math.sin(robotPose.theta);
      robotPose.x     += (velX * cosT - velY * sinT) * dt;
      robotPose.y     += (velX * sinT + velY * cosT) * dt;
      robotPose.theta += velAngular * dt;

      robot.position.set(robotPose.x, robotPose.y, activeRobot.config.zOffset);
      robot.rotation.z = robotPose.theta;

      if (originLine) {
        const p = originLine.geometry.attributes.position.array;
        p[0] = 0;           p[1] = 0;           p[2] = 0;
        p[3] = robotPose.x; p[4] = robotPose.y; p[5] = 0;
        originLine.geometry.attributes.position.needsUpdate = true;
      }
    }
  } else {
    lastTime = performance.now();
  }

  orbitControls.update();
  renderer.render(scene, camera);
}

// ── UI event wiring ────────────────────────────────────────────────────────────

document.getElementById('resetButton').addEventListener('click', () => {
  const resetBtn = document.getElementById('resetButton');
  resetBtn.classList.add('active');

  // Reset camera to default position
  camera.position.set(0.75, -0.75, 0.35);
  orbitControls.target.set(0, 0, 0.06);
  orbitControls.update();

  // Return robot to world origin
  robotPose = { x: 0, y: 0, theta: 0 };
  if (robot && activeRobot) {
    robot.position.set(0, 0, activeRobot.config.zOffset);
    robot.rotation.z = 0;
  }

  // Collapse the origin trail line back to a zero-length point
  if (originLine) {
    const p = originLine.geometry.attributes.position.array;
    p[0] = 0; p[1] = 0; p[2] = 0;
    p[3] = 0; p[4] = 0; p[5] = 0;
    originLine.geometry.attributes.position.needsUpdate = true;
  }

  // Reset input sliders to current profile defaults + clear key state
  if (activeRobot) applyProfile(activeRobot.inputProfile);
  // Reset arm joint sliders to defaults (no-op for wheeled)
  if (activeRobot?.inputProfile?.reset) activeRobot.inputProfile.reset();

  // Brief teal flash — remove active state once reset is complete
  setTimeout(() => resetBtn.classList.remove('active'), 400);
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
