// 동해페이 지갑, 연료, 체력, 효과(버프), 기념품, 가게 메뉴
// 게임 안의 가상 화폐이며 실제 동해사랑카드/지역화폐와는 관계없다.

export const FARE = 1500;          // 승객 1명 요금
export const TIP = 500;            // 부딪히지 않고 모셔다 드리면 받는 팁
export const STAMP_REWARD = 3000;  // 새 스탬프 보상
export const FUEL_PRICE = 90;      // 연료 1%당 가격
export const FUEL_PER_KM = 20;     // 1km 달리면 줄어드는 연료(%)

export const BUFFS = {
  caffeine: { name: '카페인', note: '걷기·달리기 +35%' },
  full: { name: '든든함', note: '달려도 지치지 않음' },
  cool: { name: '시원함', note: '체력 회복 2배' },
};

export const SHOPS = [
  {
    id: 'mukho-cafe', site: 'mukho', name: '논골 바다카페', kind: '카페',
    lede: '등대 언덕 아래, 창밖으로 묵호항이 내려다보이는 작은 카페예요.',
    items: [
      { id: 'americano', name: '아메리카노', drink: true, price: 4500, desc: '2분 동안 걷기·달리기 속도 +35%', effect: { buff: 'caffeine', sec: 120 } },
      { id: 'latte', name: '바닐라 라떼', drink: true, price: 5500, desc: '체력 +50, 90초 동안 속도 +35%', effect: { stamina: 50, buff: 'caffeine', sec: 90 } },
      { id: 'mulhoe', name: '묵호항 물회', price: 13000, desc: '체력 가득, 3분 동안 달려도 지치지 않음', effect: { stamina: 100, buff: 'full', sec: 180 } },
      { id: 'dokkaebi-doll', name: '도째비 인형', price: 12000, souvenir: true, desc: '빨간 몸에 뿔 하나, 방망이를 든 도째비골 마스코트 인형' },
      { id: 'nongol-postcards', name: '논골담길 엽서 세트', price: 4000, souvenir: true, desc: '오징어 말리는 골목과 등대 벽화를 담은 엽서 6장' },
    ],
  },
  {
    id: 'chuam-store', site: 'chuam', name: '추암 해변 매점', kind: '매점·기념품',
    lede: '해변 입구의 매점이에요. 해수욕 뒤에 먹는 간식과 기념품을 팔아요.',
    items: [
      { id: 'icecream', name: '아이스크림', price: 2000, desc: '체력 +30, 2분 동안 체력 회복 2배', effect: { stamina: 30, buff: 'cool', sec: 120 } },
      { id: 'corn', name: '찐 옥수수', price: 3000, desc: '체력 +60', effect: { stamina: 60 } },
      { id: 'cider', name: '사이다', drink: true, price: 1500, desc: '체력 +25', effect: { stamina: 25 } },
      { id: 'candle-mini', name: '촛대바위 미니어처', price: 9000, souvenir: true, desc: '손바닥만 한 돌 조각 촛대바위. 책상 위의 일출 명소' },
      { id: 'pebble-keyring', name: '추암 조약돌 키링', price: 5000, souvenir: true, desc: '파도에 닳은 조약돌 모양 키링' },
    ],
  },
  {
    id: 'mureung-food', site: 'mureung', name: '무릉 산채식당', kind: '식당',
    lede: '계곡 입구의 한옥 식당이에요. 두타산에서 난 나물로 상을 차려요.',
    items: [
      { id: 'bibimbap', name: '산채비빔밥', price: 10000, desc: '체력 가득, 3분 동안 달려도 지치지 않음', effect: { stamina: 100, buff: 'full', sec: 180 } },
      { id: 'potato-pancake', name: '감자전', price: 8000, desc: '체력 +70', effect: { stamina: 70 } },
      { id: 'sikhye', name: '식혜', drink: true, price: 3000, desc: '체력 +30, 2분 동안 체력 회복 2배', effect: { stamina: 30, buff: 'cool', sec: 120 } },
      { id: 'rubbing-cloth', name: '석각 탁본 손수건', price: 7000, souvenir: true, desc: '무릉반석 석각 "武陵仙源"을 찍어 낸 손수건' },
      { id: 'pine-sachet', name: '두타산 솔잎 향주머니', price: 6000, souvenir: true, desc: '솔잎을 말려 넣은 작은 향주머니' },
    ],
  },
];

export const SOUVENIRS = SHOPS.flatMap((s) => s.items.filter((i) => i.souvenir).map((i) => ({ ...i, shop: s })));

const SAVE_KEY = 'donghae-bus-tour-econ-v1';

export const econ = {
  money: 10000,
  fuel: 100,
  stamina: 100,
  buffs: {},          // id -> 남은 초
  souvenirs: [],
  stats: { passengers: 0, earned: 0, spent: 0, km: 0 },
  bumps: 0,           // 누적 충돌 수 (승객 팁 계산용)

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return;
      this.money = d.money ?? this.money;
      this.fuel = d.fuel ?? this.fuel;
      this.souvenirs = d.souvenirs || [];
      Object.assign(this.stats, d.stats || {});
    } catch { /* 저장소 없음 */ }
  },
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ money: this.money, fuel: this.fuel, souvenirs: this.souvenirs, stats: this.stats }));
    } catch { /* 무시 */ }
  },
  earn(n) { this.money += n; this.stats.earned += n; this.save(); },
  spend(n) {
    if (n > this.money) return false;
    this.money -= n; this.stats.spent += n; this.save();
    return true;
  },
  buff(id) { return (this.buffs[id] || 0) > 0; },

  // 가게 물건 사기. 성공하면 결과 문구, 실패하면 null
  buy(item) {
    if (item.souvenir && this.souvenirs.includes(item.id)) return null;
    if (!this.spend(item.price)) return null;
    if (item.souvenir) { this.souvenirs.push(item.id); this.save(); return `여행 가방에 쏙 · ${item.name}`; }
    const e = item.effect || {};
    if (e.stamina) this.stamina = Math.min(100, this.stamina + e.stamina);
    if (e.buff) this.buffs[e.buff] = Math.max(this.buffs[e.buff] || 0, e.sec);
    return item.drink ? `${item.name} 한 잔 시원하게 마셨어요` : `${item.name} 맛있게 먹었어요`;
  },

  // 주유: 돈이 모자라면 살 수 있는 만큼만
  refuel() {
    const need = Math.ceil(100 - this.fuel);
    const can = Math.min(need, Math.floor(this.money / FUEL_PRICE));
    if (can <= 0) return 0;
    this.spend(can * FUEL_PRICE);
    this.fuel = Math.min(100, this.fuel + can);
    this.save();
    return can;
  },

  tick(dt, { walking, running, driving, meters }) {
    for (const k of Object.keys(this.buffs)) {
      this.buffs[k] -= dt;
      if (this.buffs[k] <= 0) delete this.buffs[k];
    }
    if (driving && meters) {
      this.fuel = Math.max(0, this.fuel - (meters / 1000) * FUEL_PER_KM);
      this.stats.km += meters / 1000;
    }
    const regen = this.buff('cool') ? 2 : 1;
    if (running && !this.buff('full')) this.stamina = Math.max(0, this.stamina - 9 * dt);
    else if (walking) this.stamina = Math.min(100, this.stamina + 2 * regen * dt);
    else this.stamina = Math.min(100, this.stamina + 5 * regen * dt);
  },
};

export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
