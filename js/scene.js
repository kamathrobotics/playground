/**
 * scene.js — Three.js scene, camera, renderer, lighting, grid, and axes.
 *
 * Created once at startup and shared across all robot switches.
 * THREE is available as a global from the classic <script> tag in index.html.
 */

// ── Scene + background ───────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);  // deep charcoal

// ── Panel offset ─────────────────────────────────────────────────────────────
// The control panel is fixed at left:20px, width:220px → right edge at 240px.
// setViewOffset shifts the camera frustum left by half this amount so the robot
// at world origin appears centred in the visible area to the right of the panel.
// The canvas still covers the full screen — only the projection is offset.
// If the panel width ever changes, update this constant to match.
const PANEL_OFFSET = 240; // px

// ── Camera (Z-up / ROS convention) ───────────────────────────────────────────
export const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
camera.position.set(0.75, -0.75, 0.35);
camera.up.set(0, 0, 1);

// ── Renderer ─────────────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ── Orbit controls ───────────────────────────────────────────────────────────
export const orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.target.set(0, 0, 0.06);
orbitControls.screenSpacePanning = false;

// ── Lighting ─────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight1.position.set(2, 2, 8);
dirLight1.castShadow = true;
dirLight1.shadow.mapSize.width  = 2048;
dirLight1.shadow.mapSize.height = 2048;
dirLight1.shadow.camera.near   = 0.1;
dirLight1.shadow.camera.far    = 20;
dirLight1.shadow.camera.left   = -1;
dirLight1.shadow.camera.right  =  1;
dirLight1.shadow.camera.top    =  1;
dirLight1.shadow.camera.bottom = -1;
dirLight1.shadow.bias = -0.0001;
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
dirLight2.position.set(-1, -1, 3);
scene.add(dirLight2);

// ── Infinite shader grid ─────────────────────────────────────────────────────
const gridGeometry = new THREE.PlaneGeometry(100, 100);
const gridMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: {
    uScale:     { value: 0.1 },
    uDivisions: { value: 10 },
    uColor:     { value: new THREE.Color(0x1a806e) },  // subtle turquoise grid on dark bg
    uDistance:  { value: 100 },
  },
  transparent: true,
  vertexShader: `
    varying vec3 worldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      worldPosition = worldPos.xyz;
      gl_Position   = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    varying vec3 worldPosition;
    uniform float uScale;
    uniform float uDivisions;
    uniform vec3  uColor;
    uniform float uDistance;

    float getGrid(float size) {
      vec2 coord = worldPosition.xy / size;
      vec2 grid  = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
      float line = min(grid.x, grid.y);
      return 1.0 - min(line, 1.0);
    }

    void main() {
      float d    = distance(cameraPosition, worldPosition);
      float g1   = getGrid(uScale);
      float g2   = getGrid(uScale * uDivisions);
      float grid = max(g1 * 0.3, g2 * 0.6);
      float fade = 1.0 - smoothstep(0.0, uDistance, d);
      grid *= fade;
      gl_FragColor = vec4(uColor, grid * 0.5);
      if (gl_FragColor.a < 0.01) discard;
    }
  `,
});

export const gridHelper = new THREE.Mesh(gridGeometry, gridMaterial);
gridHelper.position.z = 0;
gridHelper.visible    = true;
scene.add(gridHelper);

// Shadow-receiving ground plane (slightly above grid to avoid z-fighting)
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.ShadowMaterial({ opacity: 0.3 })
);
shadowPlane.position.z  = 0.001;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// ── Axes helper factory ───────────────────────────────────────────────────────
// ROS convention: X = red (forward), Y = green (left), Z = blue (up)
export function createAxesHelper(size) {
  const axes = new THREE.Group();

  const makeLine = (dx, dy, dz, color) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(dx, dy, dz),
    ]);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  };

  axes.add(makeLine(size, 0,    0,    0xff0000));  // X — red
  axes.add(makeLine(0,    size, 0,    0x00ff00));  // Y — green
  axes.add(makeLine(0,    0,    size, 0x0000ff));  // Z — blue

  return axes;
}

// World-origin axes (always visible at the scene origin)
export const axesHelper = createAxesHelper(0.125);
axesHelper.visible = true;
scene.add(axesHelper);

// ── View offset — keeps robot centred in available area at any screen size ────
function applyViewOffset() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Negative x shifts the frustum leftward, moving world origin rightward on
  // screen by PANEL_OFFSET/2 px — centering it between the panel and right edge.
  camera.setViewOffset(w, h, -PANEL_OFFSET / 2, 0, w, h);
}
applyViewOffset();

// ── Resize handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyViewOffset();
});
