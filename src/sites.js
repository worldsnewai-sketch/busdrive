// 관광지 3곳: 추암 촛대바위, 무릉계곡, 묵호 도째비골·논골담길
import * as THREE from 'three';
import { rng, noise2, lerp, valleyZ, coastX } from './geo.js';
import { terrainHeight, addSegPlatform, addDiscPlatform, addCollider, addBoxCollider } from './terrain.js';
import { CHUAM, MUREUNG, MUKHO, SITES } from './layout.js';
import { makeSign } from './world.js';
import { stopSignTexture, muralTexture, engravingTexture, waterfallTexture, streamTexture, softDotTexture, textTexture } from './textures.js';

const rockMat = new THREE.MeshStandardMaterial({ color: '#8d857a', roughness: 1, flatShading: true });
const darkRockMat = new THREE.MeshStandardMaterial({ color: '#6d665e', roughness: 1, flatShading: true });
const steel = new THREE.MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.5, metalness: 0.6 });
const white = new THREE.MeshLambertMaterial({ color: '#f2f2ee' });
const woodDeck = new THREE.MeshLambertMaterial({ color: '#9b7651' });

// 울퉁불퉁한 바위 기둥
function rockSpire(height, baseR, topR, seed, mat = rockMat) {
  const pts = [];
  const R = rng(seed);
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = lerp(baseR, topR, Math.pow(t, 0.8)) * (0.85 + R() * 0.3);
    if (i === n) r *= 0.6;
    pts.push(new THREE.Vector2(r, t * height));
  }
  pts.push(new THREE.Vector2(0.01, height + topR * 0.4));
  const geo = new THREE.LatheGeometry(pts, 9);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (noise2(x * 0.9 + seed, y * 0.7 + z * 0.9) - 0.5) * 0.45;
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function boulder(r, seed, mat = rockMat) {
  const geo = new THREE.DodecahedronGeometry(r, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + noise2(x * 1.3 + seed, z * 1.3 + y) * 0.5;
    p.setXYZ(i, x * k, y * k * 0.75, z * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// 난간 (구조물 양옆)
function railing(group, ax, az, ay, bx, bz, by, halfW, mat = steel, postEvery = 2.5) {
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(bx - ax, bz - az);
  for (const side of [-1, 1]) {
    const ox = Math.cos(yaw) * halfW * side, oz = -Math.sin(yaw) * halfW * side;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, Math.hypot(len, by - ay)), mat);
    top.position.set((ax + bx) / 2 + ox, (ay + by) / 2 + 1.1, (az + bz) / 2 + oz);
    top.rotation.order = 'YXZ';
    top.rotation.set(-Math.atan2(by - ay, len), yaw, 0);
    group.add(top);
    const n = Math.max(1, Math.round(len / postEvery));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), mat);
      post.position.set(lerp(ax, bx, t) + ox, lerp(ay, by, t) + 0.55, lerp(az, bz, t) + oz);
      group.add(post);
    }
  }
}

// 걸을 수 있는 데크 구간 (메시 + 발판 + 난간)
function deckSegment(group, a, b, w, mat, opts = {}) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, opts.thick || 0.25, Math.hypot(len, b.y - a.y) + 0.05), mat);
  slab.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - (opts.thick || 0.25) / 2, (a.z + b.z) / 2);
  slab.rotation.order = 'YXZ';
  slab.rotation.set(-Math.atan2(b.y - a.y, len), yaw, 0);
  slab.receiveShadow = true; slab.castShadow = !opts.noShadow;
  group.add(slab);
  if (opts.rails !== false) railing(group, a.x, a.z, a.y, b.x, b.z, b.y, w / 2 - 0.05, opts.railMat || steel);
  addSegPlatform(a.x, a.z, b.x, b.z, w - 0.3, a.y, b.y);
}

function placeSign(group, x, z, yaw, title, sub) {
  const s = makeSign(title, sub);
  s.position.set(x, terrainHeight(x, z), z);
  s.rotation.y = yaw;
  group.add(s);
  addCollider(x, z, 0.5);
  return s;
}

// 한옥 지붕 (팔작/우진각 느낌의 단순 모양)
function hipRoof(w, d, h, color = '#3d4247') {
  const ew = w / 2 + 0.9, ed = d / 2 + 0.9, rl = Math.max(0.3, (w - d) / 2);
  const lift = 0.45;
  const v = [
    -ew, lift, -ed, ew, lift, -ed, ew, lift, ed, -ew, lift, ed,
    -rl, h, 0, rl, h, 0,
  ];
  const idx = [0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0];
  // 처마 곡선 느낌: 모서리를 올린다
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true }));
  m.castShadow = true;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(rl * 2 + 0.6, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: '#2a2e33' }));
  ridge.position.y = h + 0.1;
  const grp = new THREE.Group();
  grp.add(m, ridge);
  return grp;
}

// 한옥 건물: 기단 + 기둥 + 단청 보 + 지붕
function hanok(w, d, colH, { walls = false, roofColor, pillar = '#8b3a2b' } = {}) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.8, d + 1.2), new THREE.MeshLambertMaterial({ color: '#a39d91' }));
  base.position.y = 0.4; base.receiveShadow = true; base.castShadow = true;
  g.add(base);
  const pmat = new THREE.MeshLambertMaterial({ color: pillar });
  const nx = Math.max(2, Math.round(w / 2.4) + 1), nz = Math.max(2, Math.round(d / 2.4) + 1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, colH, 8), pmat);
    p.position.set(-w / 2 + (w * i) / (nx - 1), 0.8 + colH / 2, -d / 2 + (d * j) / (nz - 1));
    p.castShadow = true;
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.45, d + 0.4), new THREE.MeshLambertMaterial({ color: '#2f7d6d' }));
  beam.position.y = 0.8 + colH + 0.2;
  g.add(beam);
  if (walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, colH, d - 0.3), new THREE.MeshLambertMaterial({ color: '#e9dfc9' }));
    wall.position.y = 0.8 + colH / 2;
    g.add(wall);
    // 문살
    const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, colH * 0.8), new THREE.MeshLambertMaterial({ color: '#b58b5a' }));
    door.position.set(0, 0.8 + colH * 0.45, d / 2 - 0.13);
    g.add(door);
  }
  const roof = hipRoof(w, d, 2.2 + d * 0.12, roofColor);
  roof.position.y = 0.8 + colH + 0.4;
  g.add(roof);
  return g;
}

function stopShelter(scene, site) {
  const s = site.stop;
  const y = terrainHeight(s.x, s.z);
  const g = new THREE.Group();
  // 정류장은 버스 진행 방향 오른쪽(보도 쪽)에 둔다
  const px = s.x - Math.cos(s.yaw) * 7, pz = s.z + Math.sin(s.yaw) * 7;
  g.position.set(px, y, pz);
  g.rotation.y = s.yaw + Math.PI / 2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 2.2), new THREE.MeshLambertMaterial({ color: '#1b4f9c' }));
  roof.position.y = 2.7;
  const back = new THREE.Mesh(new THREE.BoxGeometry(5, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: '#bfe0f5', transparent: true, opacity: 0.4 }));
  back.position.set(0, 1.35, -1);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.5), woodDeck);
  bench.position.set(0, 0.5, -0.6);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshBasicMaterial({ map: stopSignTexture(site.short) }));
  sign.position.set(0, 3.3, 0);
  const pole1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, 0.1), steel); pole1.position.set(-2.4, 1.35, 0.9);
  const pole2 = pole1.clone(); pole2.position.x = 2.4;
  g.add(roof, back, bench, sign, pole1, pole2);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  addBoxCollider(px, pz, 5, 2, s.yaw + Math.PI / 2);
}

// 구경거리(안내판/스탬프) 목록
export const POIS = [];
function poi(site, id, x, z, title, body, opts = {}) {
  POIS.push({ site, id, x, z, r: opts.r || 7, title, body, action: opts.action, y: opts.y });
}

// ====================== 추암 ======================
function buildChuam(scene, anim) {
  const g = new THREE.Group();
  scene.add(g);
  // 촛대바위
  const rk = CHUAM.rock;
  const base = terrainHeight(rk.x, rk.z);
  const spire = rockSpire(17, 2.4, 1.0, 5);
  spire.position.set(rk.x, Math.min(base, 0) - 1.5, rk.z);
  g.add(spire);
  const cap = boulder(1.3, 3); cap.position.set(rk.x + 0.3, spire.position.y + 17.6, rk.z); g.add(cap);
  // 주변 기암
  const R = rng(51);
  const around = [[-10, -8, 8, 3.2], [-6, 9, 6, 2.6], [8, -6, 5, 2], [12, 10, 7, 2.8], [-16, 2, 4, 2.2], [4, 16, 5.5, 2.5], [-3, -18, 6, 2.4]];
  around.forEach(([dx, dz, h, r], i) => {
    const s = rockSpire(h, r, r * 0.45, 20 + i);
    s.position.set(rk.x + dx, terrainHeight(rk.x + dx, rk.z + dz) - 1, rk.z + dz);
    s.rotation.y = R() * 6;
    g.add(s);
  });
  for (let i = 0; i < 24; i++) {
    const x = rk.x - 30 + R() * 60, z = rk.z - 40 + R() * 90;
    const h = terrainHeight(x, z);
    if (h > 1.5 || h < -6) continue;
    const b = boulder(0.8 + R() * 2, i + 7);
    b.position.set(x, h + 0.2, z);
    b.rotation.y = R() * 6;
    g.add(b);
  }

  // 출렁다리: 언덕(head) → 바위섬(isle)
  const hd = CHUAM.head, is = CHUAM.isle;
  const ya = terrainHeight(hd.x + 3, hd.z) + 0.4, yb = terrainHeight(is.x - 4, is.z) + 1.2;
  const A = { x: hd.x + 3, z: hd.z }, B = { x: is.x - 4, z: is.z };
  const N = 10;
  const bridgePts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    bridgePts.push({ x: lerp(A.x, B.x, t), z: lerp(A.z, B.z, t), y: lerp(ya, yb, t) - Math.sin(t * Math.PI) * 1.2 });
  }
  const deckMat = new THREE.MeshLambertMaterial({ color: '#c9ced3' });
  for (let i = 0; i < N; i++) deckSegment(g, bridgePts[i], bridgePts[i + 1], 2.2, deckMat, { thick: 0.18, railMat: new THREE.MeshLambertMaterial({ color: '#2a78c2' }) });
  // 주탑과 케이블
  const towerMat = new THREE.MeshLambertMaterial({ color: '#2a78c2' });
  for (const [P, y] of [[A, ya], [B, yb]]) {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), towerMat);
      t.position.set(P.x, y + 2.1, P.z + s * 1.3);
      t.castShadow = true;
      g.add(t);
    }
  }
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push(new THREE.Vector3(lerp(A.x, B.x, t), lerp(ya, yb, t) + 4.1 - Math.sin(t * Math.PI) * 3.4, lerp(A.z, B.z, t) + s * 1.3));
    }
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05, 5), steel);
    g.add(cable);
  }
  // 바위섬 전망 데크
  let iy = -Infinity;
  for (let a = 0; a < 6.3; a += 0.5) for (const r of [0, 2, 4]) iy = Math.max(iy, terrainHeight(is.x + Math.cos(a) * r, is.z + Math.sin(a) * r));
  iy += 0.3;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.3, 24), deckMat);
  deck.position.set(is.x, iy - 0.15, is.z);
  deck.receiveShadow = true;
  g.add(deck);
  addDiscPlatform(is.x, is.z, 4.1, iy);
  addSegPlatform(B.x, B.z, is.x, is.z, 2.2, yb, iy);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.35) continue; // 다리 쪽 입구
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), steel);
    post.position.set(is.x + Math.cos(a) * 4.1, iy + 0.55, is.z + Math.sin(a) * 4.1);
    g.add(post);
  }
  const ringRail = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.05, 4, 40, Math.PI * 2 - 0.7), steel);
  ringRail.rotation.x = Math.PI / 2;
  ringRail.rotation.z = Math.PI + 0.35;
  ringRail.position.set(is.x, iy + 1.1, is.z);
  g.add(ringRail);

  // 해암정
  const pv = CHUAM.pavilion;
  const pav = hanok(5.2, 3.6, 2.6, { roofColor: '#3a3f44' });
  pav.position.set(pv.x, terrainHeight(pv.x, pv.z), pv.z);
  pav.rotation.y = Math.PI / 2;
  g.add(pav);
  addBoxCollider(pv.x, pv.z, 4.6, 6.4);

  // 해변 파라솔과 사람들
  const colors = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#e67e22'];
  for (let i = 0; i < 7; i++) {
    const z = 430 + i * 9 + R() * 3;
    const x = coastX(z) - 16 + R() * 6;
    const y = terrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), white);
    pole.position.set(x, y + 1.2, z);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.7, 10), new THREE.MeshLambertMaterial({ color: colors[i % 5] }));
    top.position.set(x, y + 2.5, z);
    top.castShadow = true;
    g.add(pole, top);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.9), new THREE.MeshLambertMaterial({ color: colors[(i + 2) % 5] }));
    towel.rotation.x = -Math.PI / 2;
    towel.position.set(x + 1.6, y + 0.05, z);
    g.add(towel);
  }

  placeSign(g, CHUAM.beachSign.x, CHUAM.beachSign.z, Math.PI / 2, '추암해변', 'Chuam Beach');
  placeSign(g, pv.x + 5, pv.z - 3, Math.PI / 2, '해암정', '海巖亭');
  const vs = makeSign('촛대바위 전망', '일출 명소');
  vs.position.set(is.x - 1.5, iy, is.z - 3.2);
  vs.rotation.y = Math.PI * 0.85;
  g.add(vs);

  poi('chuam', 'chuam-beach', CHUAM.beachSign.x, CHUAM.beachSign.z, '추암해변',
    ['동해시 남쪽 끝, 삼척과 맞닿은 작은 해변이에요. 모래사장 옆으로 기암괴석이 줄지어 서 있어 사진 명소로 꼽혀요.',
      '해변 끝의 바위 언덕으로 올라가면 출렁다리를 건너 촛대바위를 정면으로 볼 수 있는 바위섬 전망대까지 갈 수 있어요.']);
  poi('chuam', 'chuam-pavilion', pv.x + 5, pv.z - 3, '해암정 (海巖亭)',
    ['고려 공민왕 때(1361년) 삼척 심씨의 시조 심동로가 벼슬을 내려놓고 고향에 내려와 지은 정자로 전해져요.',
      '바위 절벽을 등지고 바다를 바라보는 자리라, 정자 기둥 사이로 보이는 추암 바위들이 한 폭의 그림 같아요.']);
  poi('chuam', 'chuam-rock', is.x, is.z, '촛대바위',
    ['바다 위로 촛대처럼 솟은 바위예요. 애국가 첫 소절 영상의 일출 장면 배경으로 널리 알려졌어요.',
      '조선 세조 때 한명회가 이곳 경치에 반해 "능파대(凌波臺)"라 불렀다는 이야기가 전해져요.',
      '이 전망대는 동쪽 바다를 향하고 있어요. 아래 버튼으로 해 뜨는 장면을 볼 수 있어요.'],
    { r: 5, action: 'sunrise', y: iy });

}

// ====================== 무릉계곡 ======================
function buildMureung(scene, anim) {
  const g = new THREE.Group();
  scene.add(g);
  const vz = valleyZ;

  // 물길 (폭포 소 → 동쪽)
  const pts = [];
  for (let x = -540; x <= -160; x += 3) {
    const z = vz(x);
    pts.push({ x, z, h: terrainHeight(x, z) + 0.45 });
  }
  // 하류(동쪽)로 갈수록 낮아지게, 지형 위로 드러나게
  for (let i = pts.length - 2; i >= 0; i--) pts[i].h = Math.max(pts[i].h, pts[i + 1].h);
  const sTex = streamTexture();
  sTex.repeat.set(1, 1);
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    const w = 3.2;
    pos.push(p.x, p.h, p.z - w, p.x, p.h, p.z + w);
    uv.push(0, -i * 0.3, 1, -i * 0.3);
    if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sg.setIndex(idx);
  sg.computeVertexNormals();
  const streamMat = new THREE.MeshLambertMaterial({ map: sTex, transparent: true, opacity: 0.85 });
  const stream = new THREE.Mesh(sg, streamMat);
  g.add(stream);
  anim.push((t) => { sTex.offset.y = -t * 0.6; });

  // 물가 바위
  const R = rng(61);
  for (let i = 0; i < 90; i++) {
    const x = -545 + R() * 380, z = vz(x) + (R() < 0.5 ? -1 : 1) * (3 + R() * 7);
    const b = boulder(0.5 + R() * 1.6, 100 + i, R() < 0.5 ? rockMat : darkRockMat);
    b.position.set(x, terrainHeight(x, z) + 0.1, z);
    b.rotation.y = R() * 6;
    g.add(b);
  }

  // 무릉반석: 넓고 평평한 바위
  const bs = MUREUNG.banseok;
  let bh = -Infinity;
  for (let dx = -26; dx <= 26; dx += 4) for (let dz = -14; dz <= 14; dz += 4) bh = Math.max(bh, terrainHeight(bs.x + dx, bs.z + 2 + dz));
  bh -= 0.7;
  const shape = new THREE.Shape();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rx = 28 * (0.85 + noise2(i * 0.7, 3) * 0.3), rz = 15 * (0.85 + noise2(i * 0.7, 9) * 0.3);
    const x = Math.cos(a) * rx, y = Math.sin(a) * rz;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.5, bevelSegments: 1 });
  slabGeo.rotateX(Math.PI / 2);
  const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: '#bdb6a8', roughness: 0.95, flatShading: true }));
  slab.position.set(bs.x, bh + 0.5, bs.z + 2);
  slab.receiveShadow = true; slab.castShadow = true;
  g.add(slab);
  // 반석 위를 흐르는 얇은 물
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(50, 7), new THREE.MeshLambertMaterial({ map: sTex, transparent: true, opacity: 0.55 }));
  sheet.rotation.x = -Math.PI / 2; sheet.rotation.z = Math.PI / 2;
  sheet.position.set(bs.x, bh + 1.02, bs.z - 2);
  g.add(sheet);
  for (let k = 0; k < 7; k++) addSegPlatform(bs.x - 22, bs.z - 9 + k * 3.6, bs.x + 22, bs.z - 9 + k * 3.6, 3.8, bh + 1, bh + 1);
  // 반석으로 오르는 돌계단 (산책로 쪽)
  for (const ox of [-12, 10]) {
    const ax = bs.x + ox, az = bs.z + 24, bz = bs.z + 15;
    const ay = terrainHeight(ax, az) + 0.1;
    deckSegment(g, { x: ax, z: az, y: ay }, { x: ax, z: bz, y: bh + 1 }, 2.6, new THREE.MeshLambertMaterial({ color: '#a59f94' }), { rails: false, thick: 0.6 });
  }
  // 석각
  const eng = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshLambertMaterial({ map: engravingTexture(), transparent: true, opacity: 0.9 }));
  eng.rotation.x = -Math.PI / 2;
  eng.position.set(bs.x + 6, bh + 1.03, bs.z + 8);
  g.add(eng);
  placeSign(g, bs.x + 10, bs.z + 19, Math.PI, '무릉반석', '武陵盤石');

  // 삼화사
  const tp = MUREUNG.temple;
  const ty = terrainHeight(tp.x, tp.z);
  const hall = hanok(12, 7, 4.2, { walls: true, roofColor: '#40464c' });
  hall.position.set(tp.x, ty, tp.z + 4);
  hall.rotation.y = Math.PI; // 남쪽(계곡)을 향해
  g.add(hall);
  addBoxCollider(tp.x, tp.z + 4, 13, 8);
  for (const s of [-1, 1]) {
    const side = hanok(6, 4.5, 3, { walls: true, roofColor: '#40464c' });
    side.position.set(tp.x + s * 13, ty, tp.z - 2);
    side.rotation.y = -s * Math.PI / 2;
    g.add(side);
    addBoxCollider(tp.x + s * 13, tp.z - 2, 5.5, 7);
  }
  // 삼층석탑
  const pag = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: '#b3ada2' });
  let yy = 0;
  [[2.6, 0.8], [2.2, 1.2], [2.6, 0.3], [1.6, 0.9], [2.2, 0.3], [1.3, 0.8], [1.9, 0.3]].forEach(([w, h]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), stone);
    b.position.y = yy + h / 2; yy += h; b.castShadow = true; pag.add(b);
  });
  const spireP = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.4), stone);
  spireP.position.y = yy + 0.7; pag.add(spireP);
  pag.position.set(tp.x, ty + 0.2, tp.z - 6);
  g.add(pag);
  addCollider(tp.x, tp.z - 6, 1.6);
  // 연등
  const lanternCols = ['#ff5a5f', '#ffd166', '#06d6a0', '#f78c6b', '#ef476f', '#ffffff'];
  for (let i = 0; i < 18; i++) {
    const x = tp.x - 9 + (i % 9) * 2.2, z = tp.z - 3.4 + Math.floor(i / 9) * 2.2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshLambertMaterial({ color: lanternCols[i % 6], emissive: lanternCols[i % 6], emissiveIntensity: 0.35 }));
    l.position.set(x, ty + 4.1 + Math.sin(i) * 0.1, z);
    g.add(l);
  }
  for (const zz of [tp.z - 3.4, tp.z - 1.2]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(20, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: '#555' }));
    line.position.set(tp.x, ty + 4.5, zz);
    g.add(line);
  }
  // 일주문
  const gate = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 4.5, 10), new THREE.MeshLambertMaterial({ color: '#8b3a2b' }));
    p.position.set(s * 2.2, 2.25, 0); gate.add(p);
  }
  const gr = hipRoof(5, 1.6, 1.3);
  gr.position.y = 4.6; gate.add(gr);
  const gSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), new THREE.MeshBasicMaterial({ map: textTexture('頭陀山三和寺', { w: 256, h: 64, bg: '#1e2a2a', color: '#e8d9a8', size: 34 }) }));
  gSign.position.set(0, 4.3, 0.2); gate.add(gSign);
  const gx = -384, gz = vz(-384) + 22;
  gate.position.set(gx, terrainHeight(gx, gz), gz);
  gate.rotation.y = 0.15;
  g.add(gate);
  placeSign(g, tp.x + 6, tp.z - 12, Math.PI, '삼화사', '三和寺');

  // 쌍폭포
  const pool = MUREUNG.pool;
  const poolY = terrainHeight(pool.x, pool.z) + 1.3;
  const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(10, 32), new THREE.MeshLambertMaterial({ color: '#3f9fb0', transparent: true, opacity: 0.85 }));
  poolMesh.rotation.x = -Math.PI / 2;
  poolMesh.position.set(pool.x, poolY, pool.z);
  g.add(poolMesh);
  const wfTex = waterfallTexture();
  const falls = [];
  for (const dz of [-6, 6]) {
    const z = pool.z + dz;
    const topX = -574, botX = -551;
    const topY = terrainHeight(topX, z) + 0.6;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(topX, topY, z),
      new THREE.Vector3(-566, terrainHeight(-566, z) + 1.2, z),
      new THREE.Vector3(-558, terrainHeight(-558, z) + 1.0, z),
      new THREE.Vector3(botX, poolY, z),
    ]);
    const segs = 16, wdt = dz < 0 ? 3.4 : 2.6;
    const P = [], U = [], I = [];
    for (let i = 0; i <= segs; i++) {
      const p = curve.getPoint(i / segs);
      P.push(p.x, p.y, p.z - wdt / 2, p.x, p.y, p.z + wdt / 2);
      U.push(0, i / segs * 3, 1, i / segs * 3);
      if (i < segs) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    fg.setIndex(I);
    fg.computeVertexNormals();
    const fm = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    g.add(fm);
    falls.push(fm);
  }
  anim.push((t) => { wfTex.offset.y = t * 1.6; });
  // 물보라
  const spray = new THREE.BufferGeometry();
  const NP = 160;
  const sp = new Float32Array(NP * 3), life = new Float32Array(NP);
  for (let i = 0; i < NP; i++) life[i] = Math.random();
  spray.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sprayPts = new THREE.Points(spray, new THREE.PointsMaterial({ map: softDotTexture(), size: 2.2, transparent: true, opacity: 0.5, depthWrite: false, color: '#ffffff' }));
  sprayPts.frustumCulled = false;
  g.add(sprayPts);
  anim.push((t, dt) => {
    for (let i = 0; i < NP; i++) {
      life[i] += dt * 0.5;
      if (life[i] > 1) life[i] -= 1;
      const k = i % 2 ? 6 : -6;
      const l = life[i];
      const a = i * 2.4;
      sp[i * 3] = -550 + Math.cos(a) * l * 5 + l * 2;
      sp[i * 3 + 1] = poolY + l * 4;
      sp[i * 3 + 2] = pool.z + k + Math.sin(a) * l * 4;
    }
    spray.attributes.position.needsUpdate = true;
  });
  // 전망대 데크
  const dk = MUREUNG.deck;
  const dy = terrainHeight(dk.x, dk.z) + 0.6;
  deckSegment(g, { x: dk.x + 4, z: dk.z, y: dy }, { x: dk.x - 6, z: dk.z - 2, y: dy }, 3.4, woodDeck, { railMat: new THREE.MeshLambertMaterial({ color: '#6b4a2a' }) });
  placeSign(g, dk.x + 2, dk.z + 3, -Math.PI / 2, '쌍폭포', '雙瀑布');

  poi('mureung', 'mureung-temple', tp.x + 6, tp.z - 12, '삼화사 (三和寺)',
    ['두타산 자락, 무릉계곡 입구에 자리한 절이에요. 신라 선덕여왕 때 자장율사가 처음 세웠다는 이야기가 전해져요.',
      '계곡 초입의 일주문을 지나면 알록달록한 연등과 삼층석탑이 먼저 반겨 줘요. 절 앞마당에서 계곡 물소리가 들려요.']);
  poi('mureung', 'mureung-banseok', bs.x + 10, bs.z + 19, '무릉반석 (武陵盤石)',
    ['수백 명이 한꺼번에 앉을 수 있다는 넓고 평평한 바위예요. 그 위로 맑은 계곡물이 얇게 흘러가요.',
      '바위에는 조선 전기의 명필 양사언의 글씨로 전하는 "武陵仙源 中臺泉石 頭陀洞天(무릉선원 중대천석 두타동천)" 석각이 새겨져 있어요. 반석 가운데로 걸어가 보세요.'],
    { r: 9 });
  poi('mureung', 'mureung-falls', dk.x + 2, dk.z + 3, '쌍폭포',
    ['두 줄기 폭포가 양쪽 절벽에서 쏟아져 하나의 소(沼)에서 만나는 폭포예요. 무릉계곡 산책길의 대표 볼거리예요.',
      '여기서 조금 더 올라가면 용추폭포가 이어져요. 비가 온 뒤에 가면 물줄기가 훨씬 힘차요.']);
}

// ====================== 묵호 ======================
function buildMukho(scene, anim) {
  const g = new THREE.Group();
  scene.add(g);
  const R = rng(71);

  // 논골담길 집들 + 벽화
  const alley = MUKHO.alley;
  const roofCols = ['#3f7fbf', '#2e8b57', '#c0504d', '#e0a030', '#5b8fa8', '#7a9a5a'];
  const wallCols = ['#f3efe6', '#e8e2d0', '#f0e6d8', '#dfe8ea'];
  let muralIdx = 0;
  for (let i = 0; i < alley.length - 1; i++) {
    const a = alley[i], b = alley[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
    const nx = -tz, nz = tx;
    const count = Math.floor(len / 7);
    for (let k = 0; k < count; k++) {
      for (const side of [-1, 1]) {
        if (R() < 0.2) continue;
        const t = (k + 0.5) / count;
        const w = 5 + R() * 2, d = 5 + R() * 2, h = 2.8 + R() * 1.2;
        const off = 2.2 + d / 2 + R() * 1;
        const x = lerp(a.x, b.x, t) + nx * off * side, z = lerp(a.z, b.z, t) + nz * off * side;
        const y = terrainHeight(x, z);
        const yaw = Math.atan2(nx * side, nz * side) + Math.PI; // 앞면(+z 로컬)이 길을 향하게
        const house = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h + 2, d), new THREE.MeshLambertMaterial({ color: wallCols[Math.floor(R() * 4)] }));
        body.position.y = h / 2 - 1;
        body.castShadow = true; body.receiveShadow = true;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), new THREE.MeshLambertMaterial({ color: roofCols[Math.floor(R() * roofCols.length)] }));
        roof.position.y = h;
        house.add(body, roof);
        // 벽화
        const mural = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, h * 0.7), new THREE.MeshLambertMaterial({ map: muralTexture(muralIdx++) }));
        mural.position.set(0, h * 0.45, d / 2 + 0.03);
        house.add(mural);
        house.position.set(x, y, z);
        house.rotation.y = yaw;
        g.add(house);
        addBoxCollider(x, z, w, d, yaw);
      }
    }
  }
  placeSign(g, 136, -444, -Math.PI / 2 + 0.3, '논골담길', '묵호 벽화마을');

  // 묵호등대
  const lh = MUKHO.lighthouse;
  const ly = terrainHeight(lh.x, lh.z);
  const tower = new THREE.Group();
  const baseB = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 3, 16), white); baseB.position.y = 1.5;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.6, 16, 16), white); shaft.position.y = 11;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.3, 16), new THREE.MeshLambertMaterial({ color: '#34495e' })); gallery.position.y = 19.1;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2, 12), new THREE.MeshStandardMaterial({ color: '#fff6c9', emissive: '#ffe28a', emissiveIntensity: 0.6 })); lamp.position.y = 20.2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#c0392b' })); dome.position.y = 21.2;
  tower.add(baseB, shaft, gallery, lamp, dome);
  tower.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  tower.position.set(lh.x, ly - 0.2, lh.z);
  g.add(tower);
  addCollider(lh.x, lh.z, 4.8);
  placeSign(g, lh.x - 7, lh.z + 5, Math.PI * 0.75, '묵호등대', '1963년 첫 점등');

  // 도째비골 스카이워크
  const sb = MUKHO.skyBase;
  const sy = terrainHeight(sb.x, sb.z) + 0.3;
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd8ef', transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.2 });
  const frame = new THREE.MeshStandardMaterial({ color: '#4d5963', metalness: 0.6, roughness: 0.4 });
  const skyA = { x: sb.x, z: sb.z, y: sy }, skyB = { x: sb.x + 46, z: sb.z + 2, y: sy };
  const sgm = 5;
  for (let i = 0; i < sgm; i++) {
    const a = { x: lerp(skyA.x, skyB.x, i / sgm), z: lerp(skyA.z, skyB.z, i / sgm), y: sy };
    const b = { x: lerp(skyA.x, skyB.x, (i + 1) / sgm), z: lerp(skyA.z, skyB.z, (i + 1) / sgm), y: sy };
    deckSegment(g, a, b, 3.2, glass, { thick: 0.12, railMat: frame, noShadow: true });
  }
  // 프레임과 지지대
  for (const s of [-1.6, 1.6]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(46, 0.4, 0.25), frame);
    beam.position.set((skyA.x + skyB.x) / 2, sy - 0.3, (skyA.z + skyB.z) / 2 + s);
    beam.rotation.y = -Math.atan2(skyB.z - skyA.z, skyB.x - skyA.x);
    g.add(beam);
  }
  for (let i = 1; i <= 3; i++) {
    const x = lerp(skyA.x, skyB.x, i / 4), z = lerp(skyA.z, skyB.z, i / 4);
    const gy = Math.max(terrainHeight(x, z), -3);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, sy - gy, 8), frame);
    col.position.set(x, (sy + gy) / 2 - 0.3, z);
    col.castShadow = true;
    g.add(col);
  }
  // 끝 전망 데크
  addDiscPlatform(skyB.x, skyB.z, 2.4, sy);
  // 자이언트 슬라이드 (나선형 미끄럼틀)
  const helix = [];
  for (let i = 0; i <= 80; i++) {
    const a = i * 0.24, t = i / 80;
    helix.push(new THREE.Vector3(sb.x + 8 + Math.cos(a) * 3.2, sy + 3 - t * 16, sb.z - 12 + Math.sin(a) * 3.2 + t * 6));
  }
  const slide = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 200, 0.9, 10), new THREE.MeshLambertMaterial({ color: '#f39c12' }));
  slide.castShadow = true;
  g.add(slide);
  // 도깨비 조형물
  const dok = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: '#d64541' });
  const bodyD = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 1.4, 4, 10), red); bodyD.position.y = 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), red); head.position.y = 4;
  const hornM = new THREE.MeshLambertMaterial({ color: '#f5e6c4' });
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 8), hornM); horn.position.y = 5.3;
  const eyeW = new THREE.MeshBasicMaterial({ color: '#ffffff' }), eyeB = new THREE.MeshBasicMaterial({ color: '#111' });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), eyeW); e.position.set(s * 0.4, 4.2, 0.9);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeB); p.position.set(s * 0.4, 4.2, 1.15);
    dok.add(e, p);
  }
  const club = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.15, 2.6, 8), new THREE.MeshLambertMaterial({ color: '#8a5a2b' }));
  club.position.set(1.5, 2.8, 0.3); club.rotation.z = -0.6;
  dok.add(bodyD, head, horn, club);
  dok.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const dx = sb.x - 8, dz = sb.z + 6;
  dok.position.set(dx, terrainHeight(dx, dz), dz);
  dok.rotation.y = Math.PI * 0.6;
  g.add(dok);
  addCollider(dx, dz, 1.3);
  placeSign(g, sb.x - 3, sb.z - 4, -Math.PI / 2, '도째비골 스카이밸리', '하늘 산책로');

  // 해랑전망대: 바다 위로 뻗은 도깨비 방망이 모양 보행교
  const hr = MUKHO.haerang;
  const hy0 = terrainHeight(hr.x, hr.z) + 0.3;
  const hpts = [
    { x: hr.x, z: hr.z, y: hy0 },
    { x: hr.x + 18, z: hr.z + 2, y: 5.2 },
    { x: hr.x + 38, z: hr.z - 4, y: 5 },
    { x: hr.x + 56, z: hr.z - 2, y: 5 },
  ];
  const hdeck = new THREE.MeshLambertMaterial({ color: '#d7dde2' });
  for (let i = 0; i < hpts.length - 1; i++) deckSegment(g, hpts[i], hpts[i + 1], 3, hdeck, { railMat: new THREE.MeshLambertMaterial({ color: '#2c7fb8' }) });
  const end = { x: hr.x + 63, z: hr.z - 2 };
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.4, 30), hdeck);
  bulb.position.set(end.x, 4.8, end.z);
  bulb.receiveShadow = true;
  g.add(bulb);
  addDiscPlatform(end.x, end.z, 6.8, 5);
  addSegPlatform(hpts[3].x, hpts[3].z, end.x, end.z, 3, 5, 5);
  const bRail = new THREE.Mesh(new THREE.TorusGeometry(6.9, 0.06, 4, 48, Math.PI * 2 - 0.5), new THREE.MeshLambertMaterial({ color: '#2c7fb8' }));
  bRail.rotation.x = Math.PI / 2; bRail.rotation.z = Math.PI + 0.25;
  bRail.position.set(end.x, 6.1, end.z);
  g.add(bRail);
  // 방망이 돌기 장식
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.4) continue;
    const knob = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 8), new THREE.MeshLambertMaterial({ color: '#f1c40f' }));
    knob.position.set(end.x + Math.cos(a) * 7.2, 5.4, end.z + Math.sin(a) * 7.2);
    knob.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    g.add(knob);
  }
  // 교각
  const pierMat = new THREE.MeshLambertMaterial({ color: '#8f989f' });
  for (let i = 1; i < hpts.length; i++) {
    const p = hpts[i];
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, p.y + 12, 8), pierMat);
    pier.position.set(p.x, (p.y - 12) / 2, p.z);
    g.add(pier);
  }
  const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 17, 10), pierMat);
  pier.position.set(end.x, -3.8, end.z);
  g.add(pier);
  placeSign(g, hr.x - 4, hr.z + 4, Math.PI / 2, '해랑전망대', '바다 위 산책로');

  poi('mukho', 'mukho-alley', 136, -444, '논골담길',
    ['묵호등대 아래 언덕을 따라 이어진 골목이에요. 오징어와 명태를 널어 말리던 어촌 마을로, 골목 담벼락마다 마을 사람들의 이야기를 담은 벽화가 그려져 있어요.',
      '뱃일 나간 지게에서 흘러내린 바닷물로 골목이 늘 질척여서 "마누라 없이는 살아도 장화 없이는 못 산다"는 말이 전해질 정도였대요.',
      '벽화 골목을 따라 언덕 위 등대까지 올라가 보세요.']);
  poi('mukho', 'mukho-lighthouse', lh.x - 7, lh.z + 5, '묵호등대',
    ['1963년에 처음 불을 밝힌 등대로, 묵호항과 동해 바다를 한눈에 내려다볼 수 있는 언덕 꼭대기에 서 있어요.',
      '등대 주변은 해양문화공원으로 꾸며져 있고, 동쪽 비탈 아래로 도째비골 스카이밸리가 이어져요.']);
  poi('mukho', 'mukho-skywalk', skyB.x - 1, skyB.z, '도째비골 스카이워크',
    ['"도째비"는 도깨비의 강원도 사투리예요. 비 오는 날이면 이 골짜기에서 푸른 도깨비불이 보였다는 이야기에서 이름이 왔어요.',
      '발밑이 투명한 유리 바닥 산책로 끝에 서면 절벽 아래 바다가 그대로 보여요. 옆의 나선형 자이언트 슬라이드도 이곳 명물이에요.'],
    { r: 4, y: sy });
  poi('mukho', 'mukho-haerang', end.x, end.z, '해랑전망대',
    ['도째비골 아래 바다 위로 뻗어 나간 해상 보행교예요. 도깨비 방망이 모양을 본떠 만들었어요.',
      '발아래로 파도가 부서지는 모습을 볼 수 있어요. 고개를 들어 북쪽을 보면 언덕 위 묵호등대가 보여요.'],
    { r: 6, y: 5 });
}

export function buildSites(scene) {
  const anim = [];
  for (const s of SITES) stopShelter(scene, s);
  buildChuam(scene, anim);
  buildMureung(scene, anim);
  buildMukho(scene, anim);
  return {
    update(t, dt) { for (const f of anim) f(t, dt); },
    // 나무가 들어오면 안 되는 구역
    clearZones: [
      { x: CHUAM.pavilion.x, z: CHUAM.pavilion.z, r: 14 },
      { x: MUREUNG.banseok.x, z: MUREUNG.banseok.z, r: 40 },
      { x: MUREUNG.pool.x, z: MUREUNG.pool.z, r: 22 },
      { x: MUREUNG.temple.x, z: MUREUNG.temple.z, r: 30 },
      { x: -384, z: valleyZ(-384) + 22, r: 6 },
      { x: MUKHO.lighthouse.x, z: MUKHO.lighthouse.z, r: 16 },
      { x: MUKHO.skyBase.x, z: MUKHO.skyBase.z, r: 22 },
      { x: 150, z: -470, r: 45 },
    ],
  };
}
