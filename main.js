import * as THREE from 'https://unpkg.com/three@0.150.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.150.0/examples/jsm/controls/OrbitControls.js';
import {
  World,
  Body,
  Box,
  Sphere,
  Vec3,
  NaiveBroadphase
} from 'https://cdn.skypack.dev/cannon-es';

// --- Global Variables ---
let scene, camera, renderer, controls;
let world;
let objectsToUpdate = [];
let playerMesh, playerBody;
let playerVolume, playerMass, playerRadius;

// Constants
const GROUND_SIZE = 40;
const NUM_OBJECTS = 50; // Number of random city objects

// --- Setup Three.js Scene ---
scene = new THREE.Scene();
scene.background = new THREE.Color(0x202124);

// Setup camera
camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 15, 25);

// Setup renderer
renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// OrbitControls (for debug and mobile-friendly navigation)
controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- Setup Cannon-es Physics World ---
world = new World({
  gravity: new Vec3(0, -9.82, 0)
});
world.broadphase = new NaiveBroadphase();
world.solver.iterations = 10;

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// --- Create Ground ---
(function createGround() {
  // Cannon ground body
  const groundShape = new Box(new Vec3(GROUND_SIZE * 0.5, 0.2, GROUND_SIZE * 0.5));
  const groundBody = new Body({
    mass: 0, // static
    position: new Vec3(0, -0.2, 0),
    shape: groundShape
  });
  world.addBody(groundBody);
  
  // Three.js ground mesh
  const groundGeometry = new THREE.BoxGeometry(GROUND_SIZE, 0.4, GROUND_SIZE);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.receiveShadow = true;
  groundMesh.position.copy(groundBody.position);
  scene.add(groundMesh);
})();

// --- Create City Objects (Collectable Items) ---
function createCityObject() {
  // Randomly choose between box and sphere
  const isSphere = Math.random() > 0.5;
  let mesh, body, size, volume, mass;
  // Random position on the ground (avoid center a bit)
  const posX = (Math.random() - 0.5) * (GROUND_SIZE - 4);
  const posZ = (Math.random() - 0.5) * (GROUND_SIZE - 4);
  const posY = 1; // slight elevation
  
  if (isSphere) {
    // Sphere object
    const radius = Math.random() * 0.5 + 0.2; // between 0.2 and 0.7
    size = radius;
    volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
    mass = volume * 0.5; // arbitrary density factor
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(posX, posY, posZ);
    
    body = new Body({
      mass: mass,
      position: new Vec3(posX, posY, posZ),
      shape: new Sphere(radius)
    });
  } else {
    // Box object
    const width = Math.random() * 0.8 + 0.2;
    const height = Math.random() * 0.8 + 0.2;
    const depth = Math.random() * 0.8 + 0.2;
    size = (width + height + depth) / 3;
    volume = width * height * depth;
    mass = volume * 0.5;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(posX, posY, posZ);
    
    body = new Body({
      mass: mass,
      position: new Vec3(posX, posY, posZ),
      shape: new Box(new Vec3(width * 0.5, height * 0.5, depth * 0.5))
    });
  }
  // Mark as collectable and store properties for later use
  body.userData = {
    collectable: true,
    size: size,       // representative linear size
    volume: volume,   // volume of the object
    collected: false  // flag to prevent multiple collection
  };
  
  world.addBody(body);
  scene.add(mesh);
  objectsToUpdate.push({ mesh, body });
}

// Generate multiple city objects
for (let i = 0; i < NUM_OBJECTS; i++) {
  createCityObject();
}

// --- Create Player Ball ---
function createPlayerBall() {
  // Initial player ball properties
  playerRadius = 0.5;
  playerVolume = (4 / 3) * Math.PI * Math.pow(playerRadius, 3);
  playerMass = 2; // starting mass
  const geometry = new THREE.SphereGeometry(playerRadius, 32, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0055 });
  playerMesh = new THREE.Mesh(geometry, material);
  playerMesh.castShadow = true;
  // Start a bit above ground
  playerMesh.position.set(0, playerRadius + 0.1, 0);
  scene.add(playerMesh);
  
  playerBody = new Body({
    mass: playerMass,
    position: new Vec3(0, playerRadius + 0.1, 0),
    shape: new Sphere(playerRadius)
  });
  world.addBody(playerBody);
}
createPlayerBall();

// --- Utility: Replace Player's Physics Body ---
// When the ball collects an object, we want to update its mass and size.
function updatePlayerBody(newRadius, newMass) {
  // Preserve old state
  const oldBody = playerBody;
  const oldPos = oldBody.position.clone();
  const oldVel = oldBody.velocity.clone();
  
  // Remove the old body
  world.removeBody(oldBody);
  
  // Create new body with updated radius and mass, retaining position and velocity
  const newBody = new Body({
    mass: newMass,
    position: oldPos,
    shape: new Sphere(newRadius)
  });
  newBody.velocity.copy(oldVel);
  
  world.addBody(newBody);
  playerBody = newBody;
  
  // Update visual mesh geometry by scaling (for simplicity, scale the mesh)
  // Note: In a more rigorous approach, we could replace geometry entirely.
  const scaleFactor = newRadius / playerRadius;
  playerMesh.scale.multiplyScalar(scaleFactor);
  
  // Update global playerRadius, playerMass, and playerVolume
  playerRadius = newRadius;
  playerMass = newMass;
  // newVolume is computed externally then assigned to playerVolume
}

// --- Player Collision Handling ---
// When player's ball collides, check if the other object qualifies to be collected.
playerBody.addEventListener('collide', (event) => {
  // Identify the collided body (the one that isn't the player)
  const contact = event.contact;
  let otherBody = contact.bi.id === playerBody.id ? contact.bj : contact.bi;
  
  // Only process if the otherBody is marked as collectable and not already collected
  if (otherBody.userData && otherBody.userData.collectable && !otherBody.userData.collected) {
    // Check if object's size and mass is smaller than player's ball (simple criteria)
    if (otherBody.userData.size < playerRadius && otherBody.mass < playerMass) {
      // Mark as collected so it's only processed once
      otherBody.userData.collected = true;
      
      // Find the associated mesh and remove from physics simulation
      const updateIndex = objectsToUpdate.findIndex(obj => obj.body === otherBody);
      if (updateIndex !== -1) {
        const obj = objectsToUpdate[updateIndex];
        // Remove physics body from world
        world.removeBody(otherBody);
        // Remove the object from the update list
        objectsToUpdate.splice(updateIndex, 1);
        // Attach the mesh to the player ball visually so it sticks
        playerMesh.add(obj.mesh);
        // Adjust its position relative to the player mesh
        const worldPos = obj.mesh.position.clone();
        playerMesh.worldToLocal(worldPos);
        obj.mesh.position.copy(worldPos);
        
        // Increase player's ball size and mass based on the object's volume and mass
        const collectedVolume = otherBody.userData.volume;
        const newVolume = playerVolume + collectedVolume;
        // Calculate new radius from volume: volume = (4/3)*pi*r^3
        const newRadius = Math.cbrt(newVolume * (3 / (4 * Math.PI)));
        const newMass = playerMass + otherBody.mass;
        playerVolume = newVolume;
        
        // Update player's physics body and mesh accordingly
        updatePlayerBody(newRadius, newMass);
      }
    }
  }
});

// --- Swipe / Drag Controls ---
// Handle both touch and mouse events for swipe detection.
// The swipe impulse is applied to the player's physics body.
let swipeStart = null;
let swipeEnd = null;
const impulseFactor = 0.05;

function onSwipeStart(event) {
  if (event.touches && event.touches.length > 0) {
    swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  } else {
    swipeStart = { x: event.clientX, y: event.clientY };
  }
}

function onSwipeEnd(event) {
  if (!swipeStart) return;
  if (event.changedTouches && event.changedTouches.length > 0) {
    swipeEnd = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  } else {
    swipeEnd = { x: event.clientX, y: event.clientY };
  }
  const deltaX = swipeEnd.x - swipeStart.x;
  const deltaY = swipeEnd.y - swipeStart.y;
  // Apply impulse in the XZ plane. Note: In screen space, Y increases downward so we invert it.
  const impulse = new Vec3(deltaX * impulseFactor, 0, -deltaY * impulseFactor);
  playerBody.applyImpulse(impulse, playerBody.position);
  
  swipeStart = null;
  swipeEnd = null;
}

renderer.domElement.addEventListener('touchstart', onSwipeStart, false);
renderer.domElement.addEventListener('touchend', onSwipeEnd, false);
renderer.domElement.addEventListener('mousedown', onSwipeStart, false);
renderer.domElement.addEventListener('mouseup', onSwipeEnd, false);

// --- Animation Loop ---
const clock = new THREE.Clock();
function animate() {
  const deltaTime = clock.getDelta();
  
  // Step the physics simulation
  world.step(1 / 60, deltaTime, 3);
  
  // Sync meshes with their corresponding physics bodies for city objects
  objectsToUpdate.forEach(obj => {
    obj.mesh.position.copy(obj.body.position);
    obj.mesh.quaternion.copy(obj.body.quaternion);
  });
  
  // Sync player's ball mesh with its physics body position and quaternion.
  playerMesh.position.copy(playerBody.position);
  playerMesh.quaternion.copy(playerBody.quaternion);
  
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// --- Responsive Resizing ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});