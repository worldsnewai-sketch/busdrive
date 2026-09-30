// 정류장에서 기다리는 승객: 태우고, 목적지 정류장에 내려 주면 동해페이를 받는다
import { rng } from './geo.js';
import { terrainHeight } from './terrain.js';
import { DESTS, TERMINAL } from './layout.js';
import { buildPerson } from './player.js';
import { econ, FARE, TIP } from './economy.js';

// 승객이 오가는 정류장: 관광지 3곳 + 터미널
export const PAX_STOPS = DESTS.filter((d) => d.id !== 'gas');
const MAX_WAIT = 4;
const CAPACITY = 20;
const R = rng(2024);
const SHIRTS = ['#3b82c4', '#e0a030', '#7a5bbf', '#2e8b57', '#e25d5d', '#f2f2f2', '#ffcc4d', '#4db6ac'];
const PANTS = ['#2d3e5c', '#3a3a3a', '#6b5a45', '#1f4f7a'];

// 기다리는 자리: 정류장 쉼터 앞 (버스 오른쪽 7m)
function waitSpot(d, k) {
  if (d.id === 'terminal') return { x: TERMINAL.x - 12 + k * 1.3, z: TERMINAL.z + 2 };
  const s = d.stop;
  const px = s.x - Math.cos(s.yaw) * 5.6, pz = s.z + Math.sin(s.yaw) * 5.6;
  const along = (k - 1.5) * 1.2;
  return { x: px + Math.sin(s.yaw) * along, z: pz + Math.cos(s.yaw) * along };
}

export class Passengers {
  constructor(scene) {
    this.scene = scene;
    this.waiting = Object.fromEntries(PAX_STOPS.map((d) => [d.id, []]));
    this.timers = Object.fromEntries(PAX_STOPS.map((d) => [d.id, 3 + R() * 10]));
    this.onboard = [];
    for (const d of PAX_STOPS) for (let i = 0; i < 2; i++) this.spawn(d);
  }

  spawn(d) {
    const list = this.waiting[d.id];
    if (list.length >= MAX_WAIT) return;
    const others = PAX_STOPS.filter((o) => o !== d);
    const dest = others[Math.floor(R() * others.length)];
    const mesh = buildPerson({ shirt: SHIRTS[Math.floor(R() * SHIRTS.length)], pants: PANTS[Math.floor(R() * PANTS.length)], hat: R() < 0.4 ? '#f4e3b5' : null, bag: SHIRTS[Math.floor(R() * SHIRTS.length)] });
    mesh.scale.setScalar(0.92 + R() * 0.12);
    this.scene.add(mesh);
    list.push({ dest: dest.id, mesh, ph: R() * 6 });
    this.layout(d);
  }

  layout(d) {
    this.waiting[d.id].forEach((p, k) => {
      const w = waitSpot(d, k);
      p.mesh.position.set(w.x, terrainHeight(w.x, w.z), w.z);
      p.mesh.rotation.y = d.stop.yaw - Math.PI / 2; // 도로 쪽을 봄
    });
  }

  update(dt, t) {
    for (const d of PAX_STOPS) {
      this.timers[d.id] -= dt;
      if (this.timers[d.id] <= 0) { this.spawn(d); this.timers[d.id] = 25 + R() * 25; }
      for (const p of this.waiting[d.id]) {
        const { arms } = p.mesh.userData;
        arms[0].rotation.x = Math.sin(t * 1.3 + p.ph) * 0.08;
        arms[1].rotation.z = Math.max(0, Math.sin(t * 0.4 + p.ph)) * -0.25; // 가끔 손짓
      }
    }
  }

  countFor(id) { return this.onboard.filter((p) => p.dest === id).length; }

  // 버스가 정류장에 멈췄을 때: 내리고, 타고, 요금을 받는다
  serve(stopId) {
    const off = this.onboard.filter((p) => p.dest === stopId);
    this.onboard = this.onboard.filter((p) => p.dest !== stopId);
    let fare = 0, tipped = 0;
    for (const p of off) {
      fare += FARE;
      if (econ.bumps === p.bumps) { fare += TIP; tipped++; }
    }
    const list = this.waiting[stopId] || [];
    const room = CAPACITY - this.onboard.length;
    const boarding = list.splice(0, room);
    for (const p of boarding) {
      this.scene.remove(p.mesh);
      this.onboard.push({ dest: p.dest, bumps: econ.bumps });
    }
    if (boarding.length) this.layout(PAX_STOPS.find((d) => d.id === stopId));
    if (fare) { econ.earn(fare); econ.stats.passengers += off.length; econ.save(); }
    return { off: off.length, on: boarding.length, fare, tipped };
  }
}
