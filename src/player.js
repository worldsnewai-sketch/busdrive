// 걸어 다니는 관광객
import * as THREE from 'three';
import { lerp } from './geo.js';
import { terrainHeight, platformHeight, resolveCircle, isInWorld } from './terrain.js';

function buildPerson() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: '#f1c7a5' });
  const shirt = new THREE.MeshLambertMaterial({ color: '#ff6b4a' });
  const pants = new THREE.MeshLambertMaterial({ color: '#2d3e5c' });
  const hatM = new THREE.MeshLambertMaterial({ color: '#f4e3b5' });
  const bagM = new THREE.MeshLambertMaterial({ color: '#2f8f6f' });
  const part = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  part(new THREE.CapsuleGeometry(0.28, 0.5, 4, 10), shirt, 0, 1.2, 0);
  part(new THREE.SphereGeometry(0.2, 14, 10), skin, 0, 1.72, 0);
  part(new THREE.CylinderGeometry(0.3, 0.32, 0.06, 16), hatM, 0, 1.86, 0);
  part(new THREE.CylinderGeometry(0.19, 0.21, 0.14, 14), hatM, 0, 1.93, 0);
  part(new THREE.BoxGeometry(0.34, 0.4, 0.16), bagM, 0, 1.25, -0.3);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.13, 0.85, 0); g.add(hip);
    part(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), pants, 0, -0.4, 0, hip);
    part(new THREE.BoxGeometry(0.16, 0.1, 0.28), pants, 0, -0.8, 0.05, hip);
    legs.push(hip);
    const sh = new THREE.Group(); sh.position.set(s * 0.36, 1.42, 0); g.add(sh);
    part(new THREE.CapsuleGeometry(0.075, 0.45, 4, 8), shirt, 0, -0.28, 0, sh);
    part(new THREE.SphereGeometry(0.08, 8, 6), skin, 0, -0.6, 0, sh);
    arms.push(sh);
  }
  g.userData = { legs, arms };
  return g;
}

export class Walker {
  constructor(scene) {
    this.mesh = buildPerson();
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
    this.yaw = 0; this.phase = 0; this.grounded = true;
    this.onPlatform = false;
    this.speedNow = 0;
  }

  ground(x, z, y) {
    const t = terrainHeight(x, z);
    const p = platformHeight(x, z, y);
    return p > t ? { h: p, plat: true, water: false } : { h: t, plat: false, water: t < -0.25 };
  }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.vy = 0;
    this.y = this.ground(x, z, 1e6).h;
    const g = this.ground(x, z, terrainHeight(x, z) + 0.5);
    this.y = g.h;
    this.sync(0);
  }

  update(dt, inp, camYaw, extraColliders) {
    // 카메라 기준 이동 방향
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let mx = fx * inp.y + rx * inp.x, mz = fz * inp.y + rz * inp.x;
    const ml = Math.hypot(mx, mz);
    const moving = ml > 0.1;
    const speed = (inp.run ? 8.5 : 4.2) * Math.min(1, ml);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.speedNow = moving ? speed : 0;

    if (moving) {
      const target = Math.atan2(mx, mz);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 12);

      const stepX = mx * speed * dt, stepZ = mz * speed * dt;
      // 축별로 시도해서 벽을 따라 미끄러지게
      for (const [sx, sz] of [[stepX, stepZ], [stepX, 0], [0, stepZ]]) {
        if (sx === 0 && sz === 0) continue;
        let nx = this.x + sx, nz = this.z + sz;
        const res = resolveCircle(nx, nz, 0.35);
        nx += res.ox; nz += res.oz;
        for (const c of extraColliders) {
          const dx = nx - c.x, dz = nz - c.z, rr = c.r + 0.35, d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3; nx += dx / d * (rr - d); nz += dz / d * (rr - d); }
        }
        if (!isInWorld(nx, nz, 40)) continue;
        const g = this.ground(nx, nz, this.y);
        if (g.water) continue;                                   // 바다로는 못 들어감
        if (this.onPlatform && !g.plat && g.h < this.y - 1.2) continue; // 난간
        const dist = Math.hypot(nx - this.x, nz - this.z) || 1e-4;
        if (!g.plat && (g.h - this.y) / dist > 1.6 && g.h - this.y > 0.35) continue; // 절벽
        this.x = nx; this.z = nz;
        break;
      }
      this.phase += dt * speed * 1.9;
    } else {
      this.phase = lerp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, Math.min(1, dt * 10));
    }

    // 중력 / 점프
    const g = this.ground(this.x, this.z, this.y);
    if (inp.jump && this.grounded) { this.vy = 7.5; this.grounded = false; }
    this.vy -= 24 * dt;
    this.y += this.vy * dt;
    if (this.y <= g.h) {
      // 내리막은 부드럽게 붙이고, 오르막은 바로
      this.y = g.h; this.vy = 0; this.grounded = true;
      this.onPlatform = g.plat;
    } else if (this.grounded && this.y - g.h < 0.6 && this.vy <= 0) {
      this.y = g.h; this.vy = 0; this.onPlatform = g.plat;
    } else {
      this.grounded = false;
    }
    this.sync(dt);
  }

  sync() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    const sw = Math.sin(this.phase) * Math.min(1, this.speedNow / 3) * 0.7;
    const { legs, arms } = this.mesh.userData;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    arms[0].rotation.x = -sw * 0.8; arms[1].rotation.x = sw * 0.8;
    this.mesh.position.y += Math.abs(Math.cos(this.phase)) * 0.05 * Math.min(1, this.speedNow / 3);
  }
}
