// 시티투어 버스: 모델과 주행 물리
import * as THREE from 'three';
import { clamp, lerp, localToWorld } from './geo.js';
import { terrainHeight, roadQuery, resolveCircle, isInWorld } from './terrain.js';
import { ledTexture, textTexture } from './textures.js';

const L = 11, W = 2.5;

function buildBusMesh() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#1f6fb2', roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: '#f5f6f2', roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
  const amber = new THREE.MeshStandardMaterial({ color: '#ffb020', roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: '#10202c', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
  const black = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

  add(new THREE.BoxGeometry(W, 1.05, L), blue, 0, 0.95, 0);             // 아래 차체
  add(new THREE.BoxGeometry(W + 0.02, 0.12, L + 0.02), amber, 0, 1.5, 0); // 띠
  add(new THREE.BoxGeometry(W, 0.55, L), white, 0, 2.85, 0);            // 지붕 차체
  add(new THREE.BoxGeometry(1.4, 0.35, 2.4), white, 0, 3.3, -1.5);      // 에어컨
  // 창문 띠 (유리) + 창틀 기둥
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 1.05, L - 0.04), glass, sx * (W / 2 - 0.02), 2.08, 0);
  const windshield = new THREE.MeshStandardMaterial({ color: '#a8c8d8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  add(new THREE.BoxGeometry(W - 0.04, 1.05, 0.04), windshield, 0, 2.08, L / 2 - 0.02);
  for (let z = -4.8; z <= 3.2; z += 1.6) {
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 1.05, 0.14), white, s * (W / 2), 2.08, z);
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 1.05, 0.14), white, s * (W / 2 - 0.06), 2.08, L / 2 - 0.07); // A필러
  // 뒤쪽: 뒷창, 엔진 그릴, 번호판
  add(new THREE.BoxGeometry(W, 1.05, 0.08), white, 0, 2.08, -L / 2 + 0.04);
  add(new THREE.BoxGeometry(W - 0.5, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: '#0f1c26', roughness: 0.1, metalness: 0.4 }), 0, 2.1, -L / 2 - 0.01);
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(1.6, 0.05, 0.04), black, 0, 0.75 + i * 0.1, -L / 2 - 0.02);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: textTexture('강원70자 1234', { w: 256, h: 64, bg: '#f4f4f0', color: '#111', size: 38 }) }));
  plate.position.set(0, 1.28, -L / 2 - 0.03); plate.rotation.y = Math.PI;
  g.add(plate);
  const rearLed = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.26), new THREE.MeshBasicMaterial({ map: ledTexture('시티투어') }));
  rearLed.position.set(0, 2.72, -L / 2 - 0.02); rearLed.rotation.y = Math.PI;
  g.add(rearLed);
  // 앞 LED 행선판
  const led = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.4), new THREE.MeshBasicMaterial({ map: ledTexture('동해 시티투어') }));
  led.position.set(0, 2.82, L / 2 + 0.02);
  g.add(led);
  // 옆면 로고
  const logoTex = textTexture('동해 시티투어  EAST SEA CITY TOUR', { w: 1024, h: 96, color: '#ffffff', size: 56 });
  for (const s of [-1, 1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.65), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }));
    logo.position.set(s * (W / 2 + 0.02), 1.0, -0.8);
    logo.rotation.y = s * Math.PI / 2;
    g.add(logo);
  }
  // 앞문 (오른쪽 = -x)
  add(new THREE.BoxGeometry(0.05, 2.2, 1.2), glass, -W / 2 - 0.02, 1.55, 4.1);
  // 전조등 / 후미등
  const headMat = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4c0', emissiveIntensity: 0.8 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#b01818', emissive: '#ff2020', emissiveIntensity: 0.3 });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.45, 0.22, 0.06), headMat, s * 0.85, 0.85, L / 2 + 0.01);
    g.userData.tail = g.userData.tail || [];
    g.userData.tail.push(add(new THREE.BoxGeometry(0.3, 0.45, 0.06), tailMat, s * 1.0, 1.1, -L / 2 - 0.01));
  }
  g.userData.tailMat = tailMat;
  add(new THREE.BoxGeometry(W + 0.05, 0.3, 0.2), black, 0, 0.45, L / 2);   // 범퍼
  add(new THREE.BoxGeometry(W + 0.05, 0.3, 0.2), black, 0, 0.45, -L / 2);
  add(new THREE.BoxGeometry(1.4, 0.3, 0.05), black, 0, 0.62, L / 2 + 0.01); // 그릴
  // 사이드미러
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.05, 0.6), black, s * 1.35, 2.5, L / 2 - 0.1);
    add(new THREE.BoxGeometry(0.12, 0.5, 0.25), black, s * 1.45, 2.3, L / 2 + 0.2);
  }
  // 실내: 바닥, 천장, 좌석, 운전석
  const inner = new THREE.MeshLambertMaterial({ color: '#8e979f', side: THREE.DoubleSide });
  add(new THREE.BoxGeometry(W - 0.1, 0.05, L - 0.2), inner, 0, 1.45, 0);
  add(new THREE.BoxGeometry(W - 0.1, 0.05, L - 0.2), inner, 0, 2.6, 0);
  const seat = new THREE.MeshLambertMaterial({ color: '#27548f' });
  for (let z = -4.6; z <= 2.2; z += 1.1) {
    for (const x of [0.75, -0.75]) {
      add(new THREE.BoxGeometry(0.85, 0.12, 0.5), seat, x, 1.85, z);
      add(new THREE.BoxGeometry(0.85, 0.6, 0.1), seat, x, 2.15, z - 0.25);
    }
  }
  add(new THREE.BoxGeometry(W - 0.1, 0.22, 0.55), black, 0, 1.62, 5.15);  // 대시보드
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 20), black);
  wheel.position.set(0.75, 1.75, 4.8); wheel.rotation.x = -1.1;
  g.add(wheel);
  g.userData.steering = wheel;
  // 바퀴
  const tireGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.36, 18); tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.38, 10); hubGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#b8bec4', metalness: 0.7, roughness: 0.3 });
  const wheels = [];
  for (const [z, front] of [[3.4, true], [-3.1, false]]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 1.1, 0.52, z);
      const spin = new THREE.Group();
      const t = new THREE.Mesh(tireGeo, tireMat); t.castShadow = true;
      const h = new THREE.Mesh(hubGeo, hubMat);
      spin.add(t, h);
      pivot.add(spin);
      g.add(pivot);
      wheels.push({ pivot, spin, front });
    }
  }
  g.userData.wheels = wheels;
  return g;
}

export class Bus {
  constructor(scene) {
    this.mesh = buildBusMesh();
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.mesh.rotation.order = 'YXZ';
    scene.add(this.root);
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0;
    this.speed = 0; this.steer = 0;
    this.pitch = 0; this.roll = 0;
    this.wheelRot = 0;
    this.bump = 0;
    this.onRoad = true;
    this.throttle = 0;
  }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0; this.steer = 0;
    this.y = terrainHeight(x, z);
    this.sync(1);
  }

  forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  local(lx, lz) { return localToWorld(this.x, this.z, this.yaw, lx, lz); }

  // 버스를 둘러싼 원 3개가 다른 물체와 겹치는지
  blocked(x, z, yaw) {
    for (const lz of [-3.9, 0, 3.9]) {
      const p = localToWorld(x, z, yaw, 0, lz);
      if (resolveCircle(p.x, p.z, 1.3).hit) return true;
    }
    for (const [lx, lz] of [[1.1, 5.2], [-1.1, 5.2], [1.1, -5.2], [-1.1, -5.2]]) {
      const p = localToWorld(x, z, yaw, lx, lz);
      if (terrainHeight(p.x, p.z) < 0.25) return true; // 바다
      if (!isInWorld(p.x, p.z, 60)) return true;
    }
    return false;
  }

  update(dt, inp) {
    const r = roadQuery(this.x, this.z);
    this.onRoad = r.dist < 6.5;
    const maxF = inp.limp ? 3 : this.onRoad ? 25 : 11; // 연료가 없으면 시속 11km
    const up = inp.throttle, down = inp.brake;
    this.throttle = up;
    if (up > 0) {
      if (this.speed < -0.2) this.speed += 16 * up * dt;
      else this.speed += 6.2 * up * Math.max(0, 1 - this.speed / (maxF * 1.08)) * dt;
    }
    if (down > 0) {
      if (this.speed > 0.2) this.speed -= 15 * down * dt;
      else this.speed = Math.max(-7, this.speed - 4 * down * dt);
    }
    if (inp.handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 22 * dt);
    // 저항
    this.speed -= this.speed * (this.onRoad ? 0.04 : 0.35) * dt;
    if (!up && !down) {
      const roll = Math.min(Math.abs(this.speed), 0.8 * dt);
      this.speed -= Math.sign(this.speed) * roll;
    }
    if (this.speed > maxF) this.speed = Math.max(maxF, this.speed - 9 * dt);

    // 조향
    const maxSteer = 0.6 / (1 + Math.abs(this.speed) * 0.07);
    const target = clamp(inp.steer, -1, 1) * maxSteer;
    const rate = 2.4 * dt;
    this.steer += clamp(target - this.steer, -rate, rate);

    const yawRate = (this.speed * Math.tan(this.steer)) / 6.4;
    const nyaw = this.yaw + yawRate * dt;
    const nx = this.x + Math.sin(nyaw) * this.speed * dt;
    const nz = this.z + Math.cos(nyaw) * this.speed * dt;

    // 경사가 너무 급하면 못 올라감
    const hOld = terrainHeight(this.x, this.z), hNew = terrainHeight(nx, nz);
    const stepLen = Math.hypot(nx - this.x, nz - this.z) || 1e-6;
    const tooSteep = (hNew - hOld) / stepLen > 0.55 && Math.abs(this.speed) > 0.01;

    let hitNow = false;
    if (tooSteep || this.blocked(nx, nz, nyaw)) {
      if (Math.abs(this.speed) > 3) hitNow = true;
      this.speed = -this.speed * 0.2;
      // 제자리 회전은 허용 (끼임 방지)
      if (!this.blocked(this.x, this.z, nyaw)) this.yaw = nyaw;
    } else {
      this.x = nx; this.z = nz; this.yaw = nyaw;
    }
    if (hitNow) this.bump = 1;
    this.bump = Math.max(0, this.bump - dt * 2.5);

    this.wheelRot += (this.speed * dt) / 0.52;
    this.sync(dt);
    return hitNow;
  }

  sync(dt) {
    const f = this.local(0, 3.8), b = this.local(0, -3.8), l = this.local(1.1, 0), r = this.local(-1.1, 0);
    const hf = terrainHeight(f.x, f.z), hb = terrainHeight(b.x, b.z);
    const hl = terrainHeight(l.x, l.z), hr = terrainHeight(r.x, r.z);
    const ty = Math.max((hf + hb) / 2, terrainHeight(this.x, this.z));
    const k = 1 - Math.exp(-12 * dt);
    this.y = lerp(this.y, ty, k);
    this.pitch = lerp(this.pitch, Math.atan2(hb - hf, 7.6), k);
    this.roll = lerp(this.roll, Math.atan2(hl - hr, 2.2) * 0.8, k);
    this.root.position.set(this.x, this.y, this.z);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);
    // 가속/제동에 따른 차체 기울기
    const ud = this.mesh.userData;
    for (const w of ud.wheels) {
      w.spin.rotation.x = this.wheelRot;
      if (w.front) w.pivot.rotation.y = this.steer;
    }
    ud.steering.rotation.z = -this.steer * 3;
    ud.tailMat.emissiveIntensity = this.speed > 0.5 && this.throttle === 0 ? 1.4 : 0.3;
  }

  kmh() { return Math.abs(this.speed) * 3.6; }
}
