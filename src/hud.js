// 화면 UI: 행선판, 미니맵, 스탬프, 안내판, 알림
import { WORLD, coastX, smoothstep } from './geo.js';
import { NX, NZ, heights, roadPaths } from './terrain.js';
import { SITES, WALKWAYS, DESTS, SHOP_SPOTS } from './layout.js';
import { econ, SHOPS, SOUVENIRS, BUFFS, won } from './economy.js';

const $ = (id) => document.getElementById(id);

// 지도 바탕 이미지 (1px = 4m)
function buildMapImage() {
  const S = 4;
  const w = Math.round((WORLD.x1 - WORLD.x0) / S), h = Math.round((WORLD.z1 - WORLD.z0) / S);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = Math.min(NX, Math.round((px * S) / WORLD.cell)), j = Math.min(NZ, Math.round((py * S) / WORLD.cell));
    const hh = heights[j * (NX + 1) + i];
    let r, gg, b;
    if (hh < 0) { const t = smoothstep(0, -12, hh); r = 40 - t * 20; gg = 130 - t * 60; b = 170 - t * 40; }
    else if (hh < 3 && coastX(WORLD.z0 + py * S) - (WORLD.x0 + px * S) < 45) { r = 214; gg = 197; b = 150; }
    else { const t = smoothstep(0, 120, hh); r = 92 - t * 40; gg = 138 - t * 50; b = 78 - t * 30; }
    const k = (py * w + px) * 4;
    img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tp = (x, z) => [(x - WORLD.x0) / S, (z - WORLD.z0) / S];
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [col, wd] of [['#1d2a36', 5], ['#e8e2cf', 3]]) {
    g.strokeStyle = col; g.lineWidth = wd;
    for (const r of roadPaths) {
      g.beginPath();
      r.pts.forEach((p, i) => { const [x, y] = tp(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
  }
  g.strokeStyle = '#f7d9a0'; g.lineWidth = 1.2; g.setLineDash([2, 2]);
  for (const wk of WALKWAYS) {
    g.beginPath();
    wk.pts.forEach((p, i) => { const [x, y] = tp(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  g.setLineDash([]);
  return { canvas: c, S, tp };
}

export class Hud {
  constructor() {
    this.map = buildMapImage();
    this.mini = $('minimap');
    this.mg = this.mini.getContext('2d');
    this.big = $('bigcanvas');
    this.toasts = $('toasts');
    this.infoOpenFor = null;
    this.stampsEl = $('stamps');
  }

  show() { $('hud').hidden = false; }

  setDest(site, dist, relAngle) {
    $('destName').textContent = site.name;
    $('destName').style.color = site.color;
    $('destDist').textContent = dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`;
    $('arrow').style.transform = `rotate(${-relAngle}rad)`;
    $('arrow').style.color = site.color;
  }

  setSpeed(kmh, gear, driving) {
    $('speedRow').hidden = !driving;
    $('fuelRow').hidden = !driving;
    $('paxRow').hidden = !driving;
    $('stamRow').hidden = driving;
    $('kmh').textContent = Math.round(kmh);
    $('gear').textContent = gear;
  }

  setStatus(pax) {
    $('money').textContent = won(econ.money);
    const fb = $('fuelBar');
    fb.style.width = `${econ.fuel}%`;
    fb.classList.toggle('low', econ.fuel < 15);
    const sb = $('stamBar');
    sb.style.width = `${econ.stamina}%`;
    sb.classList.toggle('low', econ.stamina < 20);
    $('pax').textContent = `${pax}명`;
    const b = Object.keys(econ.buffs).map((k) => `<span>${BUFFS[k].name} ${Math.ceil(econ.buffs[k])}초</span>`).join('');
    if (b !== this._buffs) { $('buffs').innerHTML = b; this._buffs = b; }
  }

  openShop(shop, onBuy) {
    $('shopName').textContent = shop.name;
    $('shopLede').textContent = shop.lede;
    const render = () => {
      $('shopMoney').textContent = won(econ.money);
      $('shopItems').innerHTML = '';
      for (const it of shop.items) {
        const li = document.createElement('li');
        const owned = it.souvenir && econ.souvenirs.includes(it.id);
        li.innerHTML = `<div class="nm">${it.name}${it.souvenir ? '<small>기념품</small>' : ''}</div><div class="ds">${it.desc}</div>`;
        const b = document.createElement('button');
        b.className = 'btn buy' + (owned ? '' : ' primary');
        b.textContent = owned ? '가방에 있음' : won(it.price);
        b.disabled = owned || econ.money < it.price;
        if (!owned && econ.money < it.price) b.title = '동해페이가 모자라요';
        b.onclick = () => { onBuy(it); render(); };
        li.appendChild(b);
        $('shopItems').appendChild(li);
      }
    };
    render();
    $('shop').hidden = false;
  }

  openBag() {
    $('bagMoney').textContent = won(econ.money);
    $('bagCount').textContent = `${econ.souvenirs.length} / ${SOUVENIRS.length}`;
    $('bagItems').innerHTML = SOUVENIRS.map((s) => econ.souvenirs.includes(s.id)
      ? `<div class="own"><b>${s.name}</b><span>${s.desc}</span></div>`
      : `<div><b>???</b><span>${s.shop.name}에서 팔아요 · ${won(s.price)}</span></div>`).join('');
    const st = econ.stats;
    $('bagStats').innerHTML = `<div>태운 승객 <b>${st.passengers}명</b></div><div>달린 거리 <b>${st.km.toFixed(1)}km</b></div><div>번 돈 <b>${won(st.earned)}</b></div><div>쓴 돈 <b>${won(st.spent)}</b></div>`;
    $('bag').hidden = false;
  }

  prompt(html) {
    const el = $('prompt');
    if (!html) { el.hidden = true; this._p = null; return; }
    if (this._p !== html) { el.innerHTML = html; this._p = html; }
    el.hidden = false;
  }

  toast(html, kind = '') {
    const el = document.createElement('div');
    el.className = `toast panel ${kind}`;
    el.innerHTML = html;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => el.remove(), 4300);
  }

  renderStamps(pois, got) {
    const total = pois.length, have = pois.filter((p) => got.has(p.id)).length;
    let html = `<div class="head"><span>스탬프</span><b>${have} / ${total}</b></div>`;
    for (const s of SITES) {
      const list = pois.filter((p) => p.site === s.id);
      html += `<div class="row"><span class="n">${s.short}</span><span class="dots">${list.map((p) => `<span class="dot${got.has(p.id) ? ' on' : ''}" title="${p.title}"></span>`).join('')}</span></div>`;
    }
    this.stampsEl.innerHTML = html;
  }

  openInfo(p, siteName, actions) {
    this.infoOpenFor = p.id;
    $('infoSite').textContent = siteName;
    $('infoTitle').textContent = p.title;
    $('infoBody').innerHTML = p.body.map((t) => `<p>${t}</p>`).join('');
    const box = $('infoActions');
    box.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.onclick = a.run;
      box.appendChild(b);
    }
    $('info').hidden = false;
  }
  closeInfo() { this.infoOpenFor = null; $('info').hidden = true; }

  drawMarkers(g, tp, scale, player, heading, dest, labels) {
    // 가게: 작은 네모
    for (const sh of SHOPS) {
      const p = SHOP_SPOTS[sh.id];
      const [x, y] = tp(p.x, p.z);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#0d1721'; g.lineWidth = 1.5 * scale;
      g.fillRect(x - 3.5 * scale, y - 3.5 * scale, 7 * scale, 7 * scale);
      g.strokeRect(x - 3.5 * scale, y - 3.5 * scale, 7 * scale, 7 * scale);
      if (labels) {
        g.font = `${12 * scale}px "Do Hyeon", sans-serif`;
        g.fillStyle = '#ffffff';
        g.fillText(sh.name, x + 8 * scale, y - 6 * scale);
      }
    }
    for (const s of DESTS) {
      const [x, y] = tp(s.stop.x, s.stop.z);
      g.fillStyle = s.color;
      g.strokeStyle = '#0d1721'; g.lineWidth = 2 * scale;
      g.beginPath(); g.arc(x, y, (s === dest ? 7 : 5) * scale, 0, 7); g.fill(); g.stroke();
      if (labels) {
        g.font = `${14 * scale}px "Do Hyeon", sans-serif`;
        g.fillStyle = '#0d1721';
        g.fillText(s.name, x + 10 * scale + 1, y + 5 * scale + 1);
        g.fillStyle = '#ffffff';
        g.fillText(s.name, x + 10 * scale, y + 5 * scale);
      }
    }
    // 플레이어 화살표
    const [px, py] = tp(player.x, player.z);
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rx = -fz, rz = fx;
    const L = 9 * scale;
    g.fillStyle = '#ffb020'; g.strokeStyle = '#0d1721'; g.lineWidth = 2 * scale;
    g.beginPath();
    g.moveTo(px + fx * L, py + fz * L);
    g.lineTo(px - fx * L * 0.6 + rx * L * 0.6, py - fz * L * 0.6 + rz * L * 0.6);
    g.lineTo(px - fx * L * 0.3, py - fz * L * 0.3);
    g.lineTo(px - fx * L * 0.6 - rx * L * 0.6, py - fz * L * 0.6 - rz * L * 0.6);
    g.closePath(); g.fill(); g.stroke();
  }

  drawMinimap(player, heading, dest, route) {
    const g = this.mg, W = this.mini.width;
    const span = 700; // 보이는 범위(m)
    const k = W / span, S = this.map.S;
    g.save();
    g.fillStyle = '#1c5f86'; g.fillRect(0, 0, W, W);
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.clip();
    const tp = (x, z) => [W / 2 + (x - player.x) * k, W / 2 + (z - player.z) * k];
    const [ox, oy] = tp(WORLD.x0, WORLD.z0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.map.canvas, ox, oy, this.map.canvas.width * S * k, this.map.canvas.height * S * k);
    if (route) {
      // 자동운전 경로
      g.strokeStyle = dest.color; g.lineWidth = 5; g.globalAlpha = 0.85;
      g.beginPath();
      route.forEach((p, i) => { const [x, y] = tp(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.globalAlpha = 1;
    } else {
      // 목적지 방향 선
      const [dx, dy] = tp(dest.stop.x, dest.stop.z);
      g.strokeStyle = dest.color; g.setLineDash([6, 6]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(W / 2, W / 2); g.lineTo(dx, dy); g.stroke(); g.setLineDash([]);
    }
    this.drawMarkers(g, tp, 1.4, player, heading, dest, false);
    g.restore();
    g.fillStyle = '#f3f1ea'; g.font = '22px "Do Hyeon", sans-serif'; g.textAlign = 'center';
    g.fillText('N', W / 2, 24);
    g.textAlign = 'left';
  }

  drawBigMap(player, heading, dest) {
    const g = this.big.getContext('2d');
    const W = this.big.width, H = this.big.height;
    const sx = W / (WORLD.x1 - WORLD.x0), sz = H / (WORLD.z1 - WORLD.z0);
    g.drawImage(this.map.canvas, 0, 0, W, H);
    const tp = (x, z) => [(x - WORLD.x0) * sx, (z - WORLD.z0) * sz];
    this.drawMarkers(g, tp, 1.4, player, heading, dest, true);
    g.fillStyle = '#f3f1ea'; g.font = '26px "Do Hyeon", sans-serif';
    g.fillText('동해 (東海)', W - 170, 60);
    g.font = '18px "Do Hyeon", sans-serif';
    g.fillText('동해 시내', tp(-40, 0)[0], tp(0, 0)[1]);
    g.fillText('두타산', tp(-620, 0)[0], tp(0, 160)[1]);
    g.fillText('N ↑', 18, 32);
  }
}
