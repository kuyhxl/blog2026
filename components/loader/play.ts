// 로딩 층의 재생. 원본은 design/handoff/screens/LoaderV2.dc.html의 Component(검토용 값과 캔버스 편집 분기는 옮기지 않았다).
// 이 함수는 toString()으로 문자열이 되어 층 안의 <script>로 HTML에 들어간다(Loader.tsx). 그래서 바깥의 값이나 import를 쓰지 않고,
// 필요한 것은 모두 인자로 받는다.
// - 층은 CSS 기본값으로 숨어 있다. 동작 줄이기가 켜져 있거나 이 세션에서 이미 보았으면 아무것도 켜지 않는다
// - 보여 줄 때만 <html>에 켜짐 클래스를 붙인다. 이 클래스 하나가 층을 보이게 하고 뒤 화면의 스크롤을 잠근다. 걷히면 뗀다
// - React와 상관없이 HTML을 읽는 자리에서 바로 돈다. 번들이 늦거나 실패해도 정해진 길이가 지나면 걷힌다
// - 오류가 나면 그 자리에서 층을 걷는다
import type { TIME } from "./data";

export type LoaderConfig = {
  time: typeof TIME;
  spots: number;
  coneFrames: number;
  growFrames: number;
  cap: number;
  slack: number;
  afterUp: number;
  heldMax: number;
  key: string;
  small: string[][]; // 프레임 0~3의 격자(SEED, BUD, CONE_S, CONE)
  smallX: number;
  plant: string[]; // 프레임 4에서 화분에 얹히는 솔방울(CONE의 위쪽)
  trees: { plant: [number, number]; grid: string[]; order: string[] }[];
  cls: {
    on: string; // <html>에 붙는 켜짐 클래스
    tree: string;
    frames: string[]; // 프레임 0~8에서 svg에 붙는 클래스
    small: string[]; // 프레임 0~3의 칸
    plant: string; // 프레임 4의 솔방울 칸
    order: Record<string, string>; // 분재의 칸이 나타나는 순서 1~5
    ink: Record<string, string>; // 격자의 글자 → 색
  };
};

export function playLoader(c: LoaderConfig) {
  const root = document.documentElement;
  const script = document.currentScript;
  const cover = script && script.parentElement;
  if (!cover) return;

  // 처음부터 보여 주지 않는다: 운영체제의 "동작 줄이기", 이 세션에서 이미 보았을 때.
  // 저장소를 못 쓰는 곳에서는 기억할 수 없으므로 문서를 열 때마다 보여 준다
  let seen = false;
  try {
    seen = window.sessionStorage.getItem(c.key) === "1";
  } catch {
    // 저장소를 못 쓰면 넘어간다
  }
  if (seen || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    cover.textContent = "";
    return;
  }

  const T = c.time;
  const ac = new AbortController();
  // phase: play(재생) | lift(걷히는 중) | held(다 걷혔지만 아직 누르고 있어서 받는 층만 남음) | done(걷힘)
  let phase = "play";
  let raf = 0, upT = 0, heldT = 0;
  let held = false; // 누르고 있는가
  let clock = 0; // 재생을 시작한 뒤 흐른 시간(ms)
  let last = 0; // 마지막으로 시계를 맞춘 때(performance.now())
  let sig = ""; // 지금 보이는 장면. 바뀔 때만 화면을 고친다
  const shown: number[] = [];

  // i번째 자리(0이 왼쪽)가 솔방울로 바뀌기 시작하는 때, 자라기 시작하는 때
  const coneAt = (i: number) => T.seedHold + i * T.stagger;
  const conesDone = coneAt(c.spots - 1) + c.coneFrames * T.coneFrame;
  const growAt = (i: number) => conesDone + T.between + i * T.stagger;
  const grown = growAt(c.spots - 1) + c.growFrames * T.growFrame;
  const full = c.coneFrames + c.growFrames; // 다 자란 프레임(8)
  let cut = grown + T.endHold; // 걷히기 시작하는 때. 건너뛰면 그 순간으로 당겨진다
  // t(ms)에 i번째 자리가 보여 주는 프레임(0~8)
  const frameAt = (i: number, t: number) => {
    if (t < coneAt(i)) return 0;
    if (t < growAt(i)) return Math.min(c.coneFrames, 1 + Math.floor((t - coneAt(i)) / T.coneFrame));
    return Math.min(full, c.coneFrames + 1 + Math.floor((t - growAt(i)) / T.growFrame));
  };

  // 층을 없앤다: 켜짐 클래스(층과 스크롤 잠금)를 떼고, 듣던 것을 모두 풀고, 그림을 비운다
  const close = () => {
    if (phase === "done") return;
    phase = "done";
    cancelAnimationFrame(raf);
    window.clearTimeout(upT);
    window.clearTimeout(heldT);
    ac.abort();
    root.classList.remove(c.cls.on);
    cover.textContent = "";
  };

  try {
    const veil = cover.firstElementChild as HTMLElement;
    const svgs = cover.querySelectorAll("svg");

    // 격자 → 칸. 가로로 붙은 같은 색·같은 순서의 칸은 사각형 하나로 그린다(그림은 같다)
    const rects = (rows: string[], x0: number, y0: number, tag: (x: number, y: number) => string) => {
      let out = "";
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; ) {
          const ch = row[x];
          if (ch === ".") {
            x++;
            continue;
          }
          const k = tag(x, y);
          let w = 1;
          while (x + w < row.length && row[x + w] === ch && tag(x + w, y) === k) w++;
          out += '<rect class="' + k + " " + c.cls.ink[ch] + '" x="' + (x0 + x) + '" y="' + (y0 + y) + '" width="' + w + '" height="1"/>';
          x += w;
        }
      });
      return out;
    };
    // 한 자리의 svg에 모든 프레임의 칸이 들어 있고, svg의 클래스가 어느 칸을 보일지 고른다.
    // 그리는 순서: 솔씨에서 솔방울까지(32칸 자리의 바닥선 위), 화분 위의 솔방울, 분재(이끼 칸이 솔방울 위에 덮인다)
    c.trees.forEach((t, i) => {
      let html = "";
      c.small.forEach((rows, f) => {
        html += rects(rows, c.smallX, 32 - rows.length, () => c.cls.small[f]);
      });
      html += rects(c.plant, t.plant[0], t.plant[1], () => c.cls.plant);
      html += rects(t.grid, 0, 0, (x, y) => c.cls.order[t.order[y][x]]);
      svgs[i].innerHTML = html;
      shown[i] = 0;
    });

    // 건너뛰기: 지금 모습 그대로 바로 걷히기 시작한다
    const skip = () => {
      if (phase === "play" && clock < cut) cut = clock;
    };
    // 손을 뗐다. 다 걷힌 뒤라면 받는 층도 없앤다
    const letGo = () => {
      window.clearTimeout(upT);
      window.clearTimeout(heldT);
      if (!held) return;
      held = false;
      if (phase === "held") close();
    };
    // 다 걷혔다. 끝까지 보았을 때와 건너뛰었을 때 모두 "보았다"고 적어 둔다
    const finish = () => {
      try {
        window.sessionStorage.setItem(c.key, "1");
      } catch {
        // 저장소를 못 쓰면 넘어간다
      }
      if (held) {
        // 아직 누르고 있다: 그림은 치우고 받는 층만 남겨, 손을 떼기를 기다린다
        phase = "held";
        veil.remove();
        heldT = window.setTimeout(letGo, c.heldMax);
        return;
      }
      close();
    };

    const tick = () => {
      raf = 0;
      try {
        // 시계는 화면이 그려질 때마다 흐른 만큼만 간다. 한 번에 cap보다 많이 가지 않으므로,
        // 화면이 잠깐 멈췄다 돌아와도 프레임을 건너뛰지 않는다(그만큼 늦게 끝난다)
        const now = performance.now();
        clock += Math.min(now - last, c.cap);
        last = now;
        const t = clock;
        if (t >= cut + T.lift) return finish();
        const at = Math.min(t, cut);
        const lifting = t >= cut;
        // 걷힐 때: 아래쪽부터 화면 높이의 1/liftSteps씩, lift/liftSteps마다 한 계단
        const step = lifting ? Math.min(T.liftSteps - 1, Math.floor((t - cut) / (T.lift / T.liftSteps))) : 0;
        const f: number[] = [];
        for (let i = 0; i < c.spots; i++) f.push(frameAt(i, at + c.slack));
        const scene = f.join("") + (lifting ? "L" : "P") + step;
        if (scene !== sig) {
          sig = scene;
          phase = lifting ? "lift" : "play";
          f.forEach((n, i) => {
            if (shown[i] === n) return;
            shown[i] = n;
            svgs[i].setAttribute("class", c.cls.tree + " " + c.cls.frames[n]);
          });
          veil.style.clipPath = lifting && step > 0 ? "inset(0 0 " + ((step * 100) / T.liftSteps).toFixed(4) + "% 0)" : "";
        }
        raf = requestAnimationFrame(tick);
      } catch {
        close();
      }
    };

    // 누르면 건너뛴다. 누르고 있는 동안에는(held) 다 걷혀도 받는 층을 남겨 둔다:
    // 손을 뗄 때 생기는 click이 뒤 화면의 링크나 단추로 가지 않게 하려는 것이다
    const opts = { signal: ac.signal };
    cover.addEventListener(
      "pointerdown",
      (e) => {
        held = true;
        window.clearTimeout(upT);
        // 층 밖에서 손을 떼어도 이 층이 알 수 있게 한다. 못 잡아도 괜찮다: heldMax가 지나면 놓는다
        try {
          cover.setPointerCapture(e.pointerId);
        } catch {
          // 넘어간다
        }
        skip();
      },
      opts,
    );
    const onUp = () => {
      window.clearTimeout(upT);
      upT = window.setTimeout(letGo, c.afterUp);
    };
    cover.addEventListener("pointerup", onUp, opts);
    cover.addEventListener("pointercancel", onUp, opts);
    cover.addEventListener("lostpointercapture", onUp, opts);
    cover.addEventListener("click", letGo, opts);
    // 아무 키나 건너뛴다. 키는 window에서 가장 먼저 받아 뒤 화면(헤더 단축키, ⌘K)으로 넘기지 않는다.
    // Tab과 조합 키는 브라우저가 제 할 일을 하게 두고, 나머지는 기본 동작(스크롤 등)도 막는다
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) e.preventDefault();
        e.stopImmediatePropagation();
        skip();
      },
      { capture: true, signal: ac.signal },
    );

    root.classList.add(c.cls.on);
    sig = "0000P0";
    last = performance.now();
    raf = requestAnimationFrame(tick);
  } catch {
    close();
  }
}
