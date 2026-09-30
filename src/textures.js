// 캔버스로 그리는 텍스처들 (외부 이미지 없이)
import * as THREE from 'three';
import { rng } from './geo.js';

const FONT = '"Do Hyeon", "IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

export function groundDetailTexture() {
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  const r = rng(7);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 215 + r() * 40;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 부드러운 얼룩
  for (let k = 0; k < 60; k++) {
    g.fillStyle = `rgba(${r() < 0.5 ? 255 : 150},${r() < 0.5 ? 255 : 150},${r() < 0.5 ? 255 : 150},0.06)`;
    g.beginPath(); g.arc(r() * 256, r() * 256, 10 + r() * 30, 0, Math.PI * 2); g.fill();
  }
  return tex(c, true);
}

export function roadTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#3b3f45'; g.fillRect(0, 0, 128, 256);
  const r = rng(3);
  for (let i = 0; i < 1400; i++) {
    const v = 50 + r() * 40;
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.fillRect(r() * 128, r() * 256, 1.5, 1.5);
  }
  // 흰색 가장자리선
  g.fillStyle = '#e9ecef';
  g.fillRect(6, 0, 3, 256); g.fillRect(119, 0, 3, 256);
  // 노란 중앙 복선
  g.fillStyle = '#f2b90c';
  g.fillRect(59, 0, 3, 256); g.fillRect(66, 0, 3, 256);
  return tex(c, true);
}

export function pathTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#b9a98d'; g.fillRect(0, 0, 64, 64);
  const r = rng(11);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 175 + r() * 30;
    g.fillStyle = `rgb(${v},${v - 12},${v - 32})`;
    g.fillRect(x * 16 + 1 + (y % 2) * 8, y * 16 + 1, 14, 14);
  }
  return tex(c, true);
}

// 갈색 관광 안내판
export function signTexture(title, sub) {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#e8d9b8'; g.lineWidth = 6; g.strokeRect(12, 12, 488, 232);
  g.fillStyle = '#fff8e8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `64px ${FONT}`; g.fillText(title, 256, sub ? 108 : 128);
  if (sub) { g.font = `30px ${FONT}`; g.fillStyle = '#e8d9b8'; g.fillText(sub, 256, 180); }
  return tex(c);
}

// 파란 버스 정류장 표지
export function stopSignTexture(name) {
  const [c, g] = canvas(512, 160);
  g.fillStyle = '#1b4f9c'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = `28px ${FONT}`; g.fillText('시티투어 정류장', 24, 40);
  g.font = `58px ${FONT}`; g.fillText(name, 24, 108);
  return tex(c);
}

// 버스 앞 LED 행선판
export function ledTexture(text) {
  const [c, g] = canvas(512, 96);
  g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffb020'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `62px ${FONT}`; g.fillText(text, 256, 52);
  // LED 도트 느낌
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 0; x < 512; x += 4) g.fillRect(x, 0, 1, 96);
  for (let y = 0; y < 96; y += 4) g.fillRect(0, y, 512, 1);
  return tex(c);
}

export function windowTexture(seed, base = '#d9d4c8') {
  const [c, g] = canvas(128, 128);
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  const r = rng(seed);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = r();
    g.fillStyle = lit > 0.8 ? '#8fb4cf' : lit > 0.4 ? '#51677a' : '#3c4c5c';
    g.fillRect(x * 32 + 6, y * 32 + 8, 20, 16);
  }
  return tex(c, true);
}

export function textTexture(text, { w = 256, h = 64, color = '#223', bg = null, size = 40 } = {}) {
  const [c, g] = canvas(w, h);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${size}px ${FONT}`; g.fillText(text, w / 2, h / 2 + 2);
  return tex(c);
}

// 무릉반석의 석각 (양사언 글씨로 전하는 문구)
export function engravingTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#9d978b'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#4b463f'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '64px "Noto Serif KR", "Batang", serif';
  const cols = ['武陵仙源', '中臺泉石', '頭陀洞天'];
  cols.forEach((t, i) => {
    [...t].forEach((ch, k) => g.fillText(ch, 400 - i * 140, 40 + k * 58));
  });
  return tex(c);
}

// 논골담길 벽화 (여러 종류)
export function muralTexture(kind) {
  const [c, g] = canvas(256, 160);
  const r = rng(kind * 97 + 5);
  const bgs = ['#9fd3e6', '#f5e6b8', '#bfe3c0', '#f6c7b6', '#cdd7f2', '#fbe7a1'];
  g.fillStyle = bgs[kind % bgs.length]; g.fillRect(0, 0, 256, 160);
  const k = kind % 6;
  if (k === 0) { // 오징어 말리기
    g.strokeStyle = '#6b5a45'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 30); g.lineTo(256, 30); g.stroke();
    for (let i = 0; i < 5; i++) {
      const x = 28 + i * 50;
      g.fillStyle = '#e8b4a0';
      g.beginPath(); g.moveTo(x, 32); g.lineTo(x - 14, 60); g.lineTo(x - 10, 100); g.lineTo(x + 10, 100); g.lineTo(x + 14, 60); g.closePath(); g.fill();
      g.strokeStyle = '#c98b73'; g.lineWidth = 3;
      for (let t = -8; t <= 8; t += 4) { g.beginPath(); g.moveTo(x + t, 100); g.quadraticCurveTo(x + t * 1.6, 125, x + t * 1.2 + (r() - 0.5) * 8, 145); g.stroke(); }
    }
  } else if (k === 1) { // 등대와 파도
    g.fillStyle = '#3d7ab8'; g.fillRect(0, 110, 256, 50);
    g.fillStyle = '#ffffff';
    for (let x = 0; x < 256; x += 32) { g.beginPath(); g.arc(x + 16, 112, 16, Math.PI, 0); g.fill(); }
    g.fillStyle = '#fff'; g.fillRect(170, 40, 26, 72);
    g.fillStyle = '#d64541'; g.fillRect(166, 30, 34, 14);
    g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(183, 36); g.lineTo(90, 10); g.lineTo(90, 60); g.fill();
  } else if (k === 2) { // 꽃과 장화
    for (let i = 0; i < 9; i++) {
      const x = 20 + r() * 216, y = 20 + r() * 80;
      g.fillStyle = ['#e2575b', '#f4a340', '#f7d358', '#b56ad6'][i % 4];
      for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(x + Math.cos(p * 1.26) * 8, y + Math.sin(p * 1.26) * 8, 6, 0, 7); g.fill(); }
      g.fillStyle = '#fff4c2'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    }
    g.fillStyle = '#2f4f4f'; g.fillRect(100, 100, 22, 44); g.fillRect(100, 132, 40, 14);
  } else if (k === 3) { // 물고기 떼
    g.fillStyle = '#2e6f95'; g.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 14; i++) {
      const x = r() * 240, y = 10 + r() * 140, s = 6 + r() * 8;
      g.fillStyle = ['#ffd166', '#ef476f', '#8be0c4', '#ffffff'][i % 4];
      g.beginPath(); g.ellipse(x, y, s * 1.6, s, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x - s * 1.4, y); g.lineTo(x - s * 2.6, y - s); g.lineTo(x - s * 2.6, y + s); g.fill();
    }
  } else if (k === 4) { // 지게 진 어부
    g.fillStyle = '#7fb6d9'; g.fillRect(0, 0, 256, 90);
    g.fillStyle = '#d9c7a0'; g.fillRect(0, 90, 256, 70);
    g.fillStyle = '#3a3a3a';
    g.beginPath(); g.arc(128, 50, 12, 0, 7); g.fill();
    g.fillRect(118, 62, 20, 44); g.fillRect(118, 106, 7, 32); g.fillRect(131, 106, 7, 32);
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(142, 50); g.lineTo(160, 140); g.moveTo(152, 50); g.lineTo(170, 140); g.stroke();
    g.fillStyle = '#e8b4a0'; g.fillRect(146, 70, 30, 18);
  } else { // 도깨비 얼굴
    g.fillStyle = '#e8574f'; g.beginPath(); g.arc(128, 90, 52, 0, 7); g.fill();
    g.fillStyle = '#f8e8c8';
    g.beginPath(); g.moveTo(104, 44); g.lineTo(112, 14); g.lineTo(120, 44); g.fill();
    g.beginPath(); g.moveTo(136, 44); g.lineTo(144, 14); g.lineTo(152, 44); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(110, 84, 12, 0, 7); g.arc(146, 84, 12, 0, 7); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(112, 86, 5, 0, 7); g.arc(148, 86, 5, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.fillRect(104, 112, 48, 10);
  }
  return tex(c);
}

// 떠 있는 라벨 (스프라이트용)
export function labelTexture(text, color = '#ffb020') {
  const [c, g] = canvas(512, 128);
  g.fillStyle = 'rgba(10,18,26,0.82)';
  const rr = 30;
  g.beginPath(); g.roundRect(8, 16, 496, 96, rr); g.fill();
  g.strokeStyle = color; g.lineWidth = 4; g.stroke();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `56px ${FONT}`; g.fillText(text, 256, 66);
  return tex(c);
}

export function softDotTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c);
}

export function cloudTexture(seed) {
  const [c, g] = canvas(256, 128);
  const r = rng(seed);
  for (let i = 0; i < 18; i++) {
    const x = 40 + r() * 176, y = 50 + r() * 40, s = 18 + r() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
  }
  return tex(c);
}

export function waterfallTexture() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = 'rgba(210,235,245,0.55)'; g.fillRect(0, 0, 64, 256);
  const r = rng(21);
  for (let i = 0; i < 90; i++) {
    const x = r() * 64, y = r() * 256, l = 20 + r() * 60;
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`;
    g.fillRect(x, y, 1 + r() * 3, l);
  }
  const t = tex(c, true);
  return t;
}

export function streamTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#5fb3c9'; g.fillRect(0, 0, 128, 128);
  const r = rng(33);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
    g.lineWidth = 1 + r() * 2;
    const x = r() * 128, y = r() * 128;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + 10, x, y + 20 + r() * 20); g.stroke();
  }
  return tex(c, true);
}
