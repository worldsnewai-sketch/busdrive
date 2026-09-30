// 지형 높이 함수, 도로 평탄화, 지면/충돌 질의
import * as THREE from 'three';
import { WORLD, clamp, lerp, smoothstep, noise2, fbm, coastX, valleyZ } from './geo.js';
import { PADS, ROADS, CHUAM } from './layout.js';

function bump(x, z, cx, cz, r, h) {
  const dx = x - cx, dz = z - cz;
  return h * Math.exp(-(dx * dx + dz * dz) / (2 * r * r));
}

export function rawHeight(x, z) {
  const d = coastX(z) - x; // 해안에서 내륙 쪽 거리
  let h;
  if (d < 0) {
    h = Math.max(-18, d * 0.35) - 0.3;
    // 추암 앞바다는 얕은 암반 지대
    const sz = (z - 495) / 55;
    const sw = Math.exp(-sz * sz);
    if (sw > 0.01) h = lerp(h, Math.max(h, d * 0.09 - 0.4), sw);
  } else {
    h = Math.min(d, 35) * 0.07;
    const inland = smoothstep(30, 130, d);
    h += inland * (1.5 + fbm(x * 0.005 + 11, z * 0.005 - 4) * 16);
  }
  h += (noise2(x * 0.08, z * 0.08) - 0.5) * 0.6 * smoothstep(0, 40, d);

  // 묵호 언덕 (바다 쪽은 절벽)
  const mdx = x - 170, mdz = z + 520;
  let hill = 38 * Math.exp(-(mdx * mdx + mdz * mdz) / (2 * 70 * 70));
  if (d < 0) hill *= Math.exp(d / 10);
  h += hill;

  // 추암 바위 언덕과 바위섬
  if (z > 400 && z < 620) {
    h += bump(x, z, CHUAM.head.x, CHUAM.head.z, 8, 8);
    h += bump(x, z, CHUAM.isle.x, CHUAM.isle.z, 7, 11);
    h += bump(x, z, CHUAM.rock.x, CHUAM.rock.z, 6, 2.5);
  }

  // 서쪽 두타산 자락과 무릉계곡
  const m = smoothstep(-140, -360, x);
  if (m > 0) {
    const vz = valleyZ(x), dv = Math.abs(z - vz);
    const ridge = 55 + 100 * fbm(x * 0.004 + 7, z * 0.004 + 3, 5);
    const floor = Math.max(0, -x - 150) * 0.045;
    h += m * (smoothstep(24, 130, dv) * ridge + floor);
    h += smoothstep(-552, -572, x) * 30 * m;                       // 폭포 절벽
    if (x > -551) h -= 1.1 * Math.exp(-(dv * dv) / (2 * 3.2 * 3.2)) * m; // 계곡 물길
    const px = x + 546, pz = z - vz;
    h -= 2.6 * Math.exp(-(px * px + pz * pz) / (2 * 8 * 8));        // 폭포 아래 소
  }

  // 지도 가장자리 산 (육지)
  const edge = Math.min(x - WORLD.x0, z - WORLD.z0, WORLD.z1 - z);
  if (d > 60) h += smoothstep(260, 0, edge) * 70 * smoothstep(60, 160, d);
  return h;
}

for (const p of PADS) p.h = rawHeight(p.x, p.z) + (p.dh || 0);

function padHeight(x, z) {
  let h = rawHeight(x, z);
  for (const p of PADS) {
    const dx = x - p.x, dz = z - p.z;
    const lim = p.r + p.fall;
    if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
    const dd = Math.sqrt(dx * dx + dz * dz);
    if (dd < lim) h = lerp(h, p.h, 1 - smoothstep(p.r, lim, dd));
  }
  return h;
}

// ---------- 도로 ----------
const ROAD_CELL = 24;
const roadGrid = new Map();
export const roadPaths = []; // [{pts:[{x,z,h,tx,tz}], length}]

function buildRoads() {
  ROADS.forEach((ctrl, ri) => {
    const curve = new THREE.CatmullRomCurve3(ctrl.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
    const len = curve.getLength();
    const n = Math.max(4, Math.round(len / 4));
    const pts = curve.getSpacedPoints(n).map((v) => ({ x: v.x, z: v.z, h: 0 }));
    const raw = pts.map((p) => Math.max(1.4, padHeight(p.x, p.z)));
    const W = 10;
    for (let i = 0; i < pts.length; i++) {
      let s = 0, c = 0;
      for (let k = -W; k <= W; k++) {
        const j = clamp(i + k, 0, pts.length - 1);
        const wt = 1 - Math.abs(k) / (W + 1);
        s += raw[j] * wt; c += wt;
      }
      pts[i].h = s / c;
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      pts[i].tx = tx / tl; pts[i].tz = tz / tl;
    }
    roadPaths.push({ pts, length: len, index: ri });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], M = 18;
      const cx0 = Math.floor((Math.min(a.x, b.x) - M) / ROAD_CELL), cx1 = Math.floor((Math.max(a.x, b.x) + M) / ROAD_CELL);
      const cz0 = Math.floor((Math.min(a.z, b.z) - M) / ROAD_CELL), cz1 = Math.floor((Math.max(a.z, b.z) + M) / ROAD_CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const key = cx * 100000 + cz;
        let arr = roadGrid.get(key);
        if (!arr) roadGrid.set(key, (arr = []));
        arr.push([a, b]);
      }
    }
  });
}
buildRoads();

const _rq = { dist: Infinity, h: 0 };
export function roadQuery(x, z) {
  _rq.dist = Infinity; _rq.h = 0;
  const arr = roadGrid.get(Math.floor(x / ROAD_CELL) * 100000 + Math.floor(z / ROAD_CELL));
  if (!arr) return _rq;
  for (const [a, b] of arr) {
    const abx = b.x - a.x, abz = b.z - a.z;
    const l2 = abx * abx + abz * abz || 1;
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / l2, 0, 1);
    const px = a.x + abx * t - x, pz = a.z + abz * t - z;
    const dd = Math.sqrt(px * px + pz * pz);
    if (dd < _rq.dist) { _rq.dist = dd; _rq.h = lerp(a.h, b.h, t); }
  }
  return _rq;
}

export function terrainHeightExact(x, z) {
  let h = padHeight(x, z);
  const r = roadQuery(x, z);
  if (r.dist < 17) h = lerp(h, r.h, 1 - smoothstep(5.5, 17, r.dist));
  return h;
}

// ---------- 높이 격자 (렌더링 메시와 동일한 삼각형 보간) ----------
export const NX = Math.round((WORLD.x1 - WORLD.x0) / WORLD.cell);
export const NZ = Math.round((WORLD.z1 - WORLD.z0) / WORLD.cell);
export const heights = new Float32Array((NX + 1) * (NZ + 1));
for (let j = 0; j <= NZ; j++) {
  const z = WORLD.z0 + j * WORLD.cell;
  for (let i = 0; i <= NX; i++) heights[j * (NX + 1) + i] = terrainHeightExact(WORLD.x0 + i * WORLD.cell, z);
}

export function terrainHeight(x, z) {
  const fx = clamp((x - WORLD.x0) / WORLD.cell, 0, NX - 0.0001);
  const fz = clamp((z - WORLD.z0) / WORLD.cell, 0, NZ - 0.0001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const W = NX + 1;
  const h00 = heights[j * W + i], h10 = heights[j * W + i + 1];
  const h01 = heights[(j + 1) * W + i], h11 = heights[(j + 1) * W + i + 1];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

// ---------- 걸을 수 있는 구조물 (다리, 전망대, 스카이워크) ----------
export const platforms = [];
export function addSegPlatform(ax, az, bx, bz, w, ya, yb) {
  platforms.push({ type: 'seg', ax, az, bx, bz, w, ya, yb });
}
export function addDiscPlatform(x, z, r, y) {
  platforms.push({ type: 'disc', x, z, r, y });
}
// 발 높이 y 기준으로 올라설 수 있는 가장 높은 구조물 높이
export function platformHeight(x, z, y) {
  let best = -Infinity;
  for (const p of platforms) {
    let top;
    if (p.type === 'seg') {
      const abx = p.bx - p.ax, abz = p.bz - p.az;
      const l2 = abx * abx + abz * abz;
      const t = ((x - p.ax) * abx + (z - p.az) * abz) / l2;
      if (t < 0 || t > 1) continue;
      const px = p.ax + abx * t - x, pz = p.az + abz * t - z;
      if (px * px + pz * pz > (p.w / 2) * (p.w / 2)) continue;
      top = lerp(p.ya, p.yb, t);
    } else {
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > p.r * p.r) continue;
      top = p.y;
    }
    if (top <= y + 0.8 && top > best) best = top;
  }
  return best;
}

// ---------- 원형 충돌체 ----------
const COL_CELL = 16;
const colGrid = new Map();
export function addCollider(x, z, r, tag) {
  const c = { x, z, r, tag };
  const R = r + 2; // 질의하는 원의 반지름만큼 여유
  const cx0 = Math.floor((x - R) / COL_CELL), cx1 = Math.floor((x + R) / COL_CELL);
  const cz0 = Math.floor((z - R) / COL_CELL), cz1 = Math.floor((z + R) / COL_CELL);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const key = cx * 100000 + cz;
    let arr = colGrid.get(key);
    if (!arr) colGrid.set(key, (arr = []));
    arr.push(c);
  }
  return c;
}
// 박스 모양 건물은 원 여러 개로 채운다
export function addBoxCollider(x, z, w, d, yaw = 0) {
  const r = Math.min(w, d) / 2;
  const long = Math.max(w, d), alongX = w >= d;
  const n = Math.max(1, Math.ceil(long / (r * 1.4)));
  for (let k = 0; k < n; k++) {
    const off = n === 1 ? 0 : -long / 2 + r + (k * (long - 2 * r)) / (n - 1);
    const lx = alongX ? off : 0, lz = alongX ? 0 : off;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    addCollider(x + lx * c + lz * s, z - lx * s + lz * c, r * 1.05);
  }
}

// 원(x,z,r)과 겹치는 충돌체를 밀어낸 위치 보정값을 돌려준다
export function resolveCircle(x, z, r, ignoreTag) {
  let ox = 0, oz = 0, hit = false;
  const arr = colGrid.get(Math.floor(x / COL_CELL) * 100000 + Math.floor(z / COL_CELL));
  if (arr) {
    for (const c of arr) {
      if (ignoreTag && c.tag === ignoreTag) continue;
      const dx = x + ox - c.x, dz = z + oz - c.z;
      const rr = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        ox += (dx / d) * (rr - d); oz += (dz / d) * (rr - d);
        hit = c;
      }
    }
  }
  return { ox, oz, hit };
}

export function nearRoad(x, z, dist) {
  return roadQuery(x, z).dist < dist;
}

export function isInWorld(x, z, margin = 0) {
  return x > WORLD.x0 + margin && x < WORLD.x1 - margin && z > WORLD.z0 + margin && z < WORLD.z1 - margin;
}
