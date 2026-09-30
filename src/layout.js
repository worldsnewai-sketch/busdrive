// 지도 배치: 도로, 정류장, 관광지 좌표
// 실제 위치 관계를 단순화했다: 묵호는 북쪽, 추암은 남쪽 해안, 무릉계곡은 남서쪽 내륙.
import { coastX, valleyZ } from './geo.js';

const vz = valleyZ;

export const TOWN = { x: 20, z: 0, r: 120 };

export const CHUAM = {
  stop: { x: 150, z: 448, yaw: 0 },
  rock: { x: coastX(478) + 30, z: 478 },          // 촛대바위
  head: { x: coastX(528) + 2, z: 528 },           // 출렁다리 시작 언덕
  isle: { x: coastX(528) + 44, z: 526 },          // 전망 바위섬
  pavilion: { x: coastX(492) - 44, z: 492 },      // 해암정
  beachSign: { x: coastX(455) - 14, z: 455 },
};

export const MUREUNG = {
  stop: { x: -338, z: vz(-338) + 6, yaw: -Math.PI / 2 },
  temple: { x: -392, z: vz(-392) + 36 },          // 삼화사
  banseok: { x: -452, z: vz(-452) },              // 무릉반석
  pool: { x: -546, z: vz(-546) },                 // 쌍폭포 소
  deck: { x: -528, z: vz(-528) + 12 },            // 쌍폭포 전망대
};

export const MUKHO = {
  stop: { x: 126, z: -420, yaw: -2.53 },
  lighthouse: { x: 170, z: -522 },                // 묵호등대
  skyBase: { x: 192, z: -548 },                   // 스카이워크 시작
  haerang: { x: coastX(-392) - 4, z: -392 },      // 해랑전망대 시작(해안)
  alley: [                                         // 논골담길
    { x: 130, z: -432 }, { x: 140, z: -452 }, { x: 132, z: -474 },
    { x: 146, z: -494 }, { x: 160, z: -509 }, { x: 168, z: -516 },
  ],
};

export const TERMINAL = { x: 18, z: -34 };

// 차도 (Catmull-Rom 제어점)
export const ROADS = [
  // 해안도로: 묵호 → 시내 → 추암
  [
    { x: 118, z: -412 }, { x: 146, z: -372 }, { x: 160, z: -270 }, { x: 132, z: -150 },
    { x: 84, z: -52 }, { x: 66, z: 20 }, { x: 90, z: 140 }, { x: 128, z: 262 },
    { x: 150, z: 362 }, { x: 150, z: 452 },
  ],
  // 무릉로: 시내 → 무릉계곡
  [
    { x: 66, z: 20 }, { x: 22, z: 112 }, { x: -60, z: 196 }, { x: -160, z: 244 },
    { x: -252, z: vz(-252) + 2 }, { x: -344, z: vz(-344) + 6 },
  ],
  // 터미널 진입로
  [ { x: 76, z: -20 }, { x: 44, z: -30 }, { x: 22, z: -24 } ],
];

// 걷는 길 (지형을 따라감)
export const WALKWAYS = [
  // 추암: 정류장 → 해변 → 해암정 → 출렁다리 입구
  { pts: [ { x: 150, z: 448 }, { x: 180, z: 452 }, { x: CHUAM.beachSign.x - 4, z: 456 },
           { x: CHUAM.pavilion.x + 8, z: 474 }, { x: CHUAM.pavilion.x + 4, z: 488 } ], w: 3 },
  { pts: [ { x: CHUAM.beachSign.x - 4, z: 456 }, { x: coastX(500) - 14, z: 500 },
           { x: CHUAM.head.x - 10, z: 520 }, { x: CHUAM.head.x - 1, z: 527 } ], w: 3 },
  // 무릉계곡: 정류장 → 삼화사 / 무릉반석 → 쌍폭포
  { pts: [ { x: -338, z: vz(-338) + 12 }, { x: -372, z: vz(-372) + 16 }, { x: -412, z: vz(-412) + 16 },
           { x: -440, z: vz(-440) + 18 }, { x: -480, z: vz(-480) + 16 }, { x: -510, z: vz(-510) + 14 },
           { x: MUREUNG.deck.x, z: MUREUNG.deck.z } ], w: 3 },
  { pts: [ { x: -380, z: vz(-380) + 16 }, { x: -388, z: vz(-388) + 26 }, { x: MUREUNG.temple.x, z: MUREUNG.temple.z - 4 } ], w: 3 },
  // 묵호: 논골담길 + 해랑전망대 길 + 스카이워크 길
  { pts: MUKHO.alley, w: 2.6 },
  { pts: [ { x: 130, z: -420 }, { x: 170, z: -406 }, { x: MUKHO.haerang.x - 6, z: -394 } ], w: 3 },
  { pts: [ { x: 168, z: -518 }, { x: 180, z: -534 }, { x: MUKHO.skyBase.x - 2, z: MUKHO.skyBase.z } ], w: 2.6 },
];

// 평탄화 구역
export const PADS = [
  { x: TOWN.x, z: TOWN.z, r: TOWN.r, fall: 80 },
  { x: CHUAM.stop.x, z: CHUAM.stop.z, r: 20, fall: 18 },
  { x: CHUAM.pavilion.x, z: CHUAM.pavilion.z, r: 8, fall: 8 },
  { x: MUREUNG.stop.x, z: MUREUNG.stop.z, r: 18, fall: 16 },
  { x: MUREUNG.temple.x, z: MUREUNG.temple.z, r: 20, fall: 14 },
  { x: MUKHO.stop.x, z: MUKHO.stop.z, r: 18, fall: 14 },
  { x: MUKHO.lighthouse.x, z: MUKHO.lighthouse.z, r: 11, fall: 10 },
  { x: MUKHO.skyBase.x, z: MUKHO.skyBase.z, r: 6, fall: 6 },
];

export const SITES = [
  { id: 'mukho', name: '묵호 도째비골·논골담길', short: '묵호', stop: MUKHO.stop, color: '#ff8a3d' },
  { id: 'chuam', name: '추암 촛대바위', short: '추암', stop: CHUAM.stop, color: '#ffc23d' },
  { id: 'mureung', name: '무릉계곡', short: '무릉계곡', stop: MUREUNG.stop, color: '#6fd6a0' },
];

// ---------- 동해페이 경제: 터미널·주유소·가게 ----------
export const TERMINAL_STOP = { x: 30, z: -27, yaw: Math.PI / 2 };
export const GAS = { x: 101, z: -121, yaw: -0.49 }; // 해안도로 서쪽 주유소

// 목적지 목록 (1~5번 키): 관광지 3곳 + 터미널 + 주유소
export const DESTS = [
  ...SITES,
  { id: 'terminal', name: '시티투어 터미널', short: '터미널', stop: TERMINAL_STOP, color: '#dfe8ee' },
  { id: 'gas', name: '시티투어 주유소', short: '주유소', stop: GAS, color: '#4aa3ff' },
];

// 가게 위치 (yaw: 가게 정면이 바라보는 방향)
export const SHOP_SPOTS = {
  'mukho-cafe': { x: 156, z: -430, yaw: Math.PI },
  'chuam-store': { x: 182, z: 436, yaw: 0 },
  'mureung-food': { x: -322, z: valleyZ(-322) + 24, yaw: Math.PI },
};
for (const s of Object.values(SHOP_SPOTS)) PADS.push({ x: s.x, z: s.z, r: 8, fall: 7 });
PADS.push({ x: GAS.x, z: GAS.z, r: 14, fall: 10 });

// 시내 건물이 들어서면 안 되는 곳
export const KEEP_CLEAR = [{ x: GAS.x, z: GAS.z, r: 24 }];
