import * as THREE from 'three';

/**
 * Shared geometries & materials — created once, reused everywhere
 * (keeps draw calls and memory low).
 */

export const MAT = {
  grass: new THREE.MeshStandardMaterial({ color: '#7ec850', roughness: 1 }),
  grassDark: new THREE.MeshStandardMaterial({ color: '#5da83f', roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ color: '#3f4756', roughness: 0.9 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: '#c9cdd6', roughness: 0.9 }),
  plaza: new THREE.MeshStandardMaterial({ color: '#e8dcc8', roughness: 0.95 }),
  concrete: new THREE.MeshStandardMaterial({ color: '#e9e2d5', roughness: 0.9 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({
    color: '#9fc8e8',
    roughness: 0.08,
    metalness: 0.4,
    transparent: true,
    opacity: 0.45,
  }),
  glassDark: new THREE.MeshStandardMaterial({
    color: '#6ea8cf',
    roughness: 0.08,
    metalness: 0.4,
    transparent: true,
    opacity: 0.55,
  }),
  wood: new THREE.MeshStandardMaterial({ color: '#b08954', roughness: 0.8 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#7a5a34', roughness: 0.85 }),
  white: new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.85 }),
  black: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: '#8b93a1', roughness: 0.35, metalness: 0.7 }),
  screen: new THREE.MeshStandardMaterial({
    color: '#0f172a',
    emissive: '#38bdf8',
    emissiveIntensity: 0.9,
    roughness: 0.2,
  }),
  screenWarm: new THREE.MeshStandardMaterial({
    color: '#1c1917',
    emissive: '#fbbf24',
    emissiveIntensity: 0.7,
    roughness: 0.2,
  }),
  water: new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  }),
  poolDeck: new THREE.MeshStandardMaterial({ color: '#e0d9c8', roughness: 0.95 }),
  fieldGreen: new THREE.MeshStandardMaterial({ color: '#4caf50', roughness: 1 }),
  lineWhite: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
  trunk: new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#3e9b4f', roughness: 1 }),
  leaf2: new THREE.MeshStandardMaterial({ color: '#5cb85c', roughness: 1 }),
  roof: new THREE.MeshStandardMaterial({ color: '#5b6b7f', roughness: 0.7 }),
  roofAccent: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.6 }),
  sofa: new THREE.MeshStandardMaterial({ color: '#7c8a99', roughness: 0.95 }),
  sofaOrange: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.95 }),
  plant: new THREE.MeshStandardMaterial({ color: '#2f9e44', roughness: 1 }),
  pot: new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.9 }),
  lampPole: new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.5, metalness: 0.5 }),
  lampGlow: new THREE.MeshStandardMaterial({
    color: '#fef3c7',
    emissive: '#fde68a',
    emissiveIntensity: 1.2,
  }),
  fountainWater: new THREE.MeshStandardMaterial({
    color: '#7dd3fc',
    roughness: 0.1,
    transparent: true,
    opacity: 0.8,
  }),
  ballWhite: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
};

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 24, 18),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
  cone: new THREE.ConeGeometry(1, 1, 12),
};
