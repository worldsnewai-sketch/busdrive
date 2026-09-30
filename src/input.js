// 키보드 + 터치 입력
export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressedQ = new Set();
    this.joy = { x: 0, y: 0, active: false };
    this.touchBtn = new Set();
    this.look = { dx: 0, dy: 0, dragging: false };
    this.wheel = 0;

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedQ.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    // 마우스 드래그로 시점 회전
    let last = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      last = { x: e.clientX, y: e.clientY };
      this.look.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last || e.pointerType === 'touch') return;
      this.look.dx += e.clientX - last.x; this.look.dy += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => { last = null; this.look.dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  // 터치 조이스틱과 버튼 연결
  bindTouch(joyEl, knobEl, lookEl, buttons) {
    let jid = null, origin = null;
    const R = 50;
    joyEl.addEventListener('pointerdown', (e) => {
      jid = e.pointerId; joyEl.setPointerCapture(jid);
      const r = joyEl.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      move(e);
    });
    const move = (e) => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      this.joy.x = dx / R; this.joy.y = -dy / R; this.joy.active = true;
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    joyEl.addEventListener('pointermove', move);
    const up = (e) => {
      if (e.pointerId !== jid) return;
      jid = null; this.joy.x = 0; this.joy.y = 0; this.joy.active = false;
      knobEl.style.transform = '';
    };
    joyEl.addEventListener('pointerup', up);
    joyEl.addEventListener('pointercancel', up);

    let lid = null, ll = null;
    lookEl.addEventListener('pointerdown', (e) => { lid = e.pointerId; ll = { x: e.clientX, y: e.clientY }; lookEl.setPointerCapture(lid); this.look.dragging = true; });
    lookEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      this.look.dx += (e.clientX - ll.x) * 1.4; this.look.dy += (e.clientY - ll.y) * 1.4;
      ll = { x: e.clientX, y: e.clientY };
    });
    const lup = (e) => { if (e.pointerId === lid) { lid = null; this.look.dragging = false; } };
    lookEl.addEventListener('pointerup', lup);
    lookEl.addEventListener('pointercancel', lup);

    for (const [el, code] of buttons) {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.touchBtn.add(code); this.pressedQ.add(code); el.classList.add('on'); });
      const rel = () => { this.touchBtn.delete(code); el.classList.remove('on'); };
      el.addEventListener('pointerup', rel);
      el.addEventListener('pointercancel', rel);
      el.addEventListener('pointerleave', rel);
    }
  }

  held(...codes) { return codes.some((c) => this.down.has(c) || this.touchBtn.has(c)); }
  pressed(...codes) { return codes.some((c) => this.pressedQ.has(c)); }

  axis() {
    let x = 0, y = 0;
    if (this.held('KeyW', 'ArrowUp')) y += 1;
    if (this.held('KeyS', 'ArrowDown')) y -= 1;
    if (this.held('KeyA', 'ArrowLeft')) x -= 1;
    if (this.held('KeyD', 'ArrowRight')) x += 1;
    if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  consumeLook() { const l = { dx: this.look.dx, dy: this.look.dy }; this.look.dx = 0; this.look.dy = 0; return l; }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  endFrame() { this.pressedQ.clear(); }
}
