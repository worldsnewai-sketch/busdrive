// 하늘, 빛, 지형 메시, 바다, 도로, 나무, 시내
import * as THREE from 'three';
import { WORLD, clamp, lerp, smoothstep, fbm, rng, coastX, valleyZ } from './geo.js';
import { NX, NZ, heights, terrainHeight, roadPaths, roadQuery, addCollider, addBoxCollider } from './terrain.js';
import { PADS, WALKWAYS, TOWN, TERMINAL, SITES } from './layout.js';
import { groundDetailTexture, roadTexture, pathTexture, windowTexture, textTexture, cloudTexture, signTexture } from './textures.js';

// ---------------- 하늘과 시간 ----------------
export function createEnvironment(scene) {
  const skyU = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float y = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(y,0.0,1.0), 0.55));
          if (y < 0.0) col = uHorizon * 0.92;
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.fog = new THREE.Fog(0xcfe3f0, 250, 1400);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6b45, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);

  const keys = [
    // [시각, 하늘 위, 지평선, 햇빛 색, 햇빛 세기, 반구광]
    [4.8, '#101a33', '#3a3550', '#ff7a45', 0.1, 0.25],
    [5.6, '#2d4270', '#e98a5e', '#ff8a4c', 0.8, 0.45],
    [6.4, '#4f78b0', '#f6c08a', '#ffc27a', 1.5, 0.7],
    [8.0, '#5d9fd8', '#cfe3f0', '#fff1dc', 2.2, 0.9],
    [15.5, '#5d9fd8', '#d4e6f1', '#ffffff', 2.3, 0.95],
    [18.0, '#4b6fa8', '#f0b27a', '#ffb070', 1.4, 0.6],
    [19.2, '#1c2446', '#8a5a6a', '#ff7040', 0.3, 0.3],
  ].map((k) => ({ t: k[0], top: new THREE.Color(k[1]), hor: new THREE.Color(k[2]), sc: new THREE.Color(k[3]), si: k[4], hi: k[5] }));

  const env = {
    time: 10.5, sky, sun, hemi, sunDir: new THREE.Vector3(),
    horizon: new THREE.Color(), skyTop: new THREE.Color(), sunColor: new THREE.Color(),
    setTime(t) {
      this.time = t;
      const a = ((t - 6) / 12) * Math.PI;
      this.sunDir.set(Math.cos(a), Math.sin(a) * 0.9, 0.35).normalize();
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      const A = keys[i], B = keys[i + 1];
      const f = clamp((t - A.t) / (B.t - A.t), 0, 1);
      this.skyTop.copy(A.top).lerp(B.top, f);
      this.horizon.copy(A.hor).lerp(B.hor, f);
      this.sunColor.copy(A.sc).lerp(B.sc, f);
      skyU.uTop.value.copy(this.skyTop);
      skyU.uHorizon.value.copy(this.horizon);
      skyU.uSunDir.value.copy(this.sunDir);
      skyU.uSunColor.value.copy(this.sunColor);
      sun.color.copy(this.sunColor);
      sun.intensity = lerp(A.si, B.si, f);
      hemi.intensity = lerp(A.hi, B.hi, f);
      hemi.color.copy(this.skyTop).lerp(new THREE.Color('#ffffff'), 0.5);
      scene.fog.color.copy(this.horizon);
    },
    follow(target, camera) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(this.sunDir, 220);
      sky.position.copy(camera.position);
    },
  };
  env.setTime(10.5);
  return env;
}

// ---------------- 지형 ----------------
const C = (h) => new THREE.Color(h);
const COL = {
  sand: C('#d8c79c'), wetSand: C('#b5a27a'), seabed: C('#6f7f7a'),
  grass: C('#6d9a45'), grass2: C('#86a94f'), forest: C('#40703a'), rock: C('#7f7a70'), cliff: C('#6a655d'),
  plaza: C('#a8a294'),
};

export function createTerrain(scene) {
  const W = NX + 1;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(W * (NZ + 1) * 3);
  const uv = new Float32Array(W * (NZ + 1) * 2);
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i;
    const x = WORLD.x0 + i * WORLD.cell, z = WORLD.z0 + j * WORLD.cell;
    pos[k * 3] = x; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 18; uv[k * 2 + 1] = z / 18;
  }
  const idx = new Uint32Array(NX * NZ * 6);
  let p = 0;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * W + i, b = (j + 1) * W + i, c = j * W + i + 1, d = (j + 1) * W + i + 1;
    idx[p++] = a; idx[p++] = b; idx[p++] = c;
    idx[p++] = c; idx[p++] = b; idx[p++] = d;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal.array;
  const col = new Float32Array(pos.length);
  const tmp = new THREE.Color();
  for (let k = 0; k < W * (NZ + 1); k++) {
    const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
    const d = coastX(z) - x;
    const ny = nrm[k * 3 + 1];
    const n = fbm(x * 0.02, z * 0.02, 3);
    if (h < -0.2) tmp.copy(COL.wetSand).lerp(COL.seabed, smoothstep(-0.2, -6, h));
    else if (h < 3.2 && d < 45 && d > -20) tmp.copy(COL.sand).lerp(COL.wetSand, smoothstep(0.6, -0.2, h));
    else {
      tmp.copy(COL.grass).lerp(COL.grass2, n);
      const forest = smoothstep(-150, -330, x) * 0.8 + smoothstep(12, 30, h) * 0.5;
      tmp.lerp(COL.forest, clamp(forest, 0, 0.85));
    }
    // 경사 급하면 바위
    tmp.lerp(k % 3 ? COL.rock : COL.cliff, smoothstep(0.82, 0.6, ny));
    // 도로 주변 흙길 느낌
    const rq = roadQuery(x, z);
    if (rq.dist < 8) tmp.lerp(COL.plaza, 0.4 * (1 - rq.dist / 8));
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: groundDetailTexture() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ---------------- 바다 ----------------
export function createSea(scene, env) {
  const W = NX + 1;
  const data = new Uint8Array(W * (NZ + 1) * 4);
  for (let k = 0; k < W * (NZ + 1); k++) {
    const v = clamp(-heights[k] / 12, 0, 1) * 255;
    data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
  }
  const depthTex = new THREE.DataTexture(data, W, NZ + 1, THREE.RGBAFormat);
  depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uSkyColor: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color('#0d4a73') },
    uShallow: { value: new THREE.Color('#2fa3b0') },
    uDepth: { value: depthTex },
    uRect: { value: new THREE.Vector4(WORLD.x0, WORLD.z0, WORLD.x1 - WORLD.x0, WORLD.z1 - WORLD.z0) },
  }]);
  uniforms.uDepth.value = depthTex;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: `varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyColor; uniform vec3 uDeep; uniform vec3 uShallow;
      uniform sampler2D uDepth; uniform vec4 uRect; varying vec3 vWorld;
      #include <fog_pars_fragment>
      void addWave(inout vec2 g, vec2 p, vec2 dir, float f, float s, float a){ float ph = dot(p,dir)*f + uTime*s; g += dir*f*a*cos(ph); }
      void main(){
        vec2 p = vWorld.xz; vec2 g = vec2(0.0);
        addWave(g,p,normalize(vec2(-1.0,0.2)),0.08,1.1,0.35);
        addWave(g,p,normalize(vec2(-0.7,-0.6)),0.15,1.6,0.16);
        addWave(g,p,normalize(vec2(-0.3,0.9)),0.31,2.3,0.07);
        addWave(g,p,normalize(vec2(0.8,0.5)),0.7,3.1,0.025);
        addWave(g,p,normalize(vec2(-0.9,-0.1)),1.3,4.0,0.012);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96*pow(1.0 - max(dot(n,V),0.0), 5.0);
        vec2 uv = (p - uRect.xy)/uRect.zw;
        float depth = texture2D(uDepth, uv).r;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) depth = 1.0;
        vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 0.55, depth));
        vec3 col = mix(base, uSkyColor, fres*0.8);
        vec3 H = normalize(normalize(uSunDir) + V);
        col += uSunColor * pow(max(dot(n,H),0.0), 220.0) * 2.5;
        float shore = smoothstep(0.07, 0.0, depth);
        float foam = 0.5 + 0.5*sin(depth*90.0 - uTime*2.2 + sin(p.x*0.3)*1.5);
        col = mix(col, vec3(0.96,0.98,1.0), shore * (0.35 + 0.65*foam));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0, 0);
  scene.add(sea);
  return {
    mesh: sea,
    update(t) {
      uniforms.uTime.value = t;
      uniforms.uSunDir.value.copy(env.sunDir);
      uniforms.uSunColor.value.copy(env.sunColor);
      uniforms.uSkyColor.value.copy(env.horizon).lerp(env.skyTop, 0.3);
    },
  };
}

// ---------------- 도로와 산책로 ----------------
function ribbon(pts, width, yOff, texRepeatLen, sampleH) {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    if (i > 0) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const x = pts[i].x + nx * side * width / 2, z = pts[i].z + nz * side * width / 2;
      const y = (sampleH ? sampleH(x, z, pts[i]) : pts[i].h) + yOff;
      const k = i * 2 + s;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = s; uv[k * 2 + 1] = dist / texRepeatLen;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createRoads(scene) {
  const rt = roadTexture();
  const mat = new THREE.MeshLambertMaterial({ map: rt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  for (const r of roadPaths) {
    const g = ribbon(r.pts, 9, 0.12, 14, (x, z, p) => Math.max(p.h, terrainHeight(x, z)));
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
  }
  // 산책로
  const pmat = new THREE.MeshLambertMaterial({ map: pathTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  for (const w of WALKWAYS) {
    const curve = new THREE.CatmullRomCurve3(w.pts.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
    const n = Math.max(4, Math.round(curve.getLength() / 1.5));
    const pts = curve.getSpacedPoints(n).map((v) => ({ x: v.x, z: v.z, h: 0 }));
    const g = ribbon(pts, w.w, 0.1, w.w, (x, z) => terrainHeight(x, z));
    const m = new THREE.Mesh(g, pmat);
    m.receiveShadow = true;
    scene.add(m);
  }
  // 가로등
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  const armGeo = new THREE.BoxGeometry(1.6, 0.12, 0.25);
  armGeo.translate(0.7, 7, 0);
  const poles = [];
  const ends = roadPaths.flatMap((r) => [r.pts[0], r.pts[r.pts.length - 1]]);
  for (const r of roadPaths) {
    for (let i = 5; i < r.pts.length; i += 14) {
      const p = r.pts[i];
      const side = (i / 14) % 2 < 1 ? 1 : -1;
      const x = p.x - p.tz * 5.6 * side, z = p.z + p.tx * 5.6 * side;
      if (terrainHeight(x, z) < 0.5 || roadQuery(x, z).dist < 5.4) continue; // 다른 도로 위에는 세우지 않음
      if (ends.some((q) => Math.hypot(q.x - x, q.z - z) < 28)) continue;     // 교차로·정류장 주변 비움
      poles.push({ x, z, y: terrainHeight(x, z), yaw: Math.atan2(p.tz * side, -p.tx * side) });
    }
  }
  const pm = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#8a9096' }), poles.length);
  const am = new THREE.InstancedMesh(armGeo, new THREE.MeshLambertMaterial({ color: '#8a9096' }), poles.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  poles.forEach((p, i) => {
    q.setFromEuler(e.set(0, p.yaw, 0));
    m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1));
    pm.setMatrixAt(i, m4); am.setMatrixAt(i, m4);
    addCollider(p.x, p.z, 0.3);
  });
  pm.castShadow = true;
  scene.add(pm, am);
}

// ---------------- 나무 ----------------
export function createTrees(scene, clearZones) {
  const R = rng(1234);
  const list = [];
  const walkPts = [];
  for (const w of WALKWAYS) for (let i = 0; i < w.pts.length - 1; i++) walkPts.push([w.pts[i], w.pts[i + 1]]);
  const distSeg = (x, z, a, b) => {
    const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / l2, 0, 1);
    return Math.hypot(a.x + abx * t - x, a.z + abz * t - z);
  };
  for (let n = 0; n < 26000 && list.length < 4200; n++) {
    const x = lerp(WORLD.x0 + 20, WORLD.x1 - 20, R()), z = lerp(WORLD.z0 + 20, WORLD.z1 - 20, R());
    const d = coastX(z) - x;
    if (d < 38) continue;
    const h = terrainHeight(x, z);
    if (h < 2.5) continue;
    const slope = Math.abs(terrainHeight(x + 3, z) - h) + Math.abs(terrainHeight(x, z + 3) - h);
    if (slope > 4.5) continue;
    let dens = 0.18 + smoothstep(-120, -320, x) * 0.7 + smoothstep(10, 30, h) * 0.4 + fbm(x * 0.01, z * 0.01) * 0.3;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r + 30) dens *= 0.1;
    if (R() > dens) continue;
    if (roadQuery(x, z).dist < 12) continue;
    let bad = false;
    for (const p of PADS) if (Math.hypot(x - p.x, z - p.z) < p.r + 4) { bad = true; break; }
    if (bad) continue;
    for (const cz of clearZones) if (Math.hypot(x - cz.x, z - cz.z) < cz.r) { bad = true; break; }
    if (bad) continue;
    // 무릉계곡 물길
    if (x < -150 && x > -560 && Math.abs(z - valleyZ(x)) < 9) continue;
    for (const [a, b] of walkPts) if (distSeg(x, z, a, b) < 4) { bad = true; break; }
    if (bad) continue;
    list.push({ x, z, y: h, s: 0.7 + R() * 0.7, broad: R() < (x > -150 ? 0.35 : 0.1), c: R() });
  }
  const pines = list.filter((t) => !t.broad), broads = list.filter((t) => t.broad);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 3, 5); trunkGeo.translate(0, 1.5, 0);
  const cone1 = new THREE.ConeGeometry(2.4, 4.6, 7); cone1.translate(0, 4.6, 0);
  const cone2 = new THREE.ConeGeometry(1.7, 3.6, 7); cone2.translate(0, 7.0, 0);
  const ball = new THREE.IcosahedronGeometry(2.6, 0); ball.translate(0, 4.4, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#5b4331' });
  const leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const make = (geo, mat, arr, colFn) => {
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    arr.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.c * 6.28);
      m4.compose(new THREE.Vector3(t.x, t.y - 0.2, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + t.c * 0.3), t.s));
      im.setMatrixAt(i, m4);
      if (colFn) im.setColorAt(i, colFn(t, c));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  };
  const pineCol = (t, c) => c.setHSL(0.28 + t.c * 0.05, 0.42, 0.22 + t.c * 0.08);
  const broadCol = (t, c) => c.setHSL(0.2 + t.c * 0.09, 0.45, 0.32 + t.c * 0.1);
  make(trunkGeo, trunkMat, list);
  make(cone1, leafMat, pines, pineCol);
  make(cone2, leafMat, pines, pineCol);
  make(ball, leafMat.clone(), broads, broadCol);
  for (const t of list) addCollider(t.x, t.z, 0.45 * t.s, 'tree');
  return list;
}

// ---------------- 시내 (동해 시내와 터미널) ----------------
export function createTown(scene) {
  const R = rng(99);
  const group = new THREE.Group();
  const mats = [0, 1, 2, 3, 4].map((i) => new THREE.MeshLambertMaterial({ map: windowTexture(40 + i, ['#d9d4c8', '#e8e1d3', '#c9d2d6', '#e6d5c3', '#d0cfc0'][i]) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: '#6f7479' });
  const placed = [];
  const tryPlace = (x, z, w, d) => {
    if (roadQuery(x, z).dist < Math.max(w, d) / 2 + 7) return false;
    if (Math.hypot(x - TERMINAL.x, z - TERMINAL.z) < 30) return false;
    for (const p of placed) if (Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.z - z) < (p.d + d) / 2 + 4) return false;
    placed.push({ x, z, w, d });
    return true;
  };
  // 아파트 단지
  let apt = 101;
  for (let n = 0; n < 200 && apt < 109; n++) {
    const x = TOWN.x - 110 + R() * 90, z = TOWN.z - 100 + R() * 200;
    const w = 34, d = 12, h = 30 + Math.floor(R() * 4) * 6;
    if (!tryPlace(x, z, w, d)) continue;
    const y = terrainHeight(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[apt % 5]);
    m.material = m.material.clone(); m.material.map = m.material.map.clone();
    m.material.map.repeat.set(w / 4, h / 3); m.material.map.needsUpdate = true;
    m.position.set(x, y + h / 2 - 0.5, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: textTexture(`${apt}동`, { color: '#1b4f9c', bg: '#f4f1ea', size: 44 }) }));
    label.position.set(x + w / 2 - 6, y + h - 4, z + d / 2 + 0.05);
    group.add(label);
    addBoxCollider(x, z, w, d);
    apt++;
  }
  // 상가 건물
  for (let n = 0; n < 400 && placed.length < 60; n++) {
    const x = TOWN.x - 120 + R() * 240, z = TOWN.z - 120 + R() * 240;
    const w = 10 + R() * 12, d = 10 + R() * 10, h = 6 + Math.floor(R() * 5) * 3.2;
    if (!tryPlace(x, z, w, d)) continue;
    const y = terrainHeight(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[Math.floor(R() * 5)]);
    m.material = m.material.clone(); m.material.map = m.material.map.clone();
    m.material.map.repeat.set(Math.round(w / 4), Math.round(h / 3.2)); m.material.map.needsUpdate = true;
    m.position.set(x, y + h / 2 - 0.5, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roofMat);
    roof.position.set(x, y + h - 0.3, z);
    group.add(roof);
    // 간판
    if (R() < 0.7) {
      const names = ['동해수산', '묵호횟집', '편의점', '카페 바다', '약국', '분식', '해물칼국수', '문구', '빵집', '곰치국'];
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 8), 1.6), new THREE.MeshBasicMaterial({ map: textTexture(names[Math.floor(R() * names.length)], { bg: ['#c0392b', '#1f5fa8', '#2e7d4f', '#f0a500'][Math.floor(R() * 4)], color: '#fff', size: 40 }) }));
      sg.position.set(x, y + 3.2, z + d / 2 + 0.06);
      group.add(sg);
    }
    addBoxCollider(x, z, w, d);
  }
  // 터미널
  const ty = terrainHeight(TERMINAL.x, TERMINAL.z);
  const term = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 12), new THREE.MeshLambertMaterial({ color: '#e9eef2' }));
  term.position.set(TERMINAL.x - 6, ty + 3.3, TERMINAL.z - 16);
  term.castShadow = true;
  group.add(term);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 8), new THREE.MeshLambertMaterial({ color: '#1b4f9c' }));
  canopy.position.set(TERMINAL.x - 6, ty + 5, TERMINAL.z - 7);
  group.add(canopy);
  const tsign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: textTexture('동해 시티투어 터미널', { w: 512, h: 80, bg: '#1b4f9c', color: '#fff', size: 44 }) }));
  tsign.position.set(TERMINAL.x - 6, ty + 6.2, TERMINAL.z - 9.9);
  group.add(tsign);
  addBoxCollider(TERMINAL.x - 6, TERMINAL.z - 16, 26, 12);
  scene.add(group);
}

// ---------------- 구름과 갈매기 ----------------
export function createAmbient(scene) {
  const R = rng(77);
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(i + 1), transparent: true, depthWrite: false, opacity: 0.85, fog: false }));
    const s = 160 + R() * 220;
    m.scale.set(s, s / 2, 1);
    m.position.set(-900 + R() * 2600, 260 + R() * 160, -1200 + R() * 2400);
    scene.add(m);
    clouds.push(m);
  }
  // 갈매기
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.35, 0, 0, -0.3, 1.1, 0.1, 0.05, 0, 0, 0.35, -1.1, 0.1, 0.05, 0, 0, -0.3]), 3));
  wing.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: '#f4f6f7', side: THREE.DoubleSide });
  const birds = [];
  const centers = [{ x: 240, z: 470 }, { x: 230, z: -470 }, { x: 260, z: 0 }, { x: 300, z: 250 }];
  for (let i = 0; i < 22; i++) {
    const b = new THREE.Mesh(wing.clone(), birdMat);
    const c = centers[i % centers.length];
    b.userData = { cx: c.x + (R() - 0.5) * 60, cz: c.z + (R() - 0.5) * 60, r: 20 + R() * 40, h: 18 + R() * 25, sp: (0.15 + R() * 0.2) * (R() < 0.5 ? -1 : 1), ph: R() * 6.28 };
    scene.add(b);
    birds.push(b);
  }
  return {
    update(t) {
      for (const c of clouds) { c.position.x += 0.02; if (c.position.x > 1800) c.position.x = -900; }
      for (const b of birds) {
        const u = b.userData, a = u.ph + t * u.sp;
        b.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(t * 0.7 + u.ph) * 3, u.cz + Math.sin(a) * u.r);
        b.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * 8 + u.ph);
        const p = b.geometry.attributes.position;
        p.setY(2, 0.1 + flap * 0.45); p.setY(4, 0.1 + flap * 0.45);
        p.needsUpdate = true;
      }
    },
  };
}

// 정류장 빛기둥 + 떠 있는 이름표
export function createStopMarkers(scene, labelTex) {
  const markers = [];
  for (const s of SITES) {
    const y = terrainHeight(s.stop.x, s.stop.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 90, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.set(s.stop.x, y + 45, s.stop.z);
    scene.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 10.5, 40), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.stop.x, y + 0.25, s.stop.z);
    scene.add(ring);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(s.name, s.color), depthTest: false, transparent: true, sizeAttenuation: false }));
    label.scale.set(0.16, 0.04, 1);
    label.position.set(s.stop.x, y + 28, s.stop.z);
    label.renderOrder = 5;
    scene.add(label);
    markers.push({ site: s, beam, ring, label });
  }
  return markers;
}

// 관광 안내판 (갈색)
export function makeSign(title, sub) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#4a2f1b' });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), wood); p1.position.set(-1.1, 1.2, 0);
  const p2 = p1.clone(); p2.position.x = 1.1;
  const face = new THREE.MeshLambertMaterial({ map: signTexture(title, sub) });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.1), [wood, wood, wood, wood, face, face]);
  board.position.y = 2.0;
  board.castShadow = true;
  g.add(p1, p2, board);
  return g;
}
