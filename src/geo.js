// 공용 수학 유틸과 동해 지형의 기본 형태(해안선, 무릉계곡 골짜기)
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, z * f);
    n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}

// 결정적 난수 (같은 시드면 항상 같은 배치)
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 좌표계: x = 동쪽(+), z = 남쪽(+), 1 단위 = 1m. 바다는 동쪽.
export const WORLD = { x0: -850, x1: 650, z0: -850, z1: 850, cell: 5 };

// 해안선: 이 x보다 동쪽은 바다
export const coastX = (z) => 250 + 22 * Math.sin(z * 0.0055 + 0.6) + 10 * Math.sin(z * 0.019 + 2.0);

// 무릉계곡 골짜기 중심선
export const valleyZ = (x) => 260 + 20 * Math.sin(x * 0.011);

// 로컬 좌표(버스/사물 기준) -> 월드 좌표. 로컬 +z가 앞, +x가 왼쪽.
export function localToWorld(x, z, yaw, lx, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}
