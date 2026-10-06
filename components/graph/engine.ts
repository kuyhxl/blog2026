// 브레인 맵과 FIG. 01의 움직임. 원본은 MainV2·PostV2 스크립트의 step()과 place().
// 점은 제자리 둘레를 천천히 떠다니고, 연결된 점끼리는 원래 거리를 지키려 하고, 가까운 점끼리는 서로 밀어낸다.
// 계산은 작은 창 크기의 좌표(W×H)에서 하고, 그릴 때 각 창 크기에 맞춘다. 점과 선의 자리는 React를 거치지 않고 바로 옮긴다
const K_HOME = 0.012; // 제자리로 돌아가려는 힘
const K_LINK = 0.009; // 연결된 점끼리 원래 거리를 지키려는 힘 (끌면 이웃이 따라온다)
const K_PUSH = 0.25; // 겹치지 않게 서로 밀어내는 힘
const DAMP = 0.76; // 프레임마다 남는 속도
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export type EngineOptions = { W: number; H: number; pad: number; amp: number; reach?: number };
export type ViewMap = (w: number, h: number) => { kx: number; ky: number; ox: number; oy: number };

type SimNode = { x: number; y: number; vx: number; vy: number; ax: number; ay: number; hx: number; hy: number; p1: number; p2: number; w1: number; w2: number };
type SimLink = { a: SimNode; b: SimNode; len: number };
type View = { el: HTMLElement; map: ViewMap; m: ReturnType<ViewMap> | null; w: number; h: number; visible: boolean; active: boolean; io: IntersectionObserver | null };
type Held = { i: number; view: View; pid: number; sx: number; sy: number; moved: boolean; dx: number; dy: number };

export class GraphEngine {
  readonly opts: EngineOptions;
  readonly sim: SimNode[];
  readonly links: SimLink[];
  readonly reach: number;
  private views = new Set<View>();
  private amp = 0;
  private speed = 0;
  private held: Held | null = null;
  private raf = 0;
  private last = 0;
  private odd = false;
  private calm = () => false;
  dropped = false; // 끌다가 놓은 직후. 이때의 클릭은 글로 이동하지 않는다
  onDragChange: ((dragging: number | null) => void) | null = null;

  constructor(homes: { x: number; y: number }[], pairs: [number, number][], opts: EngineOptions) {
    this.opts = opts;
    this.sim = homes.map((h, i) => ({
      x: h.x, y: h.y, vx: 0, vy: 0, ax: 0, ay: 0, hx: h.x, hy: h.y,
      p1: i * 2.399963, p2: i * 1.731 + 0.6, w1: 0.00052 + (i % 5) * 0.00007, w2: 0.00041 + (i % 7) * 0.00005,
    }));
    this.links = pairs.map(([a, b]) => ({ a: this.sim[a], b: this.sim[b], len: Math.hypot(this.sim[b].hx - this.sim[a].hx, this.sim[b].hy - this.sim[a].hy) }));
    // 서로 밀어내기 시작하는 거리: 정해 주지 않으면 처음 배치에서 아무도 밀리지 않게 잡는다
    let reach = opts.reach ?? 14;
    if (opts.reach == null)
      for (let i = 0; i < this.sim.length; i++)
        for (let j = i + 1; j < this.sim.length; j++) reach = Math.min(reach, Math.hypot(this.sim[i].hx - this.sim[j].hx, this.sim[i].hy - this.sim[j].hy) * 0.92);
    this.reach = Math.max(reach, 2);
  }

  // 창 하나를 붙인다. 화면에 보이고 접혀 있지 않은 창이 하나라도 있을 때만 계산한다
  attach(el: HTMLElement, map: ViewMap, active = true) {
    const view: View = { el, map, m: null, w: 0, h: 0, visible: true, active, io: null };
    if (typeof IntersectionObserver !== "undefined") {
      view.io = new IntersectionObserver(([e]) => {
        view.visible = e.isIntersecting;
        this.run();
      });
      view.io.observe(el);
    }
    this.views.add(view);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.calm = () => reduce.matches;
    this.place(true);
    this.run();
    return () => {
      view.io?.disconnect();
      this.views.delete(view);
      this.run();
    };
  }

  // 접는 창을 접거나 펼칠 때. 접힌 창은 높이가 0이어도 화면에 보인다고 판정될 수 있어서 따로 알린다
  setActive(el: HTMLElement, active: boolean) {
    for (const v of this.views) if (v.el === el) v.active = active;
    this.place(true);
    this.run();
  }

  private run() {
    const want = [...this.views].some((v) => v.visible && v.active);
    if (want && !this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.tick);
    } else if (!want && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    // 천천히 떠다니기만 하는 동안에는 두 프레임에 한 번만 계산한다
    this.odd = !this.odd;
    if (this.odd && !this.held && !(this.speed > 0.2)) return;
    const dt = clamp((now - (this.last || now)) / 16.667, 0.25, 3);
    this.last = now;
    this.place(this.step(now, dt));
  };

  // 한 프레임만큼 힘을 계산해 점을 옮긴다. 움직인 점이 있으면 true
  private step(now: number, dt: number) {
    const { W, H, pad, amp: AMP } = this.opts;
    const N = this.sim, held = this.held ? N[this.held.i] : null;
    // "동작 줄이기"를 켜면 떠다니지 않는다. 끌기는 그대로 된다
    this.amp += ((this.calm() ? 0 : AMP) - this.amp) * Math.min(1, 0.03 * dt);
    const amp = this.amp;
    for (const n of N) {
      const tx = n.hx + amp * (Math.sin(now * n.w1 + n.p1) + 0.45 * Math.sin(now * n.w2 * 1.9 + n.p2));
      const ty = n.hy + amp * (Math.cos(now * n.w2 + n.p2) + 0.45 * Math.sin(now * n.w1 * 1.7 + n.p1 * 1.3));
      n.ax = (tx - n.x) * K_HOME;
      n.ay = (ty - n.y) * K_HOME;
    }
    for (const l of this.links) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 0.001, f = (K_LINK * (d - l.len)) / d;
      l.a.ax += dx * f;
      l.a.ay += dy * f;
      l.b.ax -= dx * f;
      l.b.ay -= dy * f;
    }
    const R = this.reach;
    for (let i = 0; i < N.length; i++)
      for (let j = i + 1; j < N.length; j++) {
        const a = N[i], b = N[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 0.001, f = (K_PUSH * (1 - d / R)) / d;
        a.ax -= dx * f;
        a.ay -= dy * f;
        b.ax += dx * f;
        b.ay += dy * f;
      }
    const keep = Math.pow(DAMP, dt);
    let far = 0;
    for (const n of N) {
      if (n === held) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx = (n.vx + n.ax * dt) * keep;
      n.vy = (n.vy + n.ay * dt) * keep;
      const x = clamp(n.x + n.vx * dt, pad, W - pad), y = clamp(n.y + n.vy * dt, pad, H - pad);
      far = Math.max(far, Math.abs(x - n.x) + Math.abs(y - n.y));
      n.x = x;
      n.y = y;
    }
    this.speed = far / dt;
    return !!held || far > 0.003;
  }

  // 계산한 자리를 붙어 있는 창들의 점(.gn)과 선(.gl)에 옮겨 적는다. 크기는 먼저 한꺼번에 읽는다
  place(moved: boolean) {
    const views = [...this.views];
    const sizes = views.map((v) => [v.el.clientWidth, v.el.clientHeight]);
    views.forEach((v, k) => {
      const [w, h] = sizes[k];
      if (!w || !h || (!moved && v.m && w === v.w && h === v.h)) return;
      v.w = w;
      v.h = h;
      const m = (v.m = v.map(w, h));
      const nodes = v.el.querySelectorAll<HTMLElement>("[data-gn]");
      const lines = v.el.querySelectorAll<SVGLineElement>("[data-gl]");
      nodes.forEach((el) => {
        const n = this.sim[Number(el.dataset.gn)];
        if (n) el.style.transform = `translate(${(m.ox + n.x * m.kx).toFixed(2)}px,${(m.oy + n.y * m.ky).toFixed(2)}px)`;
      });
      lines.forEach((el) => {
        const l = this.links[Number(el.dataset.gl)];
        if (!l) return;
        el.setAttribute("x1", (m.ox + l.a.x * m.kx).toFixed(2));
        el.setAttribute("y1", (m.oy + l.a.y * m.ky).toFixed(2));
        el.setAttribute("x2", (m.ox + l.b.x * m.kx).toFixed(2));
        el.setAttribute("y2", (m.oy + l.b.y * m.ky).toFixed(2));
      });
    });
  }

  // ── 끌기 ──
  grab(i: number, e: PointerEvent, viewEl: HTMLElement, nodeEl: Element) {
    if (e.button) return;
    const view = [...this.views].find((v) => v.el === viewEl);
    if (!view?.m) return;
    const n = this.sim[i], r = viewEl.getBoundingClientRect(), m = view.m;
    // 잡은 자리와 점 중심의 차이를 기억해 두어, 잡는 순간 점이 튀지 않게 한다
    this.held = { i, view, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, dx: n.x - (e.clientX - r.left - m.ox) / m.kx, dy: n.y - (e.clientY - r.top - m.oy) / m.ky };
    nodeEl.setPointerCapture?.(e.pointerId);
  }

  move(e: PointerEvent) {
    const h = this.held;
    if (!h || e.pointerId !== h.pid || !h.view.m) return;
    if (!h.moved) {
      if (Math.abs(e.clientX - h.sx) + Math.abs(e.clientY - h.sy) < 4) return;
      h.moved = true;
      // 끄는 동안의 커서(grabbing)는 CSS가 이 표시를 보고 바꾼다
      h.view.el.dataset.dragging = "";
      this.onDragChange?.(h.i);
    }
    const { W, H, pad } = this.opts, r = h.view.el.getBoundingClientRect(), m = h.view.m, n = this.sim[h.i];
    n.x = clamp((e.clientX - r.left - m.ox) / m.kx + h.dx, pad, W - pad);
    n.y = clamp((e.clientY - r.top - m.oy) / m.ky + h.dy, pad, H - pad);
    this.run();
  }

  release(e?: PointerEvent) {
    const h = this.held;
    if (!h || (e && e.pointerId !== h.pid)) return false;
    this.held = null;
    if (!h.moved) return false;
    delete h.view.el.dataset.dragging;
    // 놓은 자리가 새 제자리가 된다. 이 점에 걸린 선의 길이도 거기에 맞춘다
    const n = this.sim[h.i];
    n.hx = n.x;
    n.hy = n.y;
    for (const l of this.links) if (l.a === n || l.b === n) l.len = Math.hypot(l.b.hx - l.a.hx, l.b.hy - l.a.hy);
    this.dropped = true;
    setTimeout(() => (this.dropped = false), 0);
    this.onDragChange?.(null);
    return true;
  }

  get dragging() {
    return !!this.held?.moved;
  }

  get holding() {
    return !!this.held;
  }
}

// 작은 창: 계산 좌표를 창 크기에 그대로 늘린다
export const fitMap = (W: number, H: number): ViewMap => (w, h) => ({ kx: w / W, ky: h / H, ox: 0, oy: 0 });

// 크게 본 창: 오른쪽에 이름표가 들어갈 자리를 남긴다(MainV2의 place)
export const largeMap = (W: number, H: number, pad: number): ViewMap => (w, h) => {
  const kx = Math.max(60, w - 208) / (W - 2 * pad), ky = Math.max(60, h - 56) / (H - 2 * pad);
  return { kx, ky, ox: 28 - pad * kx, oy: 28 - pad * ky };
};
