// 모산 타자왕 랭킹 API (Vercel Function)
// 기록 하나(이름·학년·주제의 최고 기록)를 Vercel Blob 비공개 파일 하나로 저장한다.
// 점수까지 파일 이름에 넣어 두어서, 파일 목록(list)만 읽으면 랭킹 전체를 알 수 있다.
//   scores/<학년>/<주제>/<이름(16진수)>/<점수>_<글자수>_<정확도>_<시각>.json
// 학생마다 파일이 따로라서 반 전체가 한꺼번에 저장해도 서로 기다리지 않는다.
import { list, put, del } from '@vercel/blob';

const ROOT = 'scores/';
const TOPICS = ['life', 'traffic', 'violence', 'addiction', 'disaster', 'work', 'firstaid'];

const json = (data, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });

const hex = (text) => Buffer.from(text, 'utf8').toString('hex');
const unhex = (code) => Buffer.from(code, 'hex').toString('utf8');
const folder = (x) => `${ROOT}${x.grade}/${x.topic}/${hex(x.name)}/`;

function parse(blob) {
  const m = blob.pathname.match(/^scores\/(\d)\/([a-z]+)\/([0-9a-f]+)\/(\d+)_(\d+)_(\d+)_(\d+)\.json$/);
  if (!m) return null;
  return {
    name: unhex(m[3]),
    grade: Number(m[1]),
    topic: m[2],
    score: Number(m[4]),
    speed: Number(m[5]),
    accuracy: Number(m[6]),
    date: new Date(Number(m[7])).toISOString(),
    url: blob.url,
  };
}

async function listAll(prefix = ROOT) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs.map(parse).filter(Boolean);
}

const byScore = (a, b) => b.score - a.score || b.accuracy - a.accuracy;
// 같은 사람이 아주 짧은 사이에 두 번 저장해 파일이 둘 남은 경우를 대비해 최고 기록만 남김
function keepBest(entries) {
  const best = new Map();
  entries.sort(byScore).forEach((x) => {
    const key = `${x.name}|${x.grade}|${x.topic}`;
    if (!best.has(key)) best.set(key, x);
  });
  return [...best.values()].map(({ url, ...x }) => x);
}

function clean(body) {
  const name = String(body.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);
  const grade = Number(body.grade);
  const topic = String(body.topic || '');
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  if (!name || !Number.isInteger(grade) || grade < 1 || grade > 7 || !TOPICS.includes(topic)) return null;
  return { name, grade, topic, score: num(body.score, 2000), speed: num(body.speed, 2000), accuracy: num(body.accuracy, 100) };
}

// 여러 컴퓨터가 동시에 열어도 목록 읽기가 몰리지 않도록 몇 초 동안 Vercel이 응답을 재사용
export async function GET() {
  try {
    return json({ entries: keepBest(await listAll()) }, 200, 'public, max-age=0, s-maxage=3, stale-while-revalidate=10');
  } catch (e) {
    return json({ error: '랭킹을 불러오지 못했어요.' }, 500);
  }
}

export async function POST(request) {
  let entry;
  try { entry = clean(await request.json()); } catch (e) { entry = null; }
  if (!entry) return json({ error: '기록이 올바르지 않아요.' }, 400);
  try {
    const dir = folder(entry);
    const old = await listAll(dir);
    // 예전 기록보다 높을 때만 바꿈
    if (!old.some((x) => byScore(x, entry) <= 0)) {
      await put(`${dir}${entry.score}_${entry.speed}_${entry.accuracy}_${Date.now()}.json`, '{}', {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      if (old.length) await del(old.map((x) => x.url));
    }
    return json({ entries: keepBest(await listAll()) });
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
    const targets = (await listAll()).filter((x) => !name || x.name === name);
    for (let i = 0; i < targets.length; i += 500) await del(targets.slice(i, i + 500).map((x) => x.url));
    return json({ entries: keepBest(await listAll()) });
  } catch (e) {
    return json({ error: '지금은 지울 수 없어요. 잠시 뒤 다시 해 주세요.' }, 503);
  }
}
