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
} from './input.js';

import { ROBOTS } from './robots/registry.js';

// ── Runtime state ──────────────────────────────────────────────────────────────
let robot       = null;   // active URDFRobot
let robotAxes   = null;   // axes group attached to robot
let originLine  = null;   // line from world origin → robot origin
let robotPose   = { x: 0, y: 0, theta: 0 };
let lastTime    = performance.now();
let loadGen     = 0;      // bumped on every robot switch; stale callbacks check against it
let activeRobot = null;   // reference to active entry from ROBOTS

// ── Robot loader ───────────────────────────────────────────────────────────────
function loadRobot(key) {
  const entry = ROBOTS[key];
  if (!entry) { console.error('Unknown robot key:', key); return; }

  activeRobot     = entry;
  const { config } = entry;
  const myGen     = ++loadGen;

  // Disable selector while loading to avoid rapid switching
  const sel = document.getElementById('robotSelect');
  sel.disabled = true;

  // ── Tear down previous robot ────────────────────────────────────────────────
  if (robot)      { scene.remove(robot);      robot     = null; }
  if (originLine) { scene.remove(originLine); originLine = null; }
  robotAxes = null;

  robotPose = { x: 0, y: 0, theta: 0 };

  // Reset input state and configure sliders for this robot's profile
  applyProfile(entry.inputProfile);

  // Update info card with per-robot metadata
  const aboutDesc  = document.getElementById('aboutDescription');
  const aboutGh    = document.getElementById('aboutGithub');
  const cardTitle  = document.getElementById('infoCardTitle');
  if (aboutDesc) aboutDesc.innerHTML  = entry.config.about.description;
  if (aboutGh)   aboutGh.href         = entry.config.about.githubUrl;
  if (cardTitle) cardTitle.textContent = entry.config.title.replace(' Playground', '');

  // ── Loading status ──────────────────────────────────────────────────────────
  const status = document.getElementById('loadingStatus');
  status.style.display = '';
  status.style.color   = 'rgba(255,255,255,0.6)';
  status.textContent   = 'Loading robot…';

  // ── Build a fresh loader for this robot ─────────────────────────────────────
  const mgr    = new THREE.LoadingManager();
  const loader = new URDFLoader(mgr);
  loader.fetchOptions = { mode: 'cors' };

  // Translate URDF mesh paths → fetchable URLs using per-robot resolver
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
    status.textContent = '✓ Robot loaded';
    setTimeout(() => { if (myGen === loadGen) status.style.display = 'none'; }, 2000);
    sel.disabled = false;
  };

  mgr.onError = (url) => {
    if (myGen !== loadGen) return;
    console.error('Manager error:', url);
    status.textContent = '⚠️ Error: Check console';
    status.style.color = '#ff5555';
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

      // Origin trail line (updated every frame while robot moves)
      originLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, 0),
        ]),
        new THREE.LineBasicMaterial({ color: 0x83e3e2 })
      );
      originLine.visible = axesHelper.visible;
      scene.add(originLine);

      robot.position.set(0, 0, config.zOffset);
      scene.add(robot);
      console.log('Robot in scene:', key);
    },
    (progress) => {
      if (progress?.lengthComputable)
        console.log('URDF:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
    },
    (err) => {
      if (myGen !== loadGen) return;
      const msg = err?.message || 'Failed to load robot model';
      console.error('URDF error:', err);
      status.textContent = '⚠️ Error: ' + msg;
      status.style.color = '#ff5555';
      sel.disabled = false;
    }
  );
}

// ── Animation loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  if (robot) {
    // getCommands() enforces E-stop internally — returns zero commands when active
    const commands = getCommands(activeRobot.inputProfile);
    const { velX, velY, velAngular } = commands;

    if (velX !== 0 || velY !== 0 || velAngular !== 0) {
      const now = performance.now();
      const dt  = (now - lastTime) / 1000;
      lastTime  = now;

      // Drive-type-specific wheel IK — each robot module handles its own joints
      activeRobot.updateJoints(robot, commands, dt, activeRobot.config.kinematics);

      // Integrate body pose in world frame
      const cosT = Math.cos(robotPose.theta);
      const sinT = Math.sin(robotPose.theta);
      robotPose.x     += (velX * cosT - velY * sinT) * dt;
      robotPose.y     += (velX * sinT + velY * cosT) * dt;
      robotPose.theta += velAngular * dt;

      robot.position.set(robotPose.x, robotPose.y, activeRobot.config.zOffset);
      robot.rotation.z = robotPose.theta;

      // Update origin → robot trail
      if (originLine) {
        const p = originLine.geometry.attributes.position.array;
        p[0] = 0;             p[1] = 0;             p[2] = 0;
        p[3] = robotPose.x;   p[4] = robotPose.y;   p[5] = 0;
        originLine.geometry.attributes.position.needsUpdate = true;
      }
    } else {
      lastTime = performance.now();
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
  // Reset camera to default position
  camera.position.set(0.6, -0.6, 0.3);
  orbitControls.target.set(0, 0, 0.06);
  orbitControls.update();

  // Return robot to world origin
  robotPose = { x: 0, y: 0, theta: 0 };
  if (robot && activeRobot) {
    robot.position.set(0, 0, activeRobot.config.zOffset);
    robot.rotation.z = 0;
  }

  // Reset input sliders to current profile defaults + clear key state
  if (activeRobot) applyProfile(activeRobot.inputProfile);

  // Restore axes + grid visibility
  axesHelper.visible = true;
  if (robotAxes)  robotAxes.visible  = true;
  if (originLine) originLine.visible = true;
  gridHelper.visible = true;

  document.getElementById('axesButton').classList.add('active');
  document.getElementById('gridButton').classList.add('active');
});

document.getElementById('robotSelect').addEventListener('change', (e) => {
  loadRobot(e.target.value);
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

loadRobot('lekiwi');
animate();
