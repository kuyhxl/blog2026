import { PINE } from "./data";
import s from "./Pine.module.css";

// 픽셀 아트 소나무. 색을 변수로 준 사각형이라 다크에서는 밤의 색(--pine-*, --bark-*)으로 바뀐다.
// page: 홈·글 목록·글 본문의 헤더 아래 오른쪽 끝, bar: Beauty of CS 제목 줄 오른쪽 끝
export default function Pine({ place }: { place: "page" | "bar" }) {
  return (
    <svg className={s[place]} viewBox="0 0 64 48" shapeRendering="crispEdges" aria-hidden="true">
      {PINE.map(([cls, rects]) => (
        <g key={cls} className={s[cls]}>
          {rects.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} />
          ))}
        </g>
      ))}
    </svg>
  );
}
