// 구구단 몬스터 랭킹 API (Vercel Function)
// 학생 한 명의 최고 기록을 Vercel Blob 비공개 파일 하나로 저장한다.
// 점수까지 파일 이름에 넣어 두어서, 파일 목록(list)만 읽으면 랭킹 전체를 알 수 있다.
//   scores/<학교코드>/<학생id>/<점수>_<잡은몬스터>_<학년>_<반>_<시각>_<별명(16진수)>.json
// 학생마다 파일이 따로라서 반 전체가 한꺼번에 저장해도 서로 기다리지 않는다.
import { createHash } from 'node:crypto';
import { list, put, del } from '@vercel/blob';

const ROOT = 'scores/';
const MAX_SCORE = 9 * 1450; // 보스 9마리 × 한 판 최고점

const json = (data, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });

const hex = (text) => Buffer.from(text, 'utf8').toString('hex');
const unhex = (code) => Buffer.from(code, 'hex').toString('utf8');
// 학생 id는 비밀 열쇠처럼 쓰이므로 밖으로는 해시만 보여 준다
const publicId = (pid) => createHash('sha256').update(pid).digest('hex').slice(0, 12);

function parse(blob) {
  const m = blob.pathname.match(/^scores\/([A-Z]\d{9})\/([0-9a-f]{16})\/(\d+)_(\d)_(\d)_(\d+)_(\d+)_([0-9a-f]+)\.json$/);
  if (!m) return null;
  return {
    id: publicId(m[2]),
    pid: m[2],
    school: m[1],
    score: Number(m[3]),
    clears: Number(m[4]),
    grade: Number(m[5]),
    cls: Number(m[6]),
    date: new Date(Number(m[7])).toISOString(),
    name: unhex(m[8]),
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

// 같은 학생이 아주 짧은 사이에 두 번 저장해 파일이 둘 남은 경우를 대비해 최고 기록만 남김
function keepBest(entries) {
  const best = new Map();
  entries.sort((a, b) => b.score - a.score).forEach((x) => {
    if (!best.has(x.pid)) best.set(x.pid, x);
  });
  return [...best.values()].map(({ url, pid, ...x }) => x);
}

function clean(body) {
  const name = String(body.name || '').replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, 8);
  const pid = String(body.pid || '');
  const school = String(body.school || '');
  const int = (v, min, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const entry = {
    name,
    pid,
    school,
    grade: int(body.grade, 1, 6),
    cls: int(body.cls, 0, 30),
    score: int(body.score, 0, MAX_SCORE),
    clears: int(body.clears, 0, 9),
  };
  if (!name || !/^[0-9a-f]{16}$/.test(pid) || !/^[A-Z]\d{9}$/.test(school)) return null;
  if (Object.values(entry).some((v) => v === null)) return null;
  return entry;
}

// 여러 컴퓨터가 동시에 열어도 목록 읽기가 몰리지 않도록 몇 초 동안 Vercel이 응답을 재사용
export async function GET() {
  try {
    return json({ entries: keepBest(await listAll()) }, 200, 'public, max-age=0, s-maxage=5, stale-while-revalidate=20');
  } catch (e) {
    return json({ error: '랭킹을 불러오지 못했어요.' }, 500);
  }
}

export async function POST(request) {
  let entry;
  try { entry = clean(await request.json()); } catch (e) { entry = null; }
  if (!entry) return json({ error: '기록이 올바르지 않아요.' }, 400);
  try {
    // 학교를 바꾼 학생도 있으니 학생 id로 예전 파일을 모두 찾는다
    const mine = (await listAll()).filter((x) => x.pid === entry.pid);
    const prev = mine.reduce((m, x) => Math.max(m, x.score), -1);
    const same = mine.length === 1 && mine[0].school === entry.school && mine[0].name === entry.name
      && mine[0].grade === entry.grade && mine[0].cls === entry.cls;
    // 점수가 오르거나 별명·학교·학년·반이 바뀌었을 때만 새로 저장 (점수는 내려가지 않음)
    if (entry.score > prev || !same) {
      const score = Math.max(entry.score, prev);
      const path = `${ROOT}${entry.school}/${entry.pid}/${score}_${entry.clears}_${entry.grade}_${entry.cls}_${Date.now()}_${hex(entry.name)}.json`;
      await put(path, '{}', { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
      const old = mine.filter((x) => x.url && !x.url.endsWith(path));
      if (old.length) await del(old.map((x) => x.url));
    }
    return json({ entries: keepBest(await listAll()) });
  } catch (e) {
    return json({ error: '지금은 저장할 수 없어요. 잠시 뒤 다시 해 주세요.' }, 503);
  }
}

// 선생님(관리자): { password, id } 이면 그 학생 기록만, { password, school } 이면 그 학교 기록을 지움
export async function DELETE(request) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* 빈 요청 */ }
  const admin = process.env.ADMIN_PASSWORD;
  if (!admin || body.password !== admin) return json({ error: '관리자 비밀번호가 맞지 않아요.' }, 403);
  const id = String(body.id || ''), school = String(body.school || '');
  if (!id && !school) return json({ error: '지울 학생이나 학교를 골라 주세요.' }, 400);
  try {
    const targets = (await listAll()).filter((x) => (id ? publicId(x.pid) === id : x.school === school));
    for (let i = 0; i < targets.length; i += 500) await del(targets.slice(i, i + 500).map((x) => x.url));
    return json({ entries: keepBest(await listAll()) });
  } catch (e) {
    return json({ error: '지금은 지울 수 없어요. 잠시 뒤 다시 해 주세요.' }, 503);
  }
}
