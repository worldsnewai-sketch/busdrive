// 가게 건물(카페, 매점, 식당)과 주유소
import * as THREE from 'three';
import { localToWorld } from './geo.js';
import { terrainHeight, addBoxCollider, addCollider } from './terrain.js';
import { SHOP_SPOTS, GAS } from './layout.js';
import { SHOPS } from './economy.js';
import { hanok } from './sites.js';
import { textTexture } from './textures.js';

const lam = (color) => new THREE.MeshLambertMaterial({ color });

function signBoard(text, bg, w = 6, h = 1.2) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, { w: 512, h: 100, bg, color: '#ffffff', size: 54 }) }));
}

// 줄무늬 차양
function awning(w, colors) {
  const g = new THREE.Group();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / n, 0.08, 1.8), lam(colors[i % 2]));
    m.position.set(-w / 2 + (i + 0.5) * (w / n), 0, 0.9);
    m.rotation.x = 0.3;
    g.add(m);
  }
  return g;
}

function tableSet(color) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14), lam('#f2efe8'));
  top.position.y = 0.75;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75), lam('#555'));
  leg.position.y = 0.37;
  const um = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 10), lam(color));
  um.position.y = 2.3;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1), lam('#ddd'));
  pole.position.y = 1.2;
  g.add(top, leg, um, pole);
  for (const a of [0, Math.PI]) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), lam('#c9b18a'));
    ch.position.set(Math.cos(a) * 0.8, 0.22, Math.sin(a) * 0.8);
    g.add(ch);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function modernShop(shop, wall, trim, awningCols) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 6), lam(wall));
  body.position.y = 2 - 0.3;
  body.castShadow = true; body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.4, 6.6), lam(trim));
  roof.position.y = 3.9;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshStandardMaterial({ color: '#1e3444', roughness: 0.1, metalness: 0.4 }));
  glass.position.set(-0.8, 1.5, 3.01);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), lam('#6b4a2a'));
  door.position.set(3.2, 1.2, 3.01);
  const sign = signBoard(shop.name, trim, 6.5, 1.1);
  sign.position.set(0, 3.2, 3.02);
  const aw = awning(7, awningCols);
  aw.position.set(-0.4, 2.75, 3);
  g.add(body, roof, glass, door, sign, aw);
  return g;
}

export function buildShops(scene) {
  const spots = [];
  for (const shop of SHOPS) {
    const s = SHOP_SPOTS[shop.id];
    const y = terrainHeight(s.x, s.z);
    let g;
    if (shop.id === 'mukho-cafe') g = modernShop(shop, '#e9f1f4', '#2c6e8f', ['#2c6e8f', '#f4f1ea']);
    else if (shop.id === 'chuam-store') g = modernShop(shop, '#fff3d6', '#d9534f', ['#d9534f', '#fff8ea']);
    else {
      g = hanok(8, 5.5, 3.2, { walls: true, roofColor: '#3f454b' });
      const sign = signBoard(shop.name, '#4a2f1b', 4.2, 0.9);
      sign.position.set(0, 3.6, 3.1);
      g.add(sign);
    }
    g.position.set(s.x, y, s.z);
    g.rotation.y = s.yaw;
    // 바깥 테이블
    for (const [lx, lz] of [[-5, 8.5], [5, 8.5]]) {
      const p = localToWorld(s.x, s.z, s.yaw, lx, lz);
      const t = tableSet(shop.id === 'chuam-store' ? '#f1c40f' : '#2c6e8f');
      t.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      scene.add(t);
      addCollider(p.x, p.z, 0.7);
    }
    scene.add(g);
    addBoxCollider(s.x, s.z, 9, 6, s.yaw);
    const front = localToWorld(s.x, s.z, s.yaw, 0, 4.6);
    spots.push({ shop, x: front.x, z: front.z });
  }
  buildGas(scene);
  return spots;
}

function buildGas(scene) {
  const g = new THREE.Group();
  const y = terrainHeight(GAS.x, GAS.z);
  const blue = lam('#1f6fb2'), white = lam('#f4f6f7');
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(18, 0.7, 11), white);
  canopy.position.y = 5.4;
  const band = new THREE.Mesh(new THREE.BoxGeometry(18.1, 0.35, 11.1), blue);
  band.position.y = 5.1;
  g.add(canopy, band);
  for (const [x, z] of [[-6, 0], [6, 0]]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, 0.5), white);
    pil.position.set(x, 2.6, z);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.7), blue);
    pump.position.set(x, 0.9, z + 1.2);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), new THREE.MeshBasicMaterial({ color: '#b8f0c0' }));
    screen.position.set(x, 1.4, z + 1.56);
    g.add(pil, pump, screen);
  }
  const office = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5), white);
  office.position.set(0, 1.7, -15);
  const osign = signBoard('시티투어 주유소', '#1f6fb2', 6, 1);
  osign.position.set(0, 2.9, -12.48);
  g.add(office, osign);
  // 가격 기둥
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), white);
  post.position.set(9.5, 3, 7);
  const price = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ map: textTexture('경유 1%=90원', { w: 256, h: 128, bg: '#123a5c', color: '#ffd166', size: 34 }), side: THREE.DoubleSide }));
  price.position.set(9.5, 6.4, 7);
  price.rotation.y = Math.PI / 2;
  g.add(post, price);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(GAS.x, y, GAS.z);
  g.rotation.y = GAS.yaw;
  scene.add(g);
  // 기둥과 사무실만 부딪히게 (주유기 사이는 버스가 지나감)
  for (const [lx, lz, r] of [[-6, 0, 0.9], [6, 0, 0.9]]) {
    const p = localToWorld(GAS.x, GAS.z, GAS.yaw, lx, lz);
    addCollider(p.x, p.z, r);
  }
  const o = localToWorld(GAS.x, GAS.z, GAS.yaw, 0, -15);
  addBoxCollider(o.x, o.z, 7, 5, GAS.yaw);
}
