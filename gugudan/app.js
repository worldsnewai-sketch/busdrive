// 구구단 몬스터
// 몬스터를 누르면 먹이가 쌓여 자라고, 20번 누를 때마다 보스 도전 에너지가 하나 찬다.
// 보스(2~9단, 섞어 단 대왕)를 구구단으로 물리치면 그 몬스터를 도감에 모은다.
// 랭킹 점수는 보스마다 가장 잘한 점수를 더한 값이라, 빨리 누르기보다 구구단을 잘해야 오른다.
(() => {
  const $ = (id) => document.getElementById(id);
  const API = 'api/scores';
  const SAVE_KEY = 'gugudan-monster';

  const TAPS_PER_CHARGE = 20, MAX_CHARGES = 3, MAX_TPS = 15;
  const BATTLE_SEC = 30, BOSS_HP = 10, HEARTS = 3;

  const BOSSES = {
    2: { name: '말랑 슬라임', color: '#7bd389', dark: '#45a35c' },
    3: { name: '세모 바위', color: '#ffb84d', dark: '#d98a1c' },
    4: { name: '네발 냥냥', color: '#ff9db0', dark: '#e0647f' },
    5: { name: '별가시 고슴', color: '#ffd84a', dark: '#d9a91a' },
    6: { name: '육각 붕붕', color: '#79cdff', dark: '#3c95d6' },
    7: { name: '칠색 뱀뱀', color: '#bb98ff', dark: '#8a62e0' },
    8: { name: '팔다리 문어', color: '#ff8466', dark: '#d9553a' },
    9: { name: '구름 드래곤', color: '#4fe0bd', dark: '#22a888' },
    x: { name: '구구단 대왕', color: '#6f7dff', dark: '#4350d6' },
  };
  const BOSS_KEYS = ['2', '3', '4', '5', '6', '7', '8', '9', 'x'];
  const STAGES = [
    [0, '알'], [50, '아기 꼬물이'], [300, '꼬마 꼬물이'], [1000, '씩씩 꼬물이'],
    [3000, '용감 꼬물이'], [8000, '전설 꼬물이'], [20000, '우주 꼬물이'],
  ];
  const PET_COLORS = ['#fff4d6', '#ffd6a5', '#ffadad', '#a0c4ff', '#9bf6ff', '#caffbf', '#ffc6ff'];
  const SIDO_ORDER = ['서울', '부산', '대구', '인천', '전남광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '경북', '경남', '제주'];
  const SIDO_LABEL = { 전남광주: '광주·전남' };

  // ── 저장 ──────────────────────────────────────────
  const fresh = () => ({
    pid: newPid(), profile: null, food: 0, taps: 0, charges: 1,
    best: {}, stars: {}, caught: [], sent: null, sound: true,
  });
  function newPid() {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let S;
  try { S = { ...fresh(), ...JSON.parse(localStorage.getItem(SAVE_KEY)) }; } catch (e) { S = fresh(); }
  if (!/^[0-9a-f]{16}$/.test(S.pid)) S.pid = newPid();
  let saveTimer;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ } };
    if (now) write(); else saveTimer = setTimeout(write, 400);
  }

  const totalScore = () => BOSS_KEYS.reduce((s, k) => s + (S.best[k] || 0), 0);
  const totalStars = () => BOSS_KEYS.reduce((s, k) => s + (S.stars[k] || 0), 0);
  const tapPower = () => 1 + S.caught.length + Math.floor(totalStars() / 3);
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const bossLabel = (k) => (k === 'x' ? '섞어 단' : `${k}단`);

  // ── 소리 ──────────────────────────────────────────
  let audio;
  function beep(freq, dur = 0.08, type = 'sine', vol = 0.12) {
    if (!S.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* 소리를 못 내는 기기 */ }
  }
  const tune = (notes) => notes.forEach(([f, t], i) => setTimeout(() => beep(f, 0.15, 'triangle'), t ?? i * 110));
  function paintSound() {
    $('sound').textContent = S.sound ? '🔊' : '🔇';
    $('sound').setAttribute('aria-label', S.sound ? '소리 끄기' : '소리 켜기');
  }
  $('sound').addEventListener('click', () => { S.sound = !S.sound; save(); paintSound(); });

  // ── 몬스터 그림 ────────────────────────────────────
  function monsterSVG({ color, dark, spikes = 0, crown = false, shade = false, size = 1 }) {
    const cx = 100, cy = 120, rx = 64 * size, ry = 56 * size;
    const fill = shade ? '#23402f' : color, fill2 = shade ? '#23402f' : dark;
    const op = shade ? ' opacity="0.2"' : '';
    let out = `<svg viewBox="0 0 200 200" aria-hidden="true"><g${op}>`;
    for (let i = 0; i < spikes; i++) {
      const a = (200 + 140 * (i + 0.5) / spikes) * Math.PI / 180, w = Math.min(0.22, 1.1 / spikes);
      const p = (t, r) => `${(cx + (rx + r) * Math.cos(t)).toFixed(1)},${(cy + (ry + r) * Math.sin(t)).toFixed(1)}`;
      out += `<polygon points="${p(a - w, -6)} ${p(a, 24)} ${p(a + w, -6)}" fill="${fill2}"/>`;
    }
    out += `<ellipse cx="${cx - 28 * size}" cy="${cy + ry - 4}" rx="${16 * size}" ry="${10 * size}" fill="${fill2}"/>`;
    out += `<ellipse cx="${cx + 28 * size}" cy="${cy + ry - 4}" rx="${16 * size}" ry="${10 * size}" fill="${fill2}"/>`;
    out += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
    if (crown) {
      const y = cy - ry - 6;
      out += `<polygon points="${cx - 26},${y} ${cx - 30},${y - 30} ${cx - 13},${y - 14} ${cx},${y - 36} ${cx + 13},${y - 14} ${cx + 30},${y - 30} ${cx + 26},${y}" fill="${shade ? fill : '#ffcf3d'}" stroke="${shade ? fill : '#d99a00'}" stroke-width="3" stroke-linejoin="round"/>`;
    }
    out += '</g>';
    if (shade) return out + `<text x="100" y="138" text-anchor="middle" font-size="56" font-family="Jua, sans-serif" fill="#23402f" opacity="0.45">?</text></svg>`;
    out += `<ellipse cx="${cx}" cy="${cy + 20 * size}" rx="${rx * 0.6}" ry="${ry * 0.5}" fill="#fff" opacity="0.3"/>`;
    for (const s of [-1, 1]) {
      const ex = cx + s * 22 * size, ey = cy - 10 * size;
      out += `<circle cx="${ex}" cy="${ey}" r="${14 * size}" fill="#fff"/><circle cx="${ex + 2}" cy="${ey + 2}" r="${7 * size}" fill="#23402f"/><circle cx="${ex + 5}" cy="${ey - 2}" r="${2.5 * size}" fill="#fff"/>`;
      out += `<circle cx="${cx + s * 42 * size}" cy="${cy + 12 * size}" r="${8 * size}" fill="#ff6b6b" opacity="0.35"/>`;
    }
    out += `<path d="M${cx - 14 * size} ${cy + 14 * size} Q${cx} ${cy + 30 * size} ${cx + 14 * size} ${cy + 14 * size}" stroke="#23402f" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    return out + '</svg>';
  }
  function bossSVG(k, shade = false) {
    const b = BOSSES[k];
    return monsterSVG({ color: b.color, dark: b.dark, spikes: k === 'x' ? 9 : Number(k), crown: k === 'x', shade });
  }
  function petSVG() {
    const st = stageIndex();
    if (st === 0) {
      const crack = S.food >= 30 ? '<path d="M70 96 L84 108 L96 94 L110 110 L124 96 L132 104" stroke="#a0805a" stroke-width="4" fill="none" stroke-linejoin="round"/>' : '';
      return `<svg viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="100" cy="182" rx="50" ry="8" fill="#23402f" opacity="0.12"/><ellipse cx="100" cy="112" rx="58" ry="72" fill="#fff4d6" stroke="#e8d3a6" stroke-width="4"/><circle cx="78" cy="90" r="9" fill="#ffcf3d"/><circle cx="118" cy="128" r="12" fill="#7bd389"/><circle cx="124" cy="80" r="6" fill="#ff9db0"/><circle cx="84" cy="146" r="7" fill="#79cdff"/>${crack}</svg>`;
    }
    const c = PET_COLORS[st];
    return monsterSVG({ color: c, dark: shadeColor(c, -0.25), spikes: Math.min(st - 1, 5), crown: st >= 5, size: 0.8 + st * 0.04 });
  }
  function shadeColor(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + v * k)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // ── 화면 ──────────────────────────────────────────
  const SCREENS = ['join', 'home', 'select', 'battle', 'result', 'dex', 'rank'];
  let current = '';
  function show(name) {
    current = name;
    SCREENS.forEach((s) => { $('screen-' + s).hidden = s !== name; });
    const locked = name === 'battle' || name === 'join';
    ['go-dex', 'go-rank'].forEach((id) => { $(id).disabled = locked; $(id).style.visibility = locked ? 'hidden' : ''; });
    window.scrollTo(0, 0);
  }
  $('go-home').addEventListener('click', () => { if (current !== 'battle' && S.profile) goHome(); });
  $('go-dex').addEventListener('click', () => { renderDex(); show('dex'); });
  $('go-rank').addEventListener('click', () => openRank());

  // ── 학교 고르기 ────────────────────────────────────
  let SCHOOLS = null, SCHOOL_INDEX = {};
  async function loadSchools() {
    if (SCHOOLS) return SCHOOLS;
    const res = await fetch('schools.json');
    SCHOOLS = await res.json();
    for (const [sido, gus] of Object.entries(SCHOOLS)) {
      for (const [gu, list] of Object.entries(gus)) {
        for (const [code, name] of list) SCHOOL_INDEX[code] = { code, name, sido, gu };
      }
    }
    return SCHOOLS;
  }
  const schoolName = (code) => (SCHOOL_INDEX[code] ? SCHOOL_INDEX[code].name : '알 수 없는 학교');
  const sidoName = (s) => SIDO_LABEL[s] || s;

  function fillSelect(sel, items, placeholder) {
    sel.innerHTML = '';
    if (placeholder) sel.add(new Option(placeholder, ''));
    items.forEach(([value, label]) => sel.add(new Option(label, value)));
  }

  async function openJoin() {
    show('join');
    if (!$('grade').options.length) {
      for (let g = 1; g <= 6; g++) $('grade').add(new Option(`${g}학년`, g));
      $('cls').add(new Option('모름', 0));
      for (let c = 1; c <= 20; c++) $('cls').add(new Option(`${c}반`, c));
    }
    try { await loadSchools(); } catch (e) { $('join-msg').textContent = '학교 목록을 불러오지 못했어요. 새로고침해 주세요.'; return; }
    fillSelect($('sido'), SIDO_ORDER.filter((s) => SCHOOLS[s]).map((s) => [s, sidoName(s)]), '시·도 고르기');

    const p = S.profile || {};
    const q = new URLSearchParams(location.search);
    const pre = SCHOOL_INDEX[p.school || q.get('s')];
    if (pre) { $('sido').value = pre.sido; onSido(); $('gu').value = pre.gu; onGu(); $('school').value = pre.code; }
    $('grade').value = p.grade || q.get('g') || 3;
    $('cls').value = p.cls ?? q.get('c') ?? 0;
    if (!$('cls').value) $('cls').value = 0;
    $('nick').value = p.nick || '';
    $('join').textContent = S.profile ? '바꾸기' : '시작하기';
  }
  function onSido() {
    const gus = SCHOOLS[$('sido').value];
    $('gu').disabled = !gus; $('school-q').disabled = !gus; $('school').disabled = !gus;
    fillSelect($('gu'), gus ? Object.keys(gus).map((g) => [g, g]) : [], gus ? '전체' : '');
    $('school-q').value = '';
    listSchools();
  }
  function onGu() { $('school-q').value = ''; listSchools(); }
  function listSchools() {
    const sido = $('sido').value, gu = $('gu').value, q = $('school-q').value.trim();
    const sel = $('school');
    if (!SCHOOLS[sido]) { fillSelect(sel, []); return; }
    const gus = gu ? { [gu]: SCHOOLS[sido][gu] } : SCHOOLS[sido];
    const items = [];
    for (const [g, list] of Object.entries(gus)) {
      for (const [code, name] of list) if (!q || name.includes(q)) items.push([code, gu ? name : `${name} (${g})`]);
    }
    items.sort((a, b) => a[1].localeCompare(b[1], 'ko'));
    fillSelect(sel, items);
    if (items.length === 1) sel.value = items[0][0];
  }
  $('sido').addEventListener('change', onSido);
  $('gu').addEventListener('change', onGu);
  $('school-q').addEventListener('input', listSchools);

  $('join').addEventListener('click', () => {
    const msg = $('join-msg');
    const school = $('school').value, nick = $('nick').value.replace(/[<>&"'`]/g, '').trim();
    if (!SCHOOL_INDEX[school]) { msg.textContent = '목록에서 우리 학교를 눌러 골라 주세요.'; return; }
    if (!nick) { msg.textContent = '별명을 써 주세요.'; $('nick').focus(); return; }
    msg.textContent = '';
    S.profile = { school, grade: Number($('grade').value), cls: Number($('cls').value), nick };
    save(true);
    if (S.sent) submitScore();
    goHome();
  });

  // ── 키우기 ────────────────────────────────────────
  function stageIndex() {
    let i = 0;
    STAGES.forEach(([need], j) => { if (S.food >= need) i = j; });
    return i;
  }
  let lastStage = -1;
  function goHome() {
    show('home');
    const p = S.profile, info = SCHOOL_INDEX[p.school];
    $('me').innerHTML = '';
    const b = document.createElement('b'); b.textContent = p.nick;
    $('me').append(b, ` · ${info ? info.name : ''} ${p.grade}학년${p.cls ? ` ${p.cls}반` : ''} `);
    const edit = document.createElement('button');
    edit.className = 'pill'; edit.type = 'button'; edit.textContent = '바꾸기';
    edit.style.marginLeft = '4px'; edit.addEventListener('click', openJoin);
    $('me').append(edit);
    lastStage = -1;
    paintHome();
  }
  function paintHome() {
    const st = stageIndex();
    if (st !== lastStage) {
      if (lastStage >= 0 && st > lastStage) tune([[523], [659], [784], [1047]]);
      $('pet').innerHTML = petSVG(); lastStage = st;
      $('stage-name').textContent = STAGES[st][1];
    } else if (st === 0 && S.food >= 30 && !$('pet').innerHTML.includes('path')) {
      $('pet').innerHTML = petSVG();
    }
    $('food').textContent = fmt(S.food);
    $('power').textContent = `한 번에 +${tapPower()}`;
    const next = STAGES[st + 1];
    if (next) {
      const from = STAGES[st][0];
      $('grow-bar').style.width = ((S.food - from) / (next[0] - from) * 100) + '%';
      $('grow-text').textContent = `${next[1]}까지 ${fmt(next[0] - S.food)}`;
    } else {
      $('grow-bar').style.width = '100%';
      $('grow-text').textContent = '가장 멋진 모습이 되었어요!';
    }
    $('charges').innerHTML = Array.from({ length: MAX_CHARGES }, (_, i) => `<span class="${i < S.charges ? '' : 'off'}">⚡</span>`).join('');
    $('energy-bar').style.width = (S.charges >= MAX_CHARGES ? 100 : S.taps / TAPS_PER_CHARGE * 100) + '%';
    const btn = $('go-boss');
    btn.disabled = S.charges < 1;
    btn.textContent = S.charges < 1 ? `몬스터를 ${TAPS_PER_CHARGE - S.taps}번 더 눌러요` : '보스와 구구단 대결!';
  }

  let tapTimes = [];
  function tapPet(ev) {
    const now = performance.now();
    tapTimes = tapTimes.filter((t) => now - t < 1000);
    if (tapTimes.length >= MAX_TPS) return; // 너무 빠른 연타(자동 클릭)는 세지 않음
    tapTimes.push(now);
    const pw = tapPower();
    S.food += pw;
    if (S.charges < MAX_CHARGES) {
      S.taps++;
      if (S.taps >= TAPS_PER_CHARGE) { S.taps = 0; S.charges++; beep(880, 0.12, 'triangle'); }
    }
    beep(300 + Math.random() * 200, 0.05, 'sine', 0.06);
    const pet = $('pet');
    pet.classList.add('squish'); setTimeout(() => pet.classList.remove('squish'), 80);
    const plus = document.createElement('span');
    plus.className = 'plus'; plus.textContent = '+' + pw;
    if (ev && ev.clientX) {
      const r = pet.getBoundingClientRect();
      plus.style.left = (ev.clientX - r.left) + 'px'; plus.style.top = (ev.clientY - r.top - 30) + 'px';
    }
    pet.appendChild(plus); setTimeout(() => plus.remove(), 700);
    save(); paintHome();
  }
  $('pet').addEventListener('pointerdown', (e) => { e.preventDefault(); tapPet(e); });
  $('pet').addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); tapPet(null); } });
  $('go-boss').addEventListener('click', () => { renderSelect(); show('select'); });
  $('select-back').addEventListener('click', goHome);

  // ── 보스 고르기 · 도감 ──────────────────────────────
  const mixOpen = () => BOSS_KEYS.slice(0, 8).every((k) => S.caught.includes(k));
  const starText = (n) => '⭐'.repeat(n) + '<span style="opacity:.25">' + '⭐'.repeat(3 - n) + '</span>';
  function renderSelect() {
    const grid = $('boss-grid'); grid.innerHTML = '';
    for (const k of BOSS_KEYS) {
      const locked = k === 'x' && !mixOpen();
      const caught = S.caught.includes(k);
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'boss-card' + (locked ? ' locked' : '');
      card.innerHTML = `${bossSVG(k, !caught)}<b>${bossLabel(k)}</b><small>${locked ? '2~9단을 다 잡으면 열려요' : caught ? BOSSES[k].name : '아직 못 잡았어요'}</small><span class="st">${S.stars[k] ? starText(S.stars[k]) : ''}</span>`;
      if (!locked) card.addEventListener('click', () => startBattle(k));
      grid.appendChild(card);
    }
  }
  function renderDex() {
    const dex = $('dex'); dex.innerHTML = '';
    $('dex-sub').textContent = `${S.caught.length} / 9 마리를 모았어요 · 별 ${totalStars()}개`;
    for (const k of BOSS_KEYS) {
      const caught = S.caught.includes(k);
      const card = document.createElement('div'); card.className = 'dex-card';
      const tip = k === 'x' ? '2단부터 9단까지 섞어서 내는 대왕이에요.' : `가시가 ${k}개! ${k} × 9 = ${k * 9}`;
      card.innerHTML = `${bossSVG(k, !caught)}<b>${caught ? BOSSES[k].name : '???'}</b><small>${bossLabel(k)} 몬스터</small><p>${caught ? tip : `${bossLabel(k)} 보스를 이기면 잡을 수 있어요.`}</p>`;
      dex.appendChild(card);
    }
  }

  // ── 대결 ──────────────────────────────────────────
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function makeQuestions(k) {
    if (k !== 'x') {
      const d = Number(k);
      return [...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]), rnd(2, 9)].map((n) => [d, n]);
    }
    const all = [];
    for (let d = 2; d <= 9; d++) for (let n = 1; n <= 9; n++) all.push([d, n]);
    return shuffle(all).slice(0, BOSS_HP + HEARTS);
  }
  function choicesFor(d, n) {
    const ans = d * n;
    // 아이들이 자주 헷갈리는 답: 옆 칸, 옆 단, 1·10 차이
    const near = [d * (n + 1), d * (n - 1), (d + 1) * n, (d - 1) * n, ans + 1, ans - 1, ans + 10, ans - 10];
    const pool = shuffle([...new Set(near.filter((v) => v > 0 && v !== ans))]);
    return shuffle([ans, ...pool.slice(0, 3)]);
  }

  let B = null;
  function startBattle(k) {
    if (S.charges < 1) { goHome(); return; }
    S.charges--; save(true);
    B = { k, qs: makeQuestions(k), qi: 0, hp: BOSS_HP, hearts: HEARTS, right: 0, end: performance.now() + BATTLE_SEC * 1000, busy: false, over: false };
    if (B.qs.length < BOSS_HP + HEARTS) B.qs.push(...makeQuestions(k).slice(0, BOSS_HP + HEARTS - B.qs.length));
    $('boss-name').textContent = `${bossLabel(k)} · ${BOSSES[k].name}`;
    $('boss').innerHTML = bossSVG(k);
    show('battle');
    paintBattle(); nextQuestion();
    B.timer = setInterval(tickBattle, 100);
  }
  function tickBattle() {
    const left = Math.max(0, (B.end - performance.now()) / 1000);
    $('clock').textContent = Math.ceil(left);
    $('clock').classList.toggle('low', left <= 10);
    if (left <= 0) finishBattle(false);
  }
  function paintBattle() {
    $('hearts').innerHTML = Array.from({ length: HEARTS }, (_, i) => `<span class="${i < B.hearts ? '' : 'off'}">❤️</span>`).join('');
    $('hp-bar').style.width = (B.hp / BOSS_HP * 100) + '%';
  }
  function nextQuestion() {
    const [d, n] = B.qs[B.qi % B.qs.length];
    B.cur = { d, n, ans: d * n };
    $('question').textContent = `${d} × ${n} = ?`;
    const box = $('answers'); box.innerHTML = '';
    choicesFor(d, n).forEach((v) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = v;
      b.addEventListener('click', () => answer(v, b));
      box.appendChild(b);
    });
    B.busy = false;
  }
  function bump(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function answer(v, btn) {
    if (!B || B.busy || B.over) return;
    B.busy = true;
    const ok = v === B.cur.ans;
    if (ok) {
      btn.classList.add('right'); B.hp--; B.right++;
      bump($('boss'), 'hit'); beep(660, 0.1, 'square', 0.08);
    } else {
      btn.classList.add('wrong'); B.hearts--;
      [...$('answers').children].forEach((b) => { if (Number(b.textContent) === B.cur.ans) b.classList.add('right'); });
      bump($('boss'), 'attack'); beep(160, 0.25, 'sawtooth', 0.1);
      $('question').textContent = `${B.cur.d} × ${B.cur.n} = ${B.cur.ans}`;
    }
    paintBattle();
    B.qi++;
    if (B.hp <= 0) return setTimeout(() => finishBattle(true), 350);
    if (B.hearts <= 0) return setTimeout(() => finishBattle(false), 900);
    setTimeout(() => { if (!B.over) nextQuestion(); }, ok ? 220 : 900);
  }
  document.addEventListener('keydown', (e) => {
    if (current !== 'battle' || !B) return;
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    const btn = $('answers').children[i];
    if (btn) { e.preventDefault(); btn.click(); }
  });

  function finishBattle(win) {
    if (!B || B.over) return;
    B.over = true; clearInterval(B.timer);
    const k = B.k, left = Math.max(0, Math.floor((B.end - performance.now()) / 1000));
    const score = B.right * 100 + (win ? left * 10 + B.hearts * 50 : 0);
    const stars = win ? 1 + (B.hearts >= 2 ? 1 : 0) + (B.hearts === 3 && left >= 10 ? 1 : 0) : 0;
    const isNew = win && !S.caught.includes(k);
    const record = score > (S.best[k] || 0);
    if (record) S.best[k] = score;
    if (stars > (S.stars[k] || 0)) S.stars[k] = stars;
    if (isNew) S.caught.push(k);
    save(true);

    $('res-title').textContent = win ? (isNew ? `${BOSSES[k].name}을(를) 잡았어요!` : '보스를 물리쳤어요!') : (left <= 0 ? '시간이 다 됐어요!' : '보스가 이겼어요…');
    const mon = $('res-monster'); mon.innerHTML = bossSVG(k, !S.caught.includes(k));
    mon.classList.toggle('new', isNew); if (isNew) bump(mon, 'new');
    $('res-text').textContent = win
      ? (isNew ? `이제 한 번에 먹이를 +${tapPower()}씩 줄 수 있어요.` : `${bossLabel(k)} 실력이 쑥쑥 늘고 있어요!`)
      : `${B.right}문제 맞혔어요. ${bossLabel(k)}을 한 번 더 외워 보고 다시 도전해요!`;
    $('res-stars').innerHTML = win ? starText(stars) : '';
    $('res-score').textContent = fmt(score) + (record ? ' 🆕' : '');
    $('res-total').textContent = fmt(totalScore());
    $('res-again').disabled = S.charges < 1;
    $('res-again').textContent = S.charges < 1 ? '에너지가 없어요' : '다시 도전';
    show('result');
    win ? tune([[523], [659], [784], [1047, 400]]) : tune([[392], [330], [262]]);
    if (record || isNew) submitScore(); else $('res-save').textContent = '';
  }
  $('res-again').addEventListener('click', () => startBattle(B.k));
  $('res-home').addEventListener('click', goHome);

  // ── 랭킹 ──────────────────────────────────────────
  let entries = null, rankView = 'class', myId = null;
  (async () => {
    try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(S.pid));
      myId = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
    } catch (e) { myId = null; }
  })();

  async function submitScore() {
    const p = S.profile;
    if (!p) return;
    const body = { pid: S.pid, name: p.nick, school: p.school, grade: p.grade, cls: p.cls, score: totalScore(), clears: S.caught.length };
    const status = $('res-save');
    status.textContent = '랭킹에 올리는 중…';
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '');
      entries = data.entries;
      S.sent = { score: body.score, at: Date.now() }; save(true);
      const mine = rankOf(entries.filter((x) => x.school === p.school && x.grade === p.grade && x.cls === p.cls));
      status.textContent = mine ? `랭킹에 올렸어요! 우리 반 ${mine}등이에요.` : '랭킹에 올렸어요!';
    } catch (e) {
      status.textContent = '지금은 랭킹에 올리지 못했어요. 다음 판에 다시 올려 볼게요.';
    }
  }
  function rankOf(list) {
    const i = [...list].sort((a, b) => b.score - a.score).findIndex((x) => x.id === myId);
    return i >= 0 ? i + 1 : 0;
  }

  async function openRank() {
    show('rank');
    paintTabs();
    $('board').innerHTML = '<li class="empty">랭킹을 불러오는 중…</li>';
    try { await loadSchools(); } catch (e) { /* 학교 이름 없이도 보여 줌 */ }
    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      entries = (await res.json()).entries;
    } catch (e) {
      if (!entries) { $('board').innerHTML = '<li class="empty">랭킹 서버에 연결하지 못했어요. 인터넷을 확인하고 다시 열어 주세요.</li>'; return; }
    }
    renderRank();
  }
  function paintTabs() {
    document.querySelectorAll('#rank-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === rankView)));
  }
  document.querySelectorAll('#rank-tabs button').forEach((b) => b.addEventListener('click', () => { rankView = b.dataset.view; paintTabs(); if (entries) renderRank(); }));

  function renderRank() {
    const p = S.profile || {}, mine = SCHOOL_INDEX[p.school] || {};
    const board = $('board'); board.innerHTML = '';
    const valid = entries.filter((x) => SCHOOL_INDEX[x.school]);
    const classText = (x) => `${x.grade}학년${x.cls ? ` ${x.cls}반` : ''}`;
    let list, desc, sub;
    if (rankView === 'schools') {
      const agg = new Map();
      for (const x of valid) {
        const a = agg.get(x.school) || { school: x.school, score: 0, n: 0 };
        a.score += x.score; a.n++; agg.set(x.school, a);
      }
      const rows = [...agg.values()].sort((a, b) => b.score - a.score);
      $('rank-desc').textContent = '학교 친구들 점수를 모두 더해요. 친구가 많이 할수록 우리 학교가 올라가요!';
      if (!rows.length) return empty();
      rows.slice(0, 50).forEach((a, i) => {
        const s = SCHOOL_INDEX[a.school];
        addRow(i, s.name, `${sidoName(s.sido)} ${s.gu}`, a.score, `${a.n}명`, a.school === p.school);
      });
      const at = rows.findIndex((a) => a.school === p.school);
      if (at >= 50) addNote(`우리 학교는 ${at + 1}등이에요.`);
      return;
    }
    if (rankView === 'class') {
      list = valid.filter((x) => x.school === p.school && x.grade === p.grade && x.cls === p.cls);
      desc = `${mine.name || ''} ${p.grade}학년${p.cls ? ` ${p.cls}반` : ''} 친구들`;
      sub = () => '';
    } else if (rankView === 'school') {
      list = valid.filter((x) => x.school === p.school);
      desc = `${mine.name || ''} 친구들`;
      sub = classText;
    } else if (rankView === 'region') {
      list = valid.filter((x) => SCHOOL_INDEX[x.school].sido === mine.sido);
      desc = `${sidoName(mine.sido || '')} 지역 친구들`;
      sub = (x) => schoolName(x.school);
    } else {
      list = valid;
      desc = '전국의 초등학생 친구들';
      sub = (x) => `${sidoName(SCHOOL_INDEX[x.school].sido)} · ${schoolName(x.school)}`;
    }
    $('rank-desc').textContent = `${desc} · 점수는 보스마다 가장 잘한 점수를 더한 값이에요.`;
    list.sort((a, b) => b.score - a.score);
    if (!list.length) return empty();
    list.slice(0, 100).forEach((x, i) => addRow(i, x.name, sub(x), x.score, `몬스터 ${x.clears}마리`, x.id === myId));
    const at = list.findIndex((x) => x.id === myId);
    if (at >= 100) addNote(`내 순위는 ${at + 1}등이에요.`);
    else if (at < 0 && S.profile) addNote('보스를 한 번 이기면 내 기록이 올라가요.');
  }
  function empty() {
    $('board').innerHTML = '<li class="empty">아직 기록이 없어요. 첫 번째 1등이 되어 보세요!</li>';
  }
  function addNote(text) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; $('board').appendChild(li);
  }
  function addRow(i, name, sub, pts, ptsSub, me) {
    const li = document.createElement('li');
    if (me) li.className = 'me';
    li.innerHTML = '<span class="no"></span><span class="who"><span></span><small></small></span><span class="pts"><span></span><small></small></span>';
    li.querySelector('.no').textContent = ['🥇', '🥈', '🥉'][i] || i + 1;
    li.querySelector('.who span').textContent = name;
    li.querySelector('.who small').textContent = sub;
    li.querySelector('.pts span').textContent = fmt(pts);
    li.querySelector('.pts small').textContent = ptsSub;
    $('board').appendChild(li);
  }

  $('invite').addEventListener('click', async () => {
    const p = S.profile, msg = $('invite-msg');
    if (!p) return;
    const url = `${location.origin}${location.pathname}?s=${p.school}&g=${p.grade}&c=${p.cls}`;
    try { await navigator.clipboard.writeText(url); msg.textContent = '링크를 복사했어요! 반 친구들에게 보내 주세요.'; }
    catch (e) { msg.textContent = url; }
  });

  // ── 시작 ──────────────────────────────────────────
  paintSound();
  if (S.profile) { loadSchools().then(goHome, goHome); } else { openJoin(); }
})();
