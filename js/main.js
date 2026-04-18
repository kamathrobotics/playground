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
  gridHelper,
  axesHelper,
  createAxesHelper,
} from './scene.js';

import {
  getCommands,
  applyProfile,
  resetInput,
  resetEstop,
} from './input.js';

import { ROBOTS } from './robots/registry.js';

// ── Fade helpers ───────────────────────────────────────────────────────────────
function glitchRobotOut(target, duration) {
  target.traverse(c => {
    if (c.isMesh && c.material) { c.material.transparent = true; c.material.needsUpdate = true; }
  });
  const start = performance.now();
  (function step() {
    const elapsed = performance.now() - start;
    const t       = Math.min(elapsed / duration, 1);
    const freq    = 6 + t * 20;
    const flicker = Math.sin(elapsed * freq * 0.01) > 0 ? 1 : 0;
    const dropout = Math.random() > 0.96 ? 0 : 1;
    target.traverse(c => {
      if (c.isMesh && c.material)
        c.material.opacity = (1 - t * 0.9) * flicker * dropout;
    });
    if (t < 1) requestAnimationFrame(step);
    else scene.remove(target);
  })();
}

function glitchRobotIn(target, duration) {
  // Capture original emissive values — never touch material.color
  const origEmissive = new Map();
  target.traverse(c => {
    if (c.isMesh && c.material && c.material.emissive)
      origEmissive.set(c.uuid, c.material.emissive.getHex());
  });

  target.traverse(c => {
    if (c.isMesh && c.material) {
      c.material.transparent = true;
      c.material.opacity     = 0;
      c.material.wireframe   = true;
      if (c.material.emissive) c.material.emissive.setHex(0x003030);
      c.material.needsUpdate = true;
    }
  });
  const start = performance.now();
  (function step() {
    const elapsed = performance.now() - start;
    const t       = Math.min(elapsed / duration, 1);

    if (t < 0.2) {
      // Phase 1 — wireframe with teal emissive glow, flickering in
      const flicker = Math.sin(elapsed * 0.18) > 0 ? 0.85 : 0.15;
      target.traverse(c => {
        if (!c.isMesh || !c.material) return;
        c.material.wireframe = true;
        c.material.opacity   = flicker;
        if (c.material.emissive) c.material.emissive.setHex(0x003030);
      });
    } else if (t < 0.72) {
      // Phase 2 — solid materialisation with emissive corruption flickers
      const lt            = (t - 0.2) / 0.52;
      const freq          = 16 - lt * 10;
      const flicker       = Math.sin(elapsed * freq * 0.01) > -0.1 ? 1 : 0;
      const glitchEmissive = [0x002222, 0x110000, 0x001111, 0x000000];
      target.traverse(c => {
        if (!c.isMesh || !c.material) return;
        c.material.wireframe = false;
        c.material.opacity   = lt * flicker;
        if (c.material.emissive)
          c.material.emissive.setHex(
            Math.random() > 0.85
              ? glitchEmissive[Math.floor(Math.random() * glitchEmissive.length)]
              : 0x000000
          );
      });
    } else {
      // Phase 3 — settle, restore original emissive
      const lt = (t - 0.72) / 0.28;
      target.traverse(c => {
        if (!c.isMesh || !c.material) return;
        c.material.wireframe = false;
        c.material.opacity   = 0.75 + lt * 0.25;
        if (c.material.emissive)
          c.material.emissive.setHex(origEmissive.get(c.uuid) ?? 0x000000);
      });
    }

    if (t < 1) requestAnimationFrame(step);
    else target.traverse(c => {
      if (c.isMesh && c.material) {
        c.material.transparent = false;
        c.material.opacity     = 1;
        c.material.wireframe   = false;
        if (c.material.emissive)
          c.material.emissive.setHex(origEmissive.get(c.uuid) ?? 0x000000);
        c.material.needsUpdate = true;
      }
    });
  })();
}

// ── Runtime state ──────────────────────────────────────────────────────────────
let robot       = null;   // active URDFRobot
let robotAxes   = null;   // axes group attached to robot
let originLine  = null;   // line from world origin → robot origin
let robotPose   = { x: 0, y: 0, theta: 0 };
let telemVel    = { vx: 0, vy: 0, omega: 0 };
let currentJointAngles = {};  // updated by arm updateJoints each frame; used by arm telemetry
const TELEM_SMOOTH = 0.2;
let lastTime    = performance.now();
let loadGen     = 0;      // bumped on every robot switch; stale callbacks check against it
let activeRobot = null;   // reference to active entry from ROBOTS


// ── Robot loader ───────────────────────────────────────────────────────────────
function loadRobot(key) {
  const entry = ROBOTS[key];
  if (!entry) { console.error('Unknown robot key:', key); return; }

  // Capture outgoing robot type before overwriting activeRobot
  const prevRobot = activeRobot;
  const sameType  = prevRobot !== null &&
                    !!prevRobot.config.robotType &&
                    prevRobot.config.robotType === entry.config.robotType;

  // Snapshot pose/vel — persist if same type, zero otherwise
  const nextPose = sameType ? { ...robotPose } : { x: 0, y: 0, theta: 0 };
  const nextVel  = sameType ? { ...telemVel  } : { vx: 0, vy: 0, omega: 0 };

  activeRobot     = entry;
  const { config } = entry;
  const myGen     = ++loadGen;

  // Update page title to reflect selected robot
  document.title = config.title + ' — Kamath Robotics';

  // Close info card when switching robots
  document.getElementById('infoCard').classList.remove('visible');
  document.getElementById('infoButton').classList.remove('active');

  // Disable selector while loading to avoid rapid switching
  const sel = document.getElementById('robotSelect');
  sel.disabled = true;

  // ── Tear down previous robot ────────────────────────────────────────────────
  if (robot)      { glitchRobotOut(robot, 250); robot = null; }
  if (originLine) { scene.remove(originLine); originLine = null; }
  robotAxes = null;

  robotPose = nextPose;
  telemVel  = nextVel;

  // Render telemetry section for this robot's profile
  if (config.telemetry) renderTelemetry(config.telemetry);
  else hideTelemetry();

  // Reset input state and configure sliders for this robot's profile
  applyProfile(entry.inputProfile);

  // Reset arm slider values to defaults (no-op for wheeled profiles)
  if (entry.inputProfile.reset) entry.inputProfile.reset();

  // Show/hide control groups based on robot type
  const controlsId = config.controlsId ?? (config.robotType === 'arm' ? 'arm-controls' : 'wheeled-controls');
  document.getElementById('wheeled-controls').style.display   = controlsId === 'wheeled-controls'  ? '' : 'none';
  document.getElementById('arm-controls').style.display       = controlsId === 'arm-controls'      ? '' : 'none';
  document.getElementById('pantilt-controls').style.display   = controlsId === 'pantilt-controls'  ? '' : 'none';

  // Clear joint angle state on every robot switch
  currentJointAngles = {};

  if (!sameType) resetEstop();

  // Update info card with per-robot metadata
  const aboutDesc  = document.getElementById('aboutDescription');
  const aboutGh    = document.getElementById('aboutGithub');
  const cardTitle  = document.getElementById('infoCardTitle');
  if (aboutDesc) aboutDesc.innerHTML  = entry.config.about.description;
  if (aboutGh)   aboutGh.href         = entry.config.about.githubUrl;
  if (cardTitle) cardTitle.textContent = entry.config.title.replace(' Playground', '');

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

      // Attach per-robot axes helper
      // For elevated robots (zOffset > 0) we push axes down so they sit at Z = 0
      robotAxes            = createAxesHelper(0.125);
      robotAxes.position.z = -config.zOffset;
      robotAxes.visible    = axesHelper.visible;
      robot.add(robotAxes);

      // Origin trail line — only for mobile robots that translate in the world
      if (config.robotType === 'wheeled') {
        originLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(robotPose.x, robotPose.y, 0),
          ]),
          new THREE.LineBasicMaterial({ color: 0x5dd4bf })
        );
        originLine.visible = axesHelper.visible;
        scene.add(originLine);
      }

      robot.position.set(robotPose.x, robotPose.y, config.zOffset);
      robot.rotation.z = robotPose.theta;
      scene.add(robot);
      glitchRobotIn(robot, 450);
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

// ── Telemetry rendering ────────────────────────────────────────────────────────
let activeTelemFields = [];  // [{span, getValue}] — rebuilt on each robot load

function renderTelemetry(telConfig) {
  document.getElementById('telem-icon').textContent = telConfig.icon;

  const container = document.getElementById('telemetry');
  container.innerHTML = '';
  activeTelemFields = [];

  // Build grid template: label col (auto) + value col (fixed width) per field
  const colTemplate = telConfig.colWidths.flatMap(w => ['auto', w]).join(' ');
  container.style.gridTemplateColumns = colTemplate;
  container.style.gridTemplateRows = `repeat(${telConfig.rows.length}, auto)`;

  for (const row of telConfig.rows) {
    for (const field of row) {
      const label = document.createElement('span');
      label.className = 'tl';
      label.textContent = field.label + ':';

      const value = document.createElement('span');
      value.className = 'tv';
      value.textContent = '—';

      container.appendChild(label);
      container.appendChild(value);
      activeTelemFields.push({ span: value, getValue: field.getValue });
    }
  }
}

function hideTelemetry() {
  document.getElementById('telem-icon').textContent = '';
  const container = document.getElementById('telemetry');
  container.innerHTML = '';
  activeTelemFields = [];
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
      const result = activeRobot.updateJoints(robot, commands, dt, activeRobot.config.kinematics);
      if (result && Object.keys(result).length) currentJointAngles = result;

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

    // ── Telemetry update (every frame while robot is loaded) ────────────────
    telemVel.vx    += TELEM_SMOOTH * (velX       - telemVel.vx);
    telemVel.vy    += TELEM_SMOOTH * (velY       - telemVel.vy);
    telemVel.omega += TELEM_SMOOTH * (velAngular - telemVel.omega);

    if (activeTelemFields.length) {
      const state = { pose: robotPose, vel: telemVel, joints: currentJointAngles };
      for (const field of activeTelemFields) field.span.textContent = field.getValue(state);
    }
  } else {
    lastTime = performance.now();
  }

  orbitControls.update();
  renderer.render(scene, camera);
}

// ── UI event wiring ────────────────────────────────────────────────────────────

document.getElementById('axesButton').addEventListener('click', (e) => {
  e.target.classList.toggle('active');
  const v = e.target.classList.contains('active');
  axesHelper.visible = v;
  if (robotAxes)  robotAxes.visible  = v;
  if (originLine) originLine.visible = v;
});

document.getElementById('gridButton').addEventListener('click', (e) => {
  e.target.classList.toggle('active');
  gridHelper.visible = e.target.classList.contains('active');
});

document.getElementById('resetButton').addEventListener('click', () => {
  const resetBtn = document.getElementById('resetButton');
  resetBtn.classList.add('active');

  // Reset camera to default position
  camera.position.set(0.75, -0.75, 0.35);
  orbitControls.target.set(0, 0, 0.06);
  orbitControls.update();

  // Return robot to world origin
  robotPose = { x: 0, y: 0, theta: 0 };
  currentJointAngles = {};
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

  // Restore axes + grid visibility
  axesHelper.visible = true;
  if (robotAxes)  robotAxes.visible  = true;
  if (originLine) originLine.visible = true;
  gridHelper.visible = true;

  document.getElementById('axesButton').classList.add('active');
  document.getElementById('gridButton').classList.add('active');

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

document.querySelectorAll('.collapsible-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.collapsible').classList.toggle('open');
  });
});

// ── Info card (robot popover) ───────────────────────────────────────────────
const infoCard    = document.getElementById('infoCard');
const infoButton  = document.getElementById('infoButton');
const infoClose   = document.getElementById('infoCardClose');

infoButton.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = infoCard.classList.toggle('visible');
  infoButton.classList.toggle('active', open);
});

infoClose.addEventListener('click', () => {
  infoCard.classList.remove('visible');
  infoButton.classList.remove('active');
});

document.addEventListener('click', (e) => {
  if (!infoCard.contains(e.target) && e.target !== infoButton) {
    infoCard.classList.remove('visible');
    infoButton.classList.remove('active');
  }
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────
document.getElementById('axesButton').classList.add('active');
document.getElementById('gridButton').classList.add('active');

// URL parameter: ?robot=<key> pre-selects a robot on load.
// Default (no param or unrecognised key) → lekiwi.
const urlKey     = new URLSearchParams(window.location.search).get('robot');
const initialKey = (urlKey && ROBOTS[urlKey]) ? urlKey : 'lekiwi';
document.getElementById('robotSelect').value = initialKey;
loadRobot(initialKey);
animate();
