import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function makeTexture(kind, base, detail, roughness = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  let seed = kind.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0) + 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  if (kind === 'brick') {
    for (let row = 0; row < 12; row += 1) {
      const y = row * 22;
      context.fillStyle = '#bcad9e'; context.fillRect(0, y, 256, 3);
      const offset = row % 2 ? -18 : 0;
      for (let x = offset; x < 256; x += 50) {
        context.fillStyle = ['#a84c38', '#b65b43', '#99503f', '#c16d50'][Math.floor(random() * 4)];
        context.fillRect(x + 2, y + 3, 47, 18);
        for (let i = 0; i < 4; i += 1) { context.fillStyle = `rgba(75,42,31,${random() * 0.14})`; context.fillRect(x + random() * 46, y + 4 + random() * 13, 3, 2); }
      }
    }
  } else if (kind === 'wood') {
    for (let row = 0; row < 46; row += 1) {
      context.strokeStyle = `rgba(42,24,15,${0.08 + random() * 0.18})`;
      context.lineWidth = 1 + random() * 2;
      context.beginPath(); context.moveTo(0, row * 6 + random() * 3); context.bezierCurveTo(65, row * 6 - 4, 150, row * 6 + 5, 256, row * 6 + random() * 3); context.stroke();
    }
  } else {
    for (let i = 0; i < 900; i += 1) {
      const alpha = 0.025 + random() * 0.16;
      context.fillStyle = `rgba(${detail},${alpha})`;
      const size = kind === 'soil' ? 1 + random() * 5 : 1 + random() * 2;
      context.fillRect(random() * 256, random() * 256, size, size);
    }
    if (kind === 'concrete' || kind === 'paving') {
      context.strokeStyle = 'rgba(35,38,36,.2)'; context.lineWidth = 2;
      for (let y = 64; y < 256; y += 64) { context.beginPath(); context.moveTo(0, y); context.lineTo(256, y); context.stroke(); }
      for (let x = 64; x < 256; x += 64) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 256); context.stroke(); }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(roughness, roughness);
  texture.anisotropy = 4;
  return texture;
}

function createMaterials() {
  const concrete = makeTexture('concrete', '#aaa69d', '42,42,38');
  const brick = makeTexture('brick', '#a95741', '50,35,25', 1.4);
  const soil = makeTexture('soil', '#72533c', '42,28,17', 5);
  const stucco = makeTexture('stucco', '#d8d1c2', '55,52,45', 2);
  const pavers = makeTexture('paving', '#9c9a91', '30,30,27', 3);
  const wood = makeTexture('wood', '#79533a', '35,23,15', 1);
  const grass = makeTexture('grass', '#607955', '30,44,23', 6);
  return {
    concrete: new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92 }),
    rawConcrete: new THREE.MeshStandardMaterial({ map: concrete, roughness: 1, color: '#b9b4aa' }),
    brick: new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 }),
    stucco: new THREE.MeshStandardMaterial({ map: stucco, roughness: 0.86, color: '#eee9dc' }),
    accent: new THREE.MeshStandardMaterial({ color: '#383c3e', roughness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 }),
    darkWood: new THREE.MeshStandardMaterial({ map: wood, color: '#8b715e', roughness: 0.72 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#a8d2df', roughness: 0.12, metalness: 0.22, transparent: true, opacity: 0.58, transmission: 0.25, thickness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: '#343a3b', metalness: 0.78, roughness: 0.27 }),
    soil: new THREE.MeshStandardMaterial({ map: soil, roughness: 1 }),
    paving: new THREE.MeshStandardMaterial({ map: pavers, roughness: 0.94 }),
    lawn: new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f6b42', roughness: 0.95 }),
    leafLight: new THREE.MeshStandardMaterial({ color: '#668353', roughness: 0.92 }),
    warmLight: new THREE.MeshStandardMaterial({ color: '#ffd38b', emissive: '#f39a3e', emissiveIntensity: 2.2 }),
    white: new THREE.MeshStandardMaterial({ color: '#e5dfd1', roughness: 0.5 }),
  };
}

function addBox(group, materials, material, position, size, detail = 1) {
  const geometry = new THREE.BoxGeometry(...size, detail, 1, 1);
  const mesh = new THREE.Mesh(geometry, materials[material]);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCylinder(group, material, position, radius, height, radial = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, height, radial), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addTree(group, materials, x, z, scale = 1) {
  addCylinder(group, materials.wood, [x, 0.8 * scale, z], 0.16 * scale, 1.6 * scale, 7);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 * scale, 2), materials.leafLight);
  crown.position.set(x, 2.2 * scale, z); crown.castShadow = true; crown.receiveShadow = true; group.add(crown);
  for (let i = 0; i < 3; i += 1) {
    const clump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48 * scale, 1), materials.leaf);
    clump.position.set(x + (i - 1) * 0.42 * scale, (2.25 + (i % 2) * 0.36) * scale, z + (i % 2) * 0.34 * scale);
    clump.castShadow = true; group.add(clump);
  }
}

function buildHouse(group, step, materials) {
  const completed = (n) => step >= n;
  // The plot, street edge, excavations and accumulated building materials remain in the same world.
  addBox(group, materials, 'soil', [0, -0.3, 0], [22, 0.5, 19]);
  addBox(group, materials, 'paving', [0, -0.03, 9.4], [22, 0.1, 1.2]);
  if (step < 3) {
    for (const [x, z, r] of [[-8, -5, 0.6], [7, -5, 0.45], [-8, 5, 0.35], [8, 1, 0.5]]) {
      const weed = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r, 5), materials.leaf);
      weed.position.set(x, r / 2, z); group.add(weed);
    }
  }
  // A small, persistent construction laydown area anchors the work to a real site.
  if (step >= 2 && step < 58) {
    for (let i = 0; i < 4; i += 1) addBox(group, materials, 'brick', [-7.0 + (i % 2) * 0.65, 0.22 + Math.floor(i / 2) * 0.42, -5.1], [0.58, 0.38, 1.0]);
    addBox(group, materials, 'wood', [-6.7, 0.07, -3.5], [1.9, 0.11, 0.8]);
    if (step < 40) for (let i = 0; i < 5; i += 1) {
      const bar = addCylinder(group, materials.steel, [-5.2 + i * 0.13, 0.35, -4.8], 0.025, 2.5, 8);
      bar.rotation.z = Math.PI / 2;
    }
  }
  if (step >= 4 && step < 10) {
    for (let x = -4.5; x <= 4.6; x += 3) addBox(group, materials, 'soil', [x, -0.05, 0], [0.8, 0.25, 6.1]);
  }
  if (completed(5)) addBox(group, materials, 'rawConcrete', [0, 0.04, 0], [9.8, 0.22, 6.8]);
  if (completed(6) && !completed(7)) {
    for (const [x, z] of [[-4.4, -2.9], [0, -2.9], [4.4, -2.9], [-4.4, 2.9], [0, 2.9], [4.4, 2.9]]) {
      for (let i = 0; i < 4; i += 1) addCylinder(group, materials.steel, [x + (i % 2) * 0.22, 0.43 + Math.floor(i / 2) * 0.2, z], 0.025, 1.1, 8).rotation.z = Math.PI / 2;
      for (const y of [0.32, 0.54]) addBox(group, materials, 'steel', [x, y, z], [0.48, 0.025, 0.48]);
    }
  }
  if (completed(7)) {
    for (const x of [-4.4, 0, 4.4]) for (const z of [-2.9, 2.9]) {
      addBox(group, materials, 'concrete', [x, 0.28, z], [1.15, 0.36, 1.15]);
      addBox(group, materials, 'rawConcrete', [x, 0.58, z], [0.54, 0.55, 0.54]);
    }
  }
  if (completed(8)) addBox(group, materials, 'concrete', [0, 0.45, 0], [10, 0.34, 7]);
  if (completed(9)) addBox(group, materials, 'soil', [0, 0.28, 0], [9.25, 0.08, 6.25]);
  if (completed(10)) addBox(group, materials, 'rawConcrete', [0, 0.68, 0], [9.6, 0.18, 6.6]);
  if (completed(11)) for (const [x, z] of [[-4.3, -2.8], [0, -2.8], [4.3, -2.8], [-4.3, 2.8], [0, 2.8], [4.3, 2.8]]) {
    for (let i = 0; i < 4; i += 1) addCylinder(group, materials.steel, [x + (i - 1.5) * 0.07, 1.3, z], 0.022, 2.8, 8);
  }
  if (completed(12) && !completed(13)) for (const [x, z] of [[-4.3, -2.8], [0, -2.8], [4.3, -2.8], [-4.3, 2.8], [0, 2.8], [4.3, 2.8]]) {
    addBox(group, materials, 'wood', [x, 1.8, z + 0.27], [0.58, 2.6, 0.07]);
    addBox(group, materials, 'wood', [x, 1.8, z - 0.27], [0.58, 2.6, 0.07]);
  }
  if (completed(13)) {
    for (const x of [-4.3, 0, 4.3]) for (const z of [-2.8, 2.8]) addBox(group, materials, 'concrete', [x, 2.05, z], [0.42, 2.7, 0.42]);
  }
  if (completed(14)) for (let z = -2.8; z <= 2.81; z += 5.6) for (let y = 3.05; y < 3.4; y += 0.1) addCylinder(group, materials.steel, [0, y, z], 0.022, 8.5, 8).rotation.z = Math.PI / 2;
  if (completed(15)) {
    addBox(group, materials, 'concrete', [0, 3.38, -2.8], [9, 0.42, 0.4]);
    addBox(group, materials, 'concrete', [0, 3.38, 2.8], [9, 0.42, 0.4]);
    addBox(group, materials, 'concrete', [-4.3, 3.38, 0], [0.4, 0.42, 5.6]);
    addBox(group, materials, 'concrete', [4.3, 3.38, 0], [0.4, 0.42, 5.6]);
  }
  if (completed(16) && !completed(18)) for (let x = -4; x <= 4; x += 1.3) for (let z = -2.5; z <= 2.6; z += 1.3) addCylinder(group, materials.wood, [x, 1.95, z], 0.07, 3.5, 8);
  if (completed(17) && !completed(18)) {
    for (let x = -4.2; x <= 4.21; x += 0.46) addBox(group, materials, 'steel', [x, 3.55, 0], [0.025, 0.025, 5.9]);
    for (let z = -2.8; z <= 2.81; z += 0.46) addBox(group, materials, 'steel', [0, 3.56, z], [8.6, 0.025, 0.025]);
  }
  if (completed(18)) addBox(group, materials, 'rawConcrete', [0, 3.64, 0], [9.8, 0.32, 6.8]);
  if (completed(19) && !completed(20)) addBox(group, materials, 'white', [0, 3.83, 0], [9.6, 0.025, 6.6]);
  if (step >= 20) {
    const wallMaterial = completed(58) ? 'stucco' : completed(55) ? 'rawConcrete' : 'brick';
    // Front and rear elevations have deliberate door and glazing openings.
    addBox(group, materials, wallMaterial, [-3.25, 1.9, 2.9], [2.5, 2.35, 0.22]);
    addBox(group, materials, wallMaterial, [0.3, 1.9, 2.9], [2.5, 2.35, 0.22]);
    addBox(group, materials, wallMaterial, [3.5, 1.9, 2.9], [1.65, 2.35, 0.22]);
    addBox(group, materials, wallMaterial, [0, 1.9, -2.9], [8.8, 2.35, 0.22]);
    addBox(group, materials, wallMaterial, [-4.4, 1.9, 0], [0.22, 2.35, 5.8]);
    addBox(group, materials, wallMaterial, [4.4, 1.9, 0], [0.22, 2.35, 5.8]);
    if (completed(21)) addBox(group, materials, 'concrete', [1.7, 3.12, 2.9], [1.55, 0.18, 0.32]);
    if (completed(22)) addBox(group, materials, 'brick', [-3.3, 2.95, 3.12], [2.6, 0.12, 0.14]);
    if (completed(23)) addBox(group, materials, 'brick', [-2.9, 1.9, -2.0], [0.14, 2.35, 1.7]);
    if (completed(24)) {
      addBox(group, materials, completed(48) ? 'stucco' : 'brick', [-1.2, 1.9, 0.2], [0.14, 2.35, 5.3]);
      addBox(group, materials, completed(48) ? 'stucco' : 'brick', [2.5, 1.9, -0.7], [3.4, 2.35, 0.14]);
    }
  }
  // Stair remains visible through the front glazing and open entry.
  if (completed(25)) for (let i = 0; i < 9; i += 1) addBox(group, materials, 'concrete', [-3.35 + i * 0.34, 0.85 + i * 0.27, -0.1], [1.3, 0.18, 1.45]);
  if (completed(65)) for (let i = 0; i < 9; i += 1) addBox(group, materials, 'wood', [-3.35 + i * 0.34, 0.96 + i * 0.27, 0.28], [1.25, 0.075, 0.85]);
  if (completed(66)) {
    addBox(group, materials, 'wood', [-4.0, 2.2, 0.45], [0.08, 2.3, 0.08]);
    for (let i = 0; i < 8; i += 1) addBox(group, materials, 'steel', [-3.75 + i * 0.28, 1.35 + i * 0.27, 0.45], [0.045, 0.55, 0.045]);
  }

  if (completed(26)) {
    for (const x of [-4.3, 0, 4.3]) for (const z of [-2.8, 2.8]) addBox(group, materials, 'concrete', [x, 5.35, z], [0.42, 3.1, 0.42]);
  }
  if (completed(27) && !completed(28)) for (const [x, z] of [[-4.3, -2.8], [0, -2.8], [4.3, -2.8], [-4.3, 2.8], [0, 2.8], [4.3, 2.8]]) {
    addBox(group, materials, 'wood', [x, 5.3, z + 0.27], [0.58, 2.8, 0.07]);
    addBox(group, materials, 'wood', [x, 5.3, z - 0.27], [0.58, 2.8, 0.07]);
  }
  if (completed(30)) {
    for (const z of [-2.8, 2.8]) addBox(group, materials, 'concrete', [0, 6.85, z], [9, 0.42, 0.4]);
    for (const x of [-4.3, 4.3]) addBox(group, materials, 'concrete', [x, 6.85, 0], [0.4, 0.42, 5.6]);
  }
  if (completed(31) && !completed(33)) for (let x = -4.6; x <= 4.61; x += 1.15) for (let z = -2.8; z <= 2.81; z += 1.15) addCylinder(group, materials.wood, [x, 5.1, z], 0.06, 4.1, 8);
  if (completed(32) && !completed(33)) {
    for (let x = -4.2; x <= 4.21; x += 0.5) addBox(group, materials, 'steel', [x, 7.0, 0], [0.025, 0.025, 5.8]);
    for (let z = -2.8; z <= 2.81; z += 0.5) addBox(group, materials, 'steel', [0, 7.01, z], [8.5, 0.025, 0.025]);
  }
  if (completed(33)) addBox(group, materials, 'concrete', [0, 7.16, 0], [9.8, 0.34, 6.8]);
  if (completed(34)) {
    const wallMaterial = completed(58) ? 'stucco' : completed(55) ? 'rawConcrete' : 'brick';
    addBox(group, materials, wallMaterial, [-3.2, 5.2, 2.9], [2.4, 2.55, 0.22]);
    addBox(group, materials, wallMaterial, [0.1, 5.2, 2.9], [2.25, 2.55, 0.22]);
    addBox(group, materials, wallMaterial, [3.4, 5.2, 2.9], [1.8, 2.55, 0.22]);
    addBox(group, materials, wallMaterial, [0, 5.2, -2.9], [8.8, 2.55, 0.22]);
    addBox(group, materials, wallMaterial, [-4.4, 5.2, 0], [0.22, 2.55, 5.8]);
    addBox(group, materials, wallMaterial, [4.4, 5.2, 0], [0.22, 2.55, 5.8]);
    if (completed(35)) {
      addBox(group, materials, completed(49) ? 'stucco' : 'brick', [-1.1, 5.2, 0.2], [0.14, 2.55, 5.3]);
      addBox(group, materials, completed(49) ? 'stucco' : 'brick', [2.5, 5.2, -0.8], [3.4, 2.55, 0.14]);
    }
  }
  if (completed(36)) for (const [x, z] of [[-3.15, 2.9], [0.2, 2.9], [3.2, 2.9], [-2.9, -2.9], [0.4, -2.9], [3.4, -2.9]]) addBox(group, materials, 'concrete', [x, 6.45, z], [1.4, 0.16, 0.28]);
  if (completed(37)) {
    addBox(group, materials, 'brick', [-4.3, 7.85, 0], [0.24, 1.05, 6.3]);
    addBox(group, materials, 'brick', [4.3, 7.85, 0], [0.24, 1.05, 6.3]);
    addBox(group, materials, 'brick', [0, 7.85, -2.9], [8.8, 1.05, 0.22]);
    addBox(group, materials, 'brick', [0, 7.85, 2.9], [8.8, 1.05, 0.22]);
  }
  if (completed(39)) addBox(group, materials, 'stucco', [0, 7.36, 0], [9.5, 0.05, 6.5]);
  if (completed(38)) for (const x of [-4.2, 4.2]) addBox(group, materials, 'steel', [x, 7.0, 3.05], [0.1, 0.65, 0.1]);
  if (completed(40)) addBox(group, materials, 'stucco', [0, 7.39, 0], [9.2, 0.1, 6.2]);
  if (completed(41)) {
    for (const [x, y] of [[-3.2, 2], [0.35, 2], [3.35, 2]]) {
      const frameY = y + 0.3;
      addBox(group, materials, 'steel', [x, frameY, 3.035], [1.15, 1.55, 0.12]);
      if (completed(42)) addBox(group, materials, 'glass', [x, frameY, 3.105], [0.98, 1.38, 0.035]);
      addBox(group, materials, 'steel', [x, frameY, 3.14], [0.045, 1.5, 0.06]);
      addBox(group, materials, 'steel', [x, frameY, 3.15], [1.1, 0.045, 0.06]);
      addBox(group, materials, 'concrete', [x, y - 0.53, 3.08], [1.42, 0.14, 0.42]);
    }
  }
  if (completed(62)) {
    for (const [x, y] of [[-3.15, 5.2], [0.25, 5.2], [3.25, 5.2]]) {
      const frameY = y + 0.3;
      addBox(group, materials, 'steel', [x, frameY, 3.035], [1.15, 1.55, 0.12]);
      if (completed(63)) addBox(group, materials, 'glass', [x, frameY, 3.105], [0.98, 1.38, 0.035]);
      addBox(group, materials, 'steel', [x, frameY, 3.14], [0.045, 1.5, 0.06]);
      addBox(group, materials, 'steel', [x, frameY, 3.15], [1.1, 0.045, 0.06]);
      addBox(group, materials, 'concrete', [x, y - 0.53, 3.08], [1.42, 0.14, 0.42]);
    }
  }
  if (completed(43)) {
    addBox(group, materials, 'darkWood', [1.68, 1.62, 3.02], [1.14, 2.1, 0.15]);
    addBox(group, materials, 'wood', [1.68, 1.62, 3.11], [0.92, 1.9, 0.04]);
    addCylinder(group, materials.warmLight, [2.04, 1.64, 3.15], 0.045, 0.045, 10).rotation.x = Math.PI / 2;
  }
  if (completed(44)) {
    for (const [x, y, z] of [[-3.0, 1.8, 3.0], [-0.2, 1.8, 3.0], [3.0, 1.8, 3.0], [-3.0, 5.2, 3.0], [-0.2, 5.2, 3.0], [3.0, 5.2, 3.0]]) {
      addBox(group, materials, 'wood', [x, y, z], [0.1, 2.1, 0.12]);
      addBox(group, materials, 'wood', [x + 0.92, y, z], [0.1, 2.1, 0.12]);
    }
  }
  if (completed(64)) {
    addBox(group, materials, 'darkWood', [1.7, 5.15, 3.01], [1.15, 2.15, 0.14]);
    addBox(group, materials, 'glass', [1.42, 5.15, 3.09], [0.45, 1.86, 0.035]);
  }
  if (completed(45)) for (const [x, y] of [[-4.31, 1.4], [-4.31, 2.0], [4.31, 1.4], [4.31, 5.4]]) addBox(group, materials, 'steel', [x, y, -1.8], [0.04, 0.08, 2.0]);
  if (completed(46)) {
    addBox(group, materials, 'steel', [4.53, 2.2, -2.35], [0.11, 3.2, 0.11]);
    addBox(group, materials, 'steel', [4.53, 5.6, -2.35], [0.11, 2.4, 0.11]);
  }
  if (completed(47)) {
    addBox(group, materials, 'paving', [3.2, 1.04, 0.7], [1.8, 0.05, 1.8]);
    addBox(group, materials, 'paving', [3.2, 4.25, 0.7], [1.8, 0.05, 1.8]);
  }
  // A flat-roofed contemporary Indian facade with a deep charcoal fascia and balcony.
  if (completed(58)) {
    addBox(group, materials, 'accent', [0, 3.05, 3.15], [9.2, 0.16, 0.25]);
    addBox(group, materials, 'accent', [0, 6.45, 3.15], [9.2, 0.16, 0.25]);
    addBox(group, materials, 'accent', [0, 7.54, 0], [10.05, 0.35, 7.1]);
    addBox(group, materials, 'concrete', [0, 2.98, 3.16], [2.6, 0.34, 0.36]);
  }
  if (completed(60)) {
    addBox(group, materials, 'concrete', [1.4, 3.35, 4.3], [5.2, 0.24, 2.5]);
    if (completed(61)) {
      addBox(group, materials, 'steel', [1.4, 4.0, 5.48], [5.05, 0.06, 0.06]);
      for (let x = -1; x <= 4; x += 1) addBox(group, materials, 'glass', [x + 0.4, 3.7, 5.48], [0.82, 0.55, 0.035]);
      for (let x = -1; x <= 4; x += 1) addBox(group, materials, 'steel', [x + 0.4, 3.7, 5.52], [0.035, 0.65, 0.06]);
    }
  }
  if (completed(20)) {
    // Interior floors remain visible from the open front at this architectural cutaway angle.
    addBox(group, materials, 'wood', [0, 0.85, 0.35], [8.15, 0.09, 5.1]);
    if (completed(51)) addBox(group, materials, 'paving', [0, 0.94, 0.35], [8.15, 0.035, 5.1]);
    if (completed(18)) addBox(group, materials, 'wood', [0, 4.0, 0], [8.5, 0.13, 5.8]);
    if (completed(52)) addBox(group, materials, 'wood', [0, 4.1, 0], [8.5, 0.05, 5.8]);
    if (completed(50)) {
      addBox(group, materials, 'rawConcrete', [0, 0.98, 0.35], [8.1, 0.08, 5.0]);
      addBox(group, materials, 'rawConcrete', [0, 4.15, 0], [8.4, 0.07, 5.7]);
    }
    if (completed(53)) {
      addBox(group, materials, 'paving', [3.2, 1.07, 0.7], [1.75, 0.035, 1.75]);
      addBox(group, materials, 'paving', [3.2, 4.28, 0.7], [1.75, 0.035, 1.75]);
    }
    if (completed(54)) for (const y of [1.1, 4.31]) for (let z = -0.1; z <= 1.5; z += 0.4) addBox(group, materials, 'white', [2.32, y, z], [0.025, 0.025, 0.025]);
  }
  if (completed(57)) addBox(group, materials, 'accent', [3.8, 2.0, 3.16], [0.6, 2.1, 0.18]);
  if (completed(68)) {
    for (let i = 0; i < 4; i += 1) addBox(group, materials, 'wood', [-3.3 + i * 0.53, 1.25, -2.25], [0.5, 0.68, 0.55]);
    addBox(group, materials, 'accent', [-2.5, 1.64, -2.25], [2.25, 0.12, 0.64]);
  }
  if (completed(67)) addBox(group, materials, 'accent', [-2.5, 1.12, -2.85], [2.3, 0.16, 0.6]);
  if (completed(69)) {
    addBox(group, materials, 'white', [3.4, 1.18, 0.55], [0.55, 0.2, 0.48]);
    addCylinder(group, materials.white, [3.4, 1.42, 0.55], 0.23, 0.12, 18);
    addBox(group, materials, 'white', [3.7, 4.45, 0.55], [0.55, 0.2, 0.48]);
  }
  if (completed(70)) for (const [x, y, z] of [[-4.12, 1.45, 1.7], [4.13, 1.5, -1.5], [-4.13, 5.2, 1.7]]) addBox(group, materials, 'white', [x, y, z], [0.06, 0.14, 0.16]);
  if (completed(71)) for (const [x, z] of [[-2.8, -1.6], [1.2, -1.6], [-2.8, 1.4], [1.2, 1.4]]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), materials.warmLight); light.position.set(x, 2.95, z); group.add(light);
  }
  if (completed(73)) for (const x of [-0.7, 0.8, 2.3]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), materials.warmLight); light.position.set(x, 3.2, 4.15); group.add(light);
  }
  if (completed(74)) for (const x of [-4.55, 4.55]) addBox(group, materials, 'steel', [x, 3.8, -2.5], [0.12, 7.2, 0.12]);
  if (completed(75)) for (const x of [-4.9, 4.9]) {
    addBox(group, materials, 'accent', [x, 5.15, -1.2], [0.75, 1.05, 1.3]);
    addBox(group, materials, 'steel', [x, 5.16, -0.5], [0.82, 1.08, 0.08]);
  }
  if (completed(76)) for (const x of [-3.2, 0.35, 3.35]) {
    addBox(group, materials, 'accent', [x, 2.85, 3.35], [1.55, 0.13, 0.78]);
    addBox(group, materials, 'accent', [x, 6.05, 3.35], [1.55, 0.13, 0.78]);
  }
  if (completed(77)) for (let x = -3.7; x <= 3.7; x += 1.1) addBox(group, materials, 'paving', [x, 7.43, 0], [0.95, 0.09, 5.7]);
  if (completed(78)) addBox(group, materials, 'stucco', [-3.55, 8.65, -1.8], [1.5, 2.35, 1.65]);
  if (completed(79)) {
    addBox(group, materials, 'steel', [0, 8.13, 0], [8.65, 0.08, 0.08]);
    for (let x = -4; x <= 4; x += 0.8) addBox(group, materials, 'steel', [x, 7.85, 0], [0.06, 0.65, 0.06]);
  }
  if (completed(80)) for (const [x, y] of [[-4.56, 3.1], [4.56, 3.1], [-4.56, 6.2], [4.56, 6.2]]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.1), materials.warmLight); light.position.set(x, y, 3.03); group.add(light);
  }
  if (completed(91)) {
    addBox(group, materials, 'accent', [-1.3, 1.22, -0.55], [2.7, 0.52, 0.9]);
    addBox(group, materials, 'wood', [-1.3, 1.58, -0.55], [2.65, 0.28, 0.84]);
    addBox(group, materials, 'wood', [-1.3, 1.18, 0.45], [1.3, 0.11, 0.72]);
  }
  if (completed(92)) {
    addBox(group, materials, 'darkWood', [-1.3, 1.02, -1.12], [2.4, 0.48, 0.16]);
    addBox(group, materials, 'accent', [-1.3, 2.05, -1.2], [1.5, 0.85, 0.08]);
  }
  if (completed(93)) {
    addBox(group, materials, 'darkWood', [3.2, 1.25, -1.75], [1.7, 0.42, 2.2]);
    addBox(group, materials, 'white', [3.2, 1.5, -1.75], [1.62, 0.14, 2.1]);
  }
  if (completed(94)) {
    addBox(group, materials, 'darkWood', [1.9, 4.42, -1.7], [2.3, 0.5, 2.5]);
    addBox(group, materials, 'white', [1.9, 4.72, -1.7], [2.2, 0.13, 2.4]);
  }
  if (completed(95)) {
    addBox(group, materials, 'wood', [-2.8, 1.38, 2], [1.5, 0.14, 0.95]);
    for (const x of [-3.3, -2.3]) for (const z of [1.65, 2.35]) addBox(group, materials, 'accent', [x, 1.0, z], [0.1, 0.65, 0.1]);
  }
  if (completed(96)) {
    addBox(group, materials, 'white', [-4.05, 1.2, -2.4], [0.6, 1.35, 0.65]);
    addBox(group, materials, 'accent', [-3.15, 1.8, -2.85], [0.62, 0.42, 0.42]);
  }
  if (completed(81)) {
    addBox(group, materials, 'stucco', [0, 0.8, -8.2], [20, 1.6, 0.36]);
    addBox(group, materials, 'stucco', [-9.8, 0.8, -1.2], [0.36, 1.6, 13.6]);
    addBox(group, materials, 'stucco', [9.8, 0.8, -1.2], [0.36, 1.6, 13.6]);
    addBox(group, materials, 'stucco', [-7.5, 0.8, 5.8], [4.7, 1.6, 0.36]);
    addBox(group, materials, 'stucco', [7.5, 0.8, 5.8], [4.7, 1.6, 0.36]);
    addBox(group, materials, 'accent', [0, 0.8, -8.0], [20.1, 0.12, 0.48]);
  }
  if (completed(82)) {
    addBox(group, materials, 'steel', [0, 1.1, 5.86], [4.2, 1.8, 0.16]);
    for (let x = -1.8; x <= 1.8; x += 0.4) addBox(group, materials, 'accent', [x, 1.1, 5.95], [0.07, 1.65, 0.08]);
    for (const x of [-2, 2]) addBox(group, materials, 'concrete', [x, 1.3, 5.82], [0.16, 2.25, 0.2]);
  }
  if (completed(83)) addBox(group, materials, 'soil', [0, 0.015, 7.4], [4.1, 0.08, 4.0]);
  if (completed(84)) addBox(group, materials, 'paving', [0, 0.08, 7.4], [4.0, 0.13, 3.8]);
  if (completed(85)) {
    for (let z = 4.6; z <= 8.4; z += 0.9) addBox(group, materials, 'white', [3.2, 0.1, z], [0.85, 0.14, 0.55]);
  }
  if (completed(86)) for (const x of [-6.7, 6.7]) addBox(group, materials, 'wood', [x, 0.1, -2], [2.6, 0.13, 1.5]);
  if (completed(87)) {
    addBox(group, materials, 'lawn', [-6.7, 0.02, 1.5], [3.3, 0.09, 6]);
    addBox(group, materials, 'lawn', [6.7, 0.02, 1.5], [3.3, 0.09, 6]);
  }
  if (completed(88)) { addTree(group, materials, -7.2, 1.7, 1.1); addTree(group, materials, 7.1, 1.5, 0.95); }
  if (completed(89)) {
    for (let i = 0; i < 11; i += 1) addCylinder(group, materials.leafLight, [-8 + i * 1.55, 0.34, 4.7], 0.26, 0.62, 7);
  }
  if (completed(90)) {
    const mailbox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.4), materials.accent);
    mailbox.position.set(-4.8, 0.55, 5.7); mailbox.castShadow = true; group.add(mailbox);
  }
  if (completed(90) || completed(72)) {
    for (const [x, z] of [[-3, 7.3], [3, 7.3], [-8.7, -4], [8.7, -4]]) {
      addBox(group, materials, 'steel', [x, 0.58, z], [0.1, 1.1, 0.1]);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), materials.warmLight); lamp.position.set(x, 1.18, z); group.add(lamp);
    }
  }
  if (completed(97)) {
    addBox(group, materials, 'white', [-3.2, 2.1, 3.02], [0.8, 1.75, 0.025]);
    addBox(group, materials, 'wood', [-2.2, 2.08, 3.02], [0.42, 0.7, 0.12]);
  }
  if (completed(98)) {
    addBox(group, materials, 'steel', [1.0, 3.7, 4.15], [0.75, 0.08, 0.65]);
    for (const x of [0.65, 1.35]) for (const z of [3.85, 4.45]) addBox(group, materials, 'steel', [x, 3.48, z], [0.06, 0.45, 0.06]);
    addBox(group, materials, 'accent', [2.2, 3.75, 4.55], [0.32, 0.6, 0.3]);
  }
  if (completed(100)) {
    addBox(group, materials, 'accent', [0, 0.12, 9.96], [22, 0.16, 0.08]);
  }
}

export default function HouseConstructionScene({ step = 0 }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const stepRef = useRef(step);
  const [sceneError, setSceneError] = useState('');
  stepRef.current = step;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer;
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#c7d4d5');
      scene.fog = new THREE.Fog('#c7d4d5', 28, 58);
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
      const target = new THREE.Vector3(0, 3.1, 0);
      let radius = 24; let azimuth = 0.78; let elevation = 0.37;
      const placeCamera = () => {
        elevation = THREE.MathUtils.clamp(elevation, 0.12, 1.05);
        radius = THREE.MathUtils.clamp(radius, 15, 37);
        camera.position.set(target.x + radius * Math.sin(azimuth) * Math.cos(elevation), target.y + radius * Math.sin(elevation), target.z + radius * Math.cos(azimuth) * Math.cos(elevation));
        camera.lookAt(target);
      };
      placeCamera();
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      host.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight('#eaf3f4', '#695d4d', 2.15));
      const sun = new THREE.DirectionalLight('#fff1d7', 3.1);
      sun.position.set(-9, 18, 12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -17; sun.shadow.camera.right = 17; sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
      scene.add(sun);
      const fill = new THREE.DirectionalLight('#c4d9ed', 1.0); fill.position.set(10, 10, -10); scene.add(fill);
      const materials = createMaterials();
      sceneRef.current = { scene, camera, renderer, materials, placeCamera, radius, azimuth, elevation };
      let houseGroup;
      const redrawHouse = () => {
        if (houseGroup) {
          scene.remove(houseGroup);
          houseGroup.traverse((item) => { if (item.geometry) item.geometry.dispose(); });
        }
        houseGroup = new THREE.Group();
        buildHouse(houseGroup, stepRef.current, materials);
        scene.add(houseGroup);
        renderer.render(scene, camera);
      };
      sceneRef.current.redrawHouse = redrawHouse;
      const resize = () => {
        const width = Math.max(host.clientWidth, 1); const height = Math.max(host.clientHeight, 280);
        camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); renderer.render(scene, camera);
      };
      const observer = new ResizeObserver(resize); observer.observe(host); resize(); redrawHouse();
      let dragging = false; let previousX = 0; let previousY = 0;
      const onPointerDown = (event) => { dragging = true; previousX = event.clientX; previousY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
      const onPointerMove = (event) => { if (!dragging) return; azimuth -= (event.clientX - previousX) * 0.006; elevation += (event.clientY - previousY) * 0.004; previousX = event.clientX; previousY = event.clientY; placeCamera(); renderer.render(scene, camera); };
      const onPointerUp = () => { dragging = false; };
      const onWheel = (event) => { event.preventDefault(); radius *= event.deltaY > 0 ? 1.08 : 0.93; placeCamera(); renderer.render(scene, camera); };
      sceneRef.current.zoom = (direction) => { radius *= direction > 0 ? 0.82 : 1.22; placeCamera(); renderer.render(scene, camera); };
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointercancel', onPointerUp);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
      return () => {
        observer.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('pointercancel', onPointerUp);
        renderer.domElement.removeEventListener('wheel', onWheel);
        scene.traverse((item) => { if (item.geometry) item.geometry.dispose(); });
        Object.values(materials).forEach((material) => { material.map?.dispose(); material.dispose(); });
        renderer.dispose(); renderer.domElement.remove(); sceneRef.current = null;
      };
    } catch (error) {
      setSceneError(error?.message || 'This device could not start the 3D house scene.');
      return undefined;
    }
  }, []);

  useEffect(() => { sceneRef.current?.redrawHouse?.(); }, [step]);

  return <div className="construction-viewer" aria-label={`Interactive 3D modern house, construction step ${step} of 100`}>
    <div className="construction-viewer-top"><span>REAL-TIME CONSTRUCTION MODEL</span><span>DRAG TO ROTATE · SCROLL OR USE + / − TO ZOOM</span></div>
    <div className="construction-canvas-wrap"><div className="construction-canvas" ref={hostRef} /><div className="construction-zoom-controls" aria-label="3D camera zoom controls"><button type="button" aria-label="Zoom in" onClick={() => sceneRef.current?.zoom?.(1)}>+</button><button type="button" aria-label="Zoom out" onClick={() => sceneRef.current?.zoom?.(-1)}>−</button></div></div>
    {sceneError && <p className="construction-scene-error" role="status">3D preview unavailable: {sceneError}</p>}
    <div className="construction-viewer-bottom"><span>MODERN INDIAN RESIDENCE</span><span>ARCHITECTURAL CUTAWAY · PLOT VIEW</span></div>
  </div>;
}
