// 모산 타자왕 랭킹 API (Vercel Function)
// 랭킹 전체를 Vercel Blob의 비공개 파일 하나(ranking.json)에 저장한다.
// 여러 학생이 동시에 기록을 올려도 덮어쓰지 않도록 ETag(ifMatch)로 조건부 저장하고, 충돌하면 다시 시도한다.
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const PATH = 'ranking.json';
const TOPICS = ['life', 'traffic', 'violence', 'addiction', 'disaster', 'work', 'firstaid'];
const LIMIT = 5000; // 이름·학년·주제마다 최고 기록 하나씩, 최대 개수

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byScore = (a, b) => b.score - a.score || b.accuracy - a.accuracy;

async function read() {
  const res = await get(PATH, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return { entries: [], etag: null };
  const text = await new Response(res.stream).text();
  return { entries: JSON.parse(text || '[]'), etag: res.blob.etag };
}

// change(entries)로 새 목록을 만들어 저장. 다른 요청이 먼저 저장했으면 다시 읽어서 재시도
async function update(change) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { entries, etag } = await read();
    const next = change(entries);
    try {
      await put(PATH, JSON.stringify(next), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return next;
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || /already exists/i.test(String(e && e.message));
      if (!conflict) throw e;
      await sleep(40 + Math.random() * 200);
    }
  }
  throw new Error('busy');
}

function clean(body) {
  const name = String(body.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);
  const grade = Number(body.grade);
  const topic = String(body.topic || '');
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  if (!name || !Number.isInteger(grade) || grade < 1 || grade > 7 || !TOPICS.includes(topic)) return null;
  return {
    name,
    grade,
    topic,
    score: num(body.score, 2000),
    speed: num(body.speed, 2000),
    accuracy: num(body.accuracy, 100),
    date: new Date().toISOString(),
  };
}

function keepBest(entries) {
  const key = (x) => `${x.name}|${x.grade}|${x.topic}`;
  const best = new Map();
  entries.slice().sort(byScore).forEach((x) => { if (!best.has(key(x))) best.set(key(x), x); });
  return [...best.values()].slice(0, LIMIT);
}

export async function GET() {
  try {
    const { entries } = await read();
    return json({ entries });
  } catch (e) {
    return json({ error: '랭킹을 불러오지 못했어요.' }, 500);
  }
}

export async function POST(request) {
  let entry;
  try { entry = clean(await request.json()); } catch (e) { entry = null; }
  if (!entry) return json({ error: '기록이 올바르지 않아요.' }, 400);
  try {
    const entries = await update((list) => keepBest([...list, entry]));
    return json({ entries });
  } catch (e) {
    return json({ error: '지금은 저장할 수 없어요. 잠시 뒤 다시 해 주세요.' }, 503);
  }
}

// 관리자: { password, name } 이면 그 이름의 기록만, { password } 만 있으면 전체를 지움
export async function DELETE(request) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* 빈 요청 */ }
  const admin = process.env.ADMIN_PASSWORD;
  if (!admin || body.password !== admin) return json({ error: '관리자 비밀번호가 맞지 않아요.' }, 403);
  const name = String(body.name || '').trim();
  try {
    const entries = await update((list) => (name ? list.filter((x) => x.name !== name) : []));
    return json({ entries });
  } catch (e) {
    return json({ error: '지금은 지울 수 없어요. 잠시 뒤 다시 해 주세요.' }, 503);
  }
}
