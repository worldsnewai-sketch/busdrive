// 게임 진행: 운전 ↔ 걷기, 카메라, 정류장, 스탬프
import * as THREE from 'three';
import { clamp, lerp, coastX, smoothstep } from './geo.js';
import { terrainHeight } from './terrain.js';
import { SITES, MUREUNG, CHUAM } from './layout.js';
import { createEnvironment, createTerrain, createSea, createRoads, createTrees, createTown, createAmbient, createStopMarkers } from './world.js';
import { buildSites, POIS } from './sites.js';
import { labelTexture } from './textures.js';
import { Bus } from './bus.js';
import { Walker } from './player.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';
import { Autopilot } from './autopilot.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 4000);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- 월드 ----------
const env = createEnvironment(scene);
createTerrain(scene);
const sea = createSea(scene, env);
createRoads(scene);
const sites = buildSites(scene);
createTrees(scene, sites.clearZones);
createTown(scene);
const ambient = createAmbient(scene);
const markers = createStopMarkers(scene, labelTexture);
const bus = new Bus(scene);
const walker = new Walker(scene);
const input = new Input(canvas);
const sound = new Sound();
const hud = new Hud();
const pilot = new Autopilot();

// ---------- 상태 ----------
const SAVE_KEY = 'donghae-bus-tour-v1';
const got = new Set();
try { (JSON.parse(localStorage.getItem(SAVE_KEY) || '{}').stamps || []).forEach((id) => got.add(id)); } catch { /* 저장소 없음 */ }
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ stamps: [...got] })); } catch { /* 무시 */ } };

let mode = 'title';           // title | drive | walk
let camMode = 'chase';        // chase | cockpit
let destIdx = 1;              // 추암부터
let camYaw = 0, camPitch = 0.32, camDist = 7.5;
let chaseYawOff = 0, chasePitchOff = 0;
let atStop = null;            // 버스가 정차 범위 안에 있는 정류장
let lastAnnounced = null;
let timeAnim = null;          // 해돋이 연출
let finishedShown = got.size >= POIS.length;
let paused = false;
let snapCam = false;
let timeScale = 1;            // 배속 (1×, 2×, 4×)
const clock = new THREE.Clock();
let elapsed = 0;

// 터미널에서 출발
bus.place(30, -27, Math.PI / 2);
hud.renderStamps(POIS, got);

// 타이틀 배경: 추암 촛대바위 주변을 천천히 도는 카메라
function titleCamera(t) {
  const c = CHUAM.rock;
  const a = t * 0.05 + 2.2;
  camera.position.set(c.x + Math.cos(a) * 70, 22, c.z + Math.sin(a) * 70);
  camera.position.y = Math.max(camera.position.y, terrainHeight(camera.position.x, camera.position.z) + 8);
  camera.lookAt(c.x, 8, c.z);
}

// ---------- UI 연결 ----------
const startBtn = $('startBtn');
startBtn.disabled = false;
startBtn.textContent = '운행 시작';
startBtn.onclick = () => {
  sound.start();
  $('title').hidden = true;
  hud.show();
  if (isTouch) $('touch').hidden = false;
  mode = 'drive';
  canvas.focus();
  const d = SITES[destIdx];
  hud.toast(`<b>동해 시티투어 버스</b>를 출발합니다. 목적지: ${d.name}`, 'announce');
  sound.chime();
};
$('titleHelp').onclick = () => { $('help').hidden = false; };
$('helpClose').onclick = () => { $('help').hidden = true; canvas.focus(); };
$('bHelp').onclick = () => { $('help').hidden = false; };
$('bMap').onclick = () => toggleMap();
$('minimap').onclick = () => toggleMap();
$('bigmap').onclick = () => toggleMap();
$('bCam').onclick = () => toggleCam();
$('bAuto').onclick = () => togglePilot();
$('bFast').onclick = () => cycleSpeed();
$('bSound').onclick = () => {
  sound.setMuted(!sound.muted);
  $('bSound').setAttribute('aria-pressed', String(sound.muted));
  $('bSound').textContent = sound.muted ? '×' : '♪';
};
$('led').onclick = () => setDest((destIdx + 1) % SITES.length);
$('infoClose').onclick = () => hud.closeInfo();
$('finishClose').onclick = () => { $('finish').hidden = true; canvas.focus(); };

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) {
  document.body.classList.add('touch');
  input.bindTouch($('joy'), $('knob'), $('look'), [[$('tE'), 'KeyE'], [$('tSpace'), 'Space'], [$('tH'), 'KeyH'], [$('tC'), 'KeyC']]);
}

function toggleMap() {
  const bm = $('bigmap');
  bm.hidden = !bm.hidden;
  if (!bm.hidden) hud.drawBigMap(playerPos(), heading(), SITES[destIdx]);
}
function toggleCam() {
  if (mode !== 'drive') return;
  camMode = camMode === 'chase' ? 'cockpit' : 'chase';
  hud.toast(camMode === 'cockpit' ? '운전석 시점' : '뒤따라가는 시점');
}
function setDest(i) {
  destIdx = i;
  hud.toast(`목적지를 <b>${SITES[i].name}</b>(으)로 바꿨어요`, 'announce');
  if (pilot.active) pilot.start(bus, SITES[i].stop);
}
function setPilot(on, msg) {
  if (on) pilot.start(bus, SITES[destIdx].stop); else pilot.cancel();
  $('bAuto').setAttribute('aria-pressed', String(on));
  $('led').classList.toggle('auto', on);
  if (msg) hud.toast(msg, 'announce');
}
function togglePilot() {
  if (mode !== 'drive') { hud.toast('버스에 타야 자동운전을 쓸 수 있어요'); return; }
  if (pilot.active) setPilot(false, '자동운전을 껐어요');
  else setPilot(true, `<b>자동운전</b>으로 ${SITES[destIdx].name}까지 갑니다. 방향키를 누르면 직접 운전으로 바뀌어요.`);
}
const SPEEDS = [1, 2, 4];
function cycleSpeed() {
  timeScale = SPEEDS[(SPEEDS.indexOf(timeScale) + 1) % SPEEDS.length];
  $('bFast').textContent = `${timeScale}×`;
  $('bFast').setAttribute('aria-pressed', String(timeScale > 1));
  hud.toast(timeScale === 1 ? '보통 속도로 돌아왔어요' : `<b>${timeScale}배속</b>으로 진행해요`);
}

const playerPos = () => (mode === 'walk' ? { x: walker.x, z: walker.z } : { x: bus.x, z: bus.z });
const heading = () => (mode === 'walk' ? (camYaw + Math.PI) : bus.yaw);

// ---------- 모드 전환 ----------
function getOff() {
  setPilot(false);
  const door = bus.local(-2.6, 3.8);
  walker.place(door.x, door.z, bus.yaw - Math.PI / 2);
  walker.mesh.visible = true;
  mode = 'walk';
  camYaw = bus.yaw + Math.PI * 1.25; // 버스 반대편(오른쪽 뒤)에서 바라봄
  snapCam = true;
  camPitch = 0.3; camDist = 7.5;
  bus.speed = 0;
  sound.tone(520, 0.2, 'triangle', 0.1);
  hud.toast(`<b>${atStop.name}</b>에서 내렸어요. 안내판을 찾아 스탬프를 모아 보세요.`, 'announce');
}
function getOn() {
  walker.mesh.visible = false;
  hud.closeInfo();
  mode = 'drive';
  // 다음 목적지: 아직 스탬프가 남은 곳
  const next = SITES.findIndex((s) => s !== atStop && POIS.some((p) => p.site === s.id && !got.has(p.id)));
  if (next >= 0 && SITES[destIdx] === atStop) destIdx = next;
  sound.tone(440, 0.2, 'triangle', 0.1);
  hud.toast(`승차 완료. 다음 목적지: <b>${SITES[destIdx].name}</b>`, 'announce');
}

function busColliders() {
  const r = [];
  for (const lz of [-4, -1.3, 1.3, 4]) { const p = bus.local(0, lz); r.push({ x: p.x, z: p.z, r: 1.3 }); }
  return r;
}

// ---------- 스탬프와 안내판 ----------
function siteOf(id) { return SITES.find((s) => s.id === id); }
function infoActions(p) {
  const acts = [];
  if (p.action === 'sunrise') {
    acts.push({ label: '해돋이 보기', primary: true, run: () => { timeAnim = { from: 4.9, to: 6.6, t: 0, dur: 24 }; hud.toast('동쪽 바다를 바라보세요. 곧 해가 떠올라요.', 'announce'); hud.closeInfo(); camYaw = Math.PI * 1.5 - 0.3; camPitch = 0.22; } });
    acts.push({ label: '낮으로 돌아가기', run: () => { timeAnim = { from: env.time, to: 10.5, t: 0, dur: 3 }; } });
  }
  acts.push({ label: '닫기', run: () => hud.closeInfo() });
  return acts;
}
function collect(p) {
  if (got.has(p.id)) return;
  got.add(p.id);
  save();
  sound.stamp();
  hud.renderStamps(POIS, got);
  hud.toast(`<b>스탬프 획득</b> · ${p.title} (${got.size}/${POIS.length})`, 'stamp');
  hud.openInfo(p, siteOf(p.site).name, infoActions(p));
  if (got.size >= POIS.length && !finishedShown) {
    finishedShown = true;
    setTimeout(() => { $('finish').hidden = false; }, 2500);
  }
}

// ---------- 카메라 ----------
const camTarget = new THREE.Vector3();
const tmpV = new THREE.Vector3();
function updateCamera(dt) {
  const look = input.consumeLook();
  const wheel = input.consumeWheel();
  if (mode === 'drive') {
    const f = bus.forward();
    if (camMode === 'chase') {
      chaseYawOff -= look.dx * 0.006;
      chasePitchOff = clamp(chasePitchOff + look.dy * 0.004, -0.2, 0.7);
      if (!input.look.dragging) { chaseYawOff *= Math.exp(-dt * 1.5); chasePitchOff *= Math.exp(-dt * 1.5); }
      const a = bus.yaw + Math.PI + chaseYawOff;
      const dist = 15 + Math.abs(bus.speed) * 0.12;
      const h = 5.2 + chasePitchOff * 12;
      tmpV.set(bus.x + Math.sin(a) * dist, bus.y + h, bus.z + Math.cos(a) * dist);
      tmpV.y = Math.max(tmpV.y, terrainHeight(tmpV.x, tmpV.z) + 1.5);
      const k = 1 - Math.exp(-dt * 5);
      camera.position.lerp(tmpV, k);
      camTarget.set(bus.x + f.x * 5, bus.y + 2.4, bus.z + f.z * 5);
      camera.lookAt(camTarget);
    } else {
      chaseYawOff = clamp(chaseYawOff - look.dx * 0.005, -1.8, 1.8);
      chasePitchOff = clamp(chasePitchOff - look.dy * 0.004, -0.6, 0.5);
      if (!input.look.dragging) { chaseYawOff *= Math.exp(-dt * 2); chasePitchOff *= Math.exp(-dt * 2); }
      bus.mesh.updateMatrixWorld(true);
      tmpV.set(0.72, 2.3, 4.55).applyMatrix4(bus.mesh.matrixWorld);
      camera.position.copy(tmpV);
      const a = chaseYawOff, p = -0.1 + chasePitchOff;
      tmpV.set(0.72 + Math.sin(a) * 10, 2.3 + Math.sin(p) * 10, 4.55 + Math.cos(a) * 10).applyMatrix4(bus.mesh.matrixWorld);
      camera.lookAt(tmpV);
    }
    if (bus.bump > 0) {
      camera.position.x += (Math.random() - 0.5) * bus.bump * 0.4;
      camera.position.y += (Math.random() - 0.5) * bus.bump * 0.4;
    }
  } else if (mode === 'walk') {
    camYaw -= look.dx * 0.006;
    camPitch = clamp(camPitch + look.dy * 0.004, -0.15, 1.25);
    camDist = clamp(camDist + wheel * 0.8, 3, 18);
    camTarget.set(walker.x, walker.y + 1.6, walker.z);
    const cp = Math.cos(camPitch);
    let d = camDist;
    tmpV.set(walker.x + Math.sin(camYaw) * cp * d, walker.y + 1.6 + Math.sin(camPitch) * d, walker.z + Math.cos(camYaw) * cp * d);
    const gh = terrainHeight(tmpV.x, tmpV.z) + 0.6;
    if (tmpV.y < gh) tmpV.y = gh;
    if (snapCam) { camera.position.copy(tmpV); snapCam = false; }
    else camera.position.lerp(tmpV, 1 - Math.exp(-dt * 12));
    camera.lookAt(camTarget);
  }
}

// ---------- 루프 ----------
function nearestSite(x, z) {
  let best = null, bd = Infinity;
  for (const s of SITES) { const d = Math.hypot(x - s.stop.x, z - s.stop.z); if (d < bd) { bd = d; best = s; } }
  return { site: best, dist: bd };
}

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (document.hidden) dt = 0;
  // 배속: 같은 프레임 안에서 시뮬레이션을 여러 번 돌린다 (한 번 누른 키는 첫 번에만 적용)
  for (let k = 0; k < timeScale; k++) {
    step(dt);
    input.endFrame();
  }
  renderer.render(scene, camera);
}

function step(dt) {
  elapsed += dt;

  // 시간 연출
  if (timeAnim) {
    timeAnim.t += dt;
    const k = smoothstep(0, 1, timeAnim.t / timeAnim.dur);
    env.setTime(lerp(timeAnim.from, timeAnim.to, k));
    if (timeAnim.t >= timeAnim.dur) timeAnim = null;
  }

  // 공통 키
  const modalOpen = !$('help').hidden || !$('finish').hidden;
  if (mode !== 'title' && !modalOpen) {
    if (input.pressed('KeyM')) toggleMap();
    if (input.pressed('Digit1')) setDest(0);
    if (input.pressed('Digit2')) setDest(1);
    if (input.pressed('Digit3')) setDest(2);
    if (input.pressed('KeyC')) toggleCam();
    if (input.pressed('KeyP')) togglePilot();
    if (input.pressed('KeyF')) cycleSpeed();
    if (input.pressed('Escape')) hud.closeInfo();
  }
  paused = modalOpen || !$('bigmap').hidden;

  const ax = paused ? { x: 0, y: 0 } : input.axis();
  let hint = null;

  if (mode === 'drive') {
    let control = {
      throttle: Math.max(0, ax.y), brake: Math.max(0, -ax.y), steer: -ax.x,
      handbrake: !paused && input.held('Space'),
    };
    if (pilot.active) {
      const manual = input.pressed('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space') || input.joy.active;
      if (manual) setPilot(false, '직접 운전으로 바꿨어요');
      else if (!paused) {
        control = pilot.drive(bus, dt);
        if (control.arrived) setPilot(false, `자동운전으로 <b>${SITES[destIdx].name}</b>에 도착했어요`);
      }
    }
    const hit = bus.update(paused ? 0 : dt, control);
    if (hit) sound.thud();
    if (!paused && input.pressed('KeyH')) sound.horn();
    const ns = nearestSite(bus.x, bus.z);
    atStop = ns.dist < 16 ? ns.site : null;
    if (atStop && lastAnnounced !== atStop) {
      lastAnnounced = atStop;
      sound.chime();
      hud.toast(`이번 정류장은 <b>${atStop.name}</b>입니다.`, 'announce');
    }
    if (!atStop && ns.dist > 40) lastAnnounced = null;
    if (pilot.active) {
      hint = '자동운전 중 · <kbd>P</kbd> 또는 방향키로 해제';
    } else if (atStop) {
      if (Math.abs(bus.speed) < 1.5) {
        hint = `<kbd>E</kbd> 내려서 ${atStop.name} 구경하기`;
        if (input.pressed('KeyE')) getOff();
      } else hint = '정류장입니다. 버스를 멈추세요';
    } else if (input.pressed('KeyE')) {
      hud.toast('빛기둥이 서 있는 관광지 정류장에 멈추면 내릴 수 있어요');
    }
    const gear = bus.speed < -0.3 ? 'R' : Math.abs(bus.speed) < 0.3 ? 'N' : 'D';
    hud.setSpeed(bus.kmh(), gear, true);
    $('tSpace').textContent = '정지';
  } else if (mode === 'walk') {
    walker.update(paused ? 0 : dt, { x: ax.x, y: ax.y, run: input.held('ShiftLeft', 'ShiftRight'), jump: !paused && input.pressed('Space') }, camYaw, busColliders());
    hud.setSpeed(0, '', false);
    $('tSpace').textContent = '점프';
    // 가장 가까운 상호작용
    const door = bus.local(-2.4, 3.8);
    const dDoor = Math.hypot(walker.x - door.x, walker.z - door.z);
    let near = null, nd = Infinity;
    for (const p of POIS) {
      const d = Math.hypot(walker.x - p.x, walker.z - p.z);
      if (p.y !== undefined && Math.abs(walker.y - p.y) > 3) continue;
      if (d < p.r && d < nd) { nd = d; near = p; }
    }
    if (near) collect(near);
    if (hud.infoOpenFor) {
      const p = POIS.find((q) => q.id === hud.infoOpenFor);
      if (Math.hypot(walker.x - p.x, walker.z - p.z) > p.r + 6) hud.closeInfo();
    }
    if (dDoor < 5) {
      hint = '<kbd>E</kbd> 버스 타기';
      if (input.pressed('KeyE')) getOn();
    } else if (near) {
      if (hud.infoOpenFor !== near.id) {
        hint = `<kbd>E</kbd> 안내판 읽기 · ${near.title}`;
        if (input.pressed('KeyE')) hud.openInfo(near, siteOf(near.site).name, infoActions(near));
      }
    }
  }
  hud.prompt(mode === 'title' || paused ? null : hint);

  // 목적지 안내
  const dest = SITES[destIdx];
  const pp = playerPos();
  if (mode !== 'title') {
    const dx = dest.stop.x - pp.x, dz = dest.stop.z - pp.z;
    let rel = Math.atan2(dx, dz) - heading();
    hud.setDest(dest, Math.hypot(dx, dz), rel);
    if ((Math.floor(elapsed * 10) & 1) === 0) hud.drawMinimap(pp, heading(), dest, pilot.active ? pilot.path : null);
  }

  // 정류장 빛기둥
  for (const m of markers) {
    const d = Math.hypot(m.site.stop.x - pp.x, m.site.stop.z - pp.z);
    const sel = m.site === dest;
    const show = mode !== 'walk';
    m.beam.visible = show && d > 12;
    m.beam.material.opacity = (sel ? 0.3 : 0.12) * (0.75 + 0.25 * Math.sin(elapsed * 3)) * smoothstep(12, 60, d);
    m.ring.visible = show;
    m.label.visible = mode !== 'title' && d > 45;
  }

  // 월드 업데이트
  sea.update(elapsed);
  sites.update(elapsed, dt);
  ambient.update(elapsed);

  if (mode === 'title') titleCamera(elapsed);
  else updateCamera(dt);
  env.follow(mode === 'walk' ? walker.mesh.position : bus.root.position, camera);

  // 소리
  const seaNear = 1 - smoothstep(0, 140, Math.abs(coastX(camera.position.z) - camera.position.x));
  const fallNear = 1 - smoothstep(10, 140, Math.hypot(camera.position.x - MUREUNG.pool.x, camera.position.z - MUREUNG.pool.z));
  sound.update({ driving: mode === 'drive', speed: bus.speed, throttle: Math.max(0, ax.y), seaNear, fallNear, t: elapsed });

}
frame();

// 자동 테스트용 훅: 키를 누른 채로 시뮬레이션만 빠르게 진행
window.__game = {
  bus, walker, env, POIS, got, setDest,
  get mode() { return mode; },
  set camYaw(v) { camYaw = v; },
  // 걸어서 (x,z)까지 이동 (테스트용)
  walkTo(x, z, run = true) {
    for (let n = 0; n < 900; n++) {
      const dx = x - walker.x, dz = z - walker.z;
      if (Math.hypot(dx, dz) < 1.2) return true;
      camYaw = Math.atan2(-dx, -dz);
      this.advance(1 / 30, run ? ['KeyW', 'ShiftLeft'] : ['KeyW']);
    }
    return false;
  },
  advance(sec, keys = [], press = []) {
    keys.forEach((k) => input.down.add(k));
    press.forEach((k) => input.pressedQ.add(k));
    for (let t = 0; t < sec; t += 1 / 30) { step(1 / 30); input.endFrame(); }
    keys.forEach((k) => input.down.delete(k));
  },
};
