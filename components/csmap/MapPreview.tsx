import Link from "next/link";
import { MW, drawEdges, layout, type MapData } from "@/lib/csmap/layout";
import MapLayer from "./MapLayer";
import s from "./MapPreview.module.css";

// 홈의 Beauty of CS 미리 보기. 원본은 HomeV2·HomeV2M의 figure.
// 지도 화면에서 큰 개념을 모두 접어 둔 모습을 같은 치수와 같은 길 내기 규칙으로 그리고, 창은 그 왼쪽 위만 보여 준다. 빌드 때 그리는 정적 그림이다
export default function MapPreview({ data }: { data: MapData }) {
  const L = layout(data.nodes, {});
  const { paths } = drawEdges(data, L, {}, new Set());
  const nodeCount = Object.keys(data.nodes).length;
  return (
    <figure className={s.fig} aria-label="Beauty of CS 지도 미리 보기">
      <div className={s.bar}>
        <span className={`mono ${s.no}`}>[ FIG. 01 ]</span>
        <span className={`mono ${s.no} ${s.dim}`}>CS map</span>
        <span className={s.stripes} aria-hidden="true" />
        <Link className={`ghost ${s.iconBtn}`} href="/cs/" aria-label="Beauty of CS 크게 보기">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
            <path d="M7 1h4v4M5 11H1V7M11 1 7 5M1 11l4-4" />
          </svg>
        </Link>
      </div>
      <Link href="/cs/" tabIndex={-1} aria-hidden="true" className={s.canvas}>
        <div className={s.layer} style={{ width: MW, height: L.mh }}>
          <MapLayer data={data} L={L} paths={paths} expanded={{}} />
        </div>
      </Link>
      <figcaption className={s.cap}>
        <span className={`mono ${s.dim}`}>
          {nodeCount} nodes · {data.edges.length} links
        </span>
        <span className={s.capNote}>지도의 왼쪽 위 일부</span>
      </figcaption>
    </figure>
  );
}
