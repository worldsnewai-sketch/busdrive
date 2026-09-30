// 자동운전: 도로망에서 목적지 정류장까지 경로를 찾고 따라간다
import { clamp } from './geo.js';
import { roadPaths } from './terrain.js';

// 도로 표본점을 노드로 하는 그래프 (교차로는 가까운 점끼리 연결)
const nodes = [];
const edges = [];
function link(a, b) {
  const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
  edges[a].push([b, d]); edges[b].push([a, d]);
}
for (const r of roadPaths) {
  const start = nodes.length;
  for (const p of r.pts) { nodes.push({ x: p.x, z: p.z }); edges.push([]); }
  for (let i = start; i < nodes.length - 1; i++) link(i, i + 1);
  r.nodeRange = [start, nodes.length - 1];
}
for (const r of roadPaths) {
  for (const end of r.nodeRange) {
    let best = -1, bd = 8;
    for (const o of roadPaths) {
      if (o === r) continue;
      for (let i = o.nodeRange[0]; i <= o.nodeRange[1]; i++) {
        const d = Math.hypot(nodes[i].x - nodes[end].x, nodes[i].z - nodes[end].z);
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best >= 0) link(end, best);
  }
}

function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

function shortestPath(from, to) {
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const done = new Uint8Array(nodes.length);
  dist[from] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const [v, w] of edges[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const path = [];
  for (let u = to; u >= 0; u = prev[u]) path.push(nodes[u]);
  return path.reverse();
}

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Autopilot {
  constructor() { this.active = false; this.path = null; }

  start(bus, stop) {
    const a = nearestNode(bus.x, bus.z), b = nearestNode(stop.x, stop.z);
    this.path = shortestPath(a, b);
    // 버스 바로 뒤쪽의 점은 건너뛴다
    while (this.path.length > 1) {
      const p = this.path[0];
      const ahead = (p.x - bus.x) * Math.sin(bus.yaw) + (p.z - bus.z) * Math.cos(bus.yaw);
      if (ahead > 2 || Math.hypot(p.x - bus.x, p.z - bus.z) > 14) break;
      this.path.shift();
    }
    this.path.push({ x: stop.x, z: stop.z });
    this.idx = 0;
    this.stop = stop;
    this.turn = null;     // 방향 전환(3점 회전) 상태
    this.stuck = 0;
    this.unstick = 0;
    this.active = true;
  }

  cancel() { this.active = false; this.path = null; }

  remaining(bus) {
    if (!this.path) return 0;
    let d = Math.hypot(this.path[this.idx].x - bus.x, this.path[this.idx].z - bus.z);
    for (let i = this.idx; i < this.path.length - 1; i++) d += Math.hypot(this.path[i + 1].x - this.path[i].x, this.path[i + 1].z - this.path[i].z);
    return d;
  }

  // 버스 입력값을 만들어 준다. 도착하면 arrived: true
  drive(bus, dt) {
    const P = this.path;
    // 가장 가까운 앞쪽 점으로 진행도 갱신
    let bestI = this.idx, bd = Infinity;
    for (let i = this.idx; i < Math.min(P.length, this.idx + 12); i++) {
      const d = Math.hypot(P[i].x - bus.x, P[i].z - bus.z);
      if (d < bd) { bd = d; bestI = i; }
    }
    this.idx = bestI;

    const left = this.remaining(bus);
    const end = P[P.length - 1];
    const dEnd = Math.hypot(end.x - bus.x, end.z - bus.z);
    if (dEnd < 5 || (left < 8 && Math.abs(bus.speed) < 0.6)) {
      return { throttle: 0, brake: bus.speed > 0.2 ? 1 : 0, steer: 0, handbrake: Math.abs(bus.speed) < 3, arrived: Math.abs(bus.speed) < 0.3 };
    }

    // 앞쪽 목표점 (속도에 따라 멀리 봄)
    const look = 7 + Math.abs(bus.speed) * 0.7;
    let ti = this.idx, acc = 0;
    while (ti < P.length - 1 && acc < look) { acc += Math.hypot(P[ti + 1].x - P[ti].x, P[ti + 1].z - P[ti].z); ti++; }
    const t = P[ti];
    const rel = wrap(Math.atan2(t.x - bus.x, t.z - bus.z) - bus.yaw);

    // 반대 방향을 보고 있으면 전진·후진을 번갈아 방향을 튼다
    if (!this.turn && Math.abs(rel) > 1.9 && Math.abs(bus.speed) < 4) this.turn = { dir: 1, t: 0 };
    if (this.turn) {
      if (Math.abs(rel) < 0.9) this.turn = null;
      else {
        this.turn.t += dt;
        const s = Math.sign(rel) || 1;
        if (this.turn.t > 2.6 || (this.turn.t > 0.8 && Math.abs(bus.speed) < 0.15)) { this.turn.dir *= -1; this.turn.t = 0; }
        if (this.turn.dir > 0) return { throttle: bus.speed < 3 ? 0.6 : 0, brake: 0, steer: s };
        return { throttle: 0, brake: bus.speed > -3 ? 0.7 : 0, steer: -s };
      }
    }

    // 앞으로 30m 경로가 얼마나 휘었는지 보고 속도를 정함
    let bend = 0, a0 = null;
    for (let i = this.idx, d = 0; i < P.length - 1 && d < 36; i++) {
      const h = Math.atan2(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
      if (a0 !== null) bend += Math.abs(wrap(h - a0));
      a0 = h;
      d += Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
    }
    let vt = clamp(22 - bend * 14, 7, 22);
    vt = Math.min(vt, Math.sqrt(2 * 2.2 * Math.max(0, left - 3)) + 1);
    if (Math.abs(rel) > 0.6) vt = Math.min(vt, 6);
    if (!bus.onRoad) vt = Math.min(vt, 9);

    // 어딘가 걸려서 못 움직이면 잠깐 후진
    if (this.unstick > 0) {
      this.unstick -= dt;
      return { throttle: 0, brake: 0.8, steer: -Math.sign(rel) };
    }
    if (Math.abs(bus.speed) < 0.3) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 1.5) { this.stuck = 0; this.unstick = 1.2; }

    const err = vt - bus.speed;
    return {
      throttle: clamp(err * 0.6, 0, 1),
      brake: clamp(-err * 0.35, 0, 1),
      steer: clamp(rel * 2.4, -1, 1),
    };
  }
}
