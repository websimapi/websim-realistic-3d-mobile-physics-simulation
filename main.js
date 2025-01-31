import * as THREE from 'https://unpkg.com/three@0.150.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.150.0/examples/jsm/controls/OrbitControls.js';
import { World, Body, Box, Sphere, Vec3, NaiveBroadphase } from 'https://cdn.skypack.dev/cannon-es';

// Setup Three.js scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202124);

// Setup camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 5, 10);

// Setup renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// OrbitControls for mobile friendly navigation (touch support built-in)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Add lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

// Setup Cannon-es physics world with initial gravity (user can control via UI)
const world = new World({
  gravity: new Vec3(0, -9.82, 0)
});
world.broadphase = new NaiveBroadphase();
world.solver.iterations = 10;

// Keep track of objects to sync Three.js mesh with Cannon body
const objectsToUpdate = [];

// Create the ground (static)
const groundShape = new Box(new Vec3(10, 0.1, 10));
const groundBody = new Body({
  mass: 0, // Static body
  position: new Vec3(0, -0.1, 0),
  shape: groundShape,
});
world.addBody(groundBody);

const groundGeometry = new THREE.BoxGeometry(20, 0.2, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.receiveShadow = true;
groundMesh.position.copy(groundBody.position);
scene.add(groundMesh);

// Helper function: create a box
function createBox({ width = 1, height = 1, depth = 1, position = { x: 0, y: 5, z: 0 }, color = 0xff0055 } = {}) {
  // Three.js mesh
  const boxGeometry = new THREE.BoxGeometry(width, height, depth);
  const boxMaterial = new THREE.MeshStandardMaterial({ color });
  const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
  boxMesh.castShadow = true;
  boxMesh.position.set(position.x, position.y, position.z);
  scene.add(boxMesh);

  // Cannon body
  const boxShape = new Box(new Vec3(width * 0.5, height * 0.5, depth * 0.5));
  const boxBody = new Body({
    mass: 1,
    position: new Vec3(position.x, position.y, position.z),
    shape: boxShape,
  });
  world.addBody(boxBody);

  objectsToUpdate.push({
    mesh: boxMesh,
    body: boxBody,
  });
}

// Helper function: create a sphere
function createSphere({ radius = 0.5, position = { x: 0, y: 5, z: 0 }, color = 0x55aaff } = {}) {
  // Three.js mesh
  const sphereGeometry = new THREE.SphereGeometry(radius, 32, 32);
  const sphereMaterial = new THREE.MeshStandardMaterial({ color });
  const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphereMesh.castShadow = true;
  sphereMesh.position.set(position.x, position.y, position.z);
  scene.add(sphereMesh);

  // Cannon body
  const sphereShape = new Sphere(radius);
  const sphereBody = new Body({
    mass: 1,
    position: new Vec3(position.x, position.y, position.z),
    shape: sphereShape,
  });
  world.addBody(sphereBody);

  objectsToUpdate.push({
    mesh: sphereMesh,
    body: sphereBody,
  });
}

// Generate random objects for added realism in simulation
let spawnInterval = 1500; // in milliseconds
function spawnRandomObject() {
  const type = Math.random() > 0.5 ? 'box' : 'sphere';
  const x = (Math.random() - 0.5) * 8;
  const y = 5 + Math.random() * 2;
  const z = (Math.random() - 0.5) * 8;
  if (type === 'box') {
    const width = 0.5 + Math.random() * 1;
    const height = 0.5 + Math.random() * 1;
    const depth = 0.5 + Math.random() * 1;
    const color = Math.random() * 0xffffff;
    createBox({ width, height, depth, position: { x, y, z }, color });
  } else {
    const radius = 0.3 + Math.random() * 0.5;
    const color = Math.random() * 0xffffff;
    createSphere({ radius, position: { x, y, z }, color });
  }
}

// Start spawning objects (the interval can be adjusted via the control panel)
let spawnIntervalID = setInterval(spawnRandomObject, spawnInterval);

// Animation loop
const clock = new THREE.Clock();
function animate() {
  const deltaTime = clock.getDelta();

  // Step the physics world
  world.step(1 / 60, deltaTime, 3);

  // Update mesh positions and rotations from physics simulation
  objectsToUpdate.forEach((obj) => {
    obj.mesh.position.copy(obj.body.position);
    obj.mesh.quaternion.copy(obj.body.quaternion);
  });

  // Update controls (for inertia and damping)
  controls.update();

  // Render scene
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}
animate();

// Responsive resizing for mobile
window.addEventListener('resize', () => {
  // Update camera aspect ratio and renderer size
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// User Interface: Allowing more creative control over the scene
// Gravity control
const gravitySlider = document.getElementById('gravity-slider');
if (gravitySlider) {
  gravitySlider.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    // Gravity acts in the negative y direction
    world.gravity.set(0, -value, 0);
  });
}

// Spawn interval control
const spawnIntervalInput = document.getElementById('spawn-interval');
if (spawnIntervalInput) {
  spawnIntervalInput.addEventListener('change', (event) => {
    const newInterval = parseInt(event.target.value, 10);
    clearInterval(spawnIntervalID);
    spawnInterval = newInterval;
    spawnIntervalID = setInterval(spawnRandomObject, spawnInterval);
  });
}

// Spawn object button for manual control
const spawnButton = document.getElementById('spawn-button');
if (spawnButton) {
  spawnButton.addEventListener('click', () => {
    spawnRandomObject();
  });
}