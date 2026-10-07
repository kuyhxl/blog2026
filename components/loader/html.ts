import * as D from "./data";
import { playLoader, type LoaderConfig } from "./play";
import s from "./Loader.module.css";

// 로딩 층 안쪽의 HTML: 바탕(.veil), 네 자리, 바닥선, 그리고 재생 스크립트(play.ts). 서버에서 HTML을 만들 때만 부른다(Loader.tsx)

// 프레임 0~8에서 svg에 붙는 클래스
const FRAMES = ["s0", "s1", "s2", "s3", "sp b1", "b1 b2", "b1 b2 b3", "b1 b2 b3 b4", "b1 b2 b3 b4 b5"];

const cls = (names: string) =>
  names
    .split(" ")
    .map((n) => {
      if (!s[n]) throw new Error(`Loader.module.css에 .${n}이 없습니다`);
      return s[n];
    })
    .join(" ");

export function loaderHtml() {
  const config: LoaderConfig = {
    time: D.TIME,
    spots: D.SPOTS,
    coneFrames: D.CONE_FRAMES,
    growFrames: D.GROW_FRAMES,
    cap: D.FRAME_CAP,
    slack: D.SLACK,
    afterUp: D.HELD_AFTER_UP,
    heldMax: D.HELD_MAX,
    key: D.SEEN_KEY,
    small: [D.SEED, D.BUD, D.CONE_S, D.CONE],
    smallX: D.SMALL_X,
    plant: D.CONE.slice(0, D.CONE_TOP),
    trees: D.TREES.map(({ plant, grid, order }) => ({ plant, grid, order })),
    cls: {
      on: cls("on"),
      tree: cls("tree"),
      frames: FRAMES.map(cls),
      small: ["q0", "q1", "q2", "q3"].map(cls),
      plant: cls("qp"),
      order: { 1: cls("o1"), 2: cls("o2"), 3: cls("o3"), 4: cls("o4"), 5: cls("o5") },
      ink: { 1: cls("p1"), 2: cls("p2"), 3: cls("p3"), a: cls("k1"), b: cls("k2") },
    },
  };
  const tree = `<svg class="${cls("tree s0")}" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true"></svg>`;
  const shell = `<div class="${cls("veil")}"><div class="${cls("group")}"><div class="${cls("spots")}">${tree.repeat(D.SPOTS)}</div><div class="${cls("shelf")}" aria-hidden="true"></div></div></div>`;
  // JSON의 <는 <로 적어, 값이 무엇이든 <script>를 닫지 못하게 한다
  const script = `(${playLoader.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")})`;
  if (/<\/script|<!--/i.test(script)) throw new Error("로딩 화면 스크립트에 </script 또는 <!--가 있습니다");
  return `${shell}<script>${script}</script>`;
}
