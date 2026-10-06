import { memo } from "react";
import { H, MW, hasAny, hasPost, softBreak, twoLines, type Layout, type MapData, type Paths } from "@/lib/csmap/layout";
import s from "./CsMap.module.css";

type Props = {
  data: MapData;
  L: Layout;
  paths: Paths;
  expanded: Record<string, boolean>;
  sel?: string | null;
  linked?: Set<string>;
  // 없으면 누를 수 없는 그림(홈의 미리 보기)으로 그린다
  onNode?: (id: string) => void;
  onHover?: (id: string | null) => void;
};

// 구역, 선, 상자. 원본은 BeautyOfCSV2의 지도 층(zones, svg, nodes). 보기(이동·확대)가 바뀌어도 다시 그리지 않는다
function MapLayer({ data, L, paths: p, expanded, sel = null, linked, onNode, onHover }: Props) {
  const zoneStat = (zone: string) => {
    const ids = Object.values(data.nodes).filter((n) => n.zone === zone);
    return `${ids.filter((n) => hasPost(data, n.id)).length}/${ids.length}`;
  };
  return (
    <>
      {L.zones.map((z) => (
        <div key={z.id} className={s.zone} style={{ left: z.x, top: z.y, width: z.w, height: z.h }} aria-hidden="true" />
      ))}
      <svg className={s.lines} width={MW} height={L.mh} aria-hidden="true">
        <path d={p.crossDash} className={s.crossDash} />
        <path d={p.crossSolid} className={s.crossSolid} />
        <path d={p.crossHeads} className={s.crossHeads} />
        <path d={p.tree} className={s.tree} />
        <path d={p.intra} className={s.intra} />
        <path d={p.intraHeads} className={s.intraHeads} />
        <path d={p.hotHalo} className={s.hotHalo} />
        <path d={p.hotDash} className={s.hotDash} />
        <path d={p.hotSolid} className={s.hotSolid} />
        <path d={p.hotHeads} className={s.hotHeads} />
      </svg>
      {L.zones.map((z) => (
        <div key={z.id} className={s.zoneLabel} style={{ left: z.x + 12, top: z.y - 9 }}>
          <span className="mono">[ {z.code} ]</span>
          <span className={s.zoneName}>{z.name}</span>
          <span className={s.zoneStat}>{zoneStat(z.id)}</span>
        </div>
      ))}
      {Object.values(L.rect).map((r) => {
        const n = data.nodes[r.id];
        const filled = n.big ? hasAny(data, r.id) : hasPost(data, r.id);
        const two = twoLines(n);
        const cls = [s.nd, n.big ? s.big : s.kid, filled && s.filled, r.id === sel && s.sel, r.id !== sel && linked?.has(r.id) && s.linked, two && s.two].filter(Boolean).join(" ");
        const inner = (
          <>
            <span className={s.mk} aria-hidden="true" />
            <span className={s.label}>{two ? softBreak(n.title) : n.title}</span>
            {n.big && (
              <span className={s.sign} aria-hidden="true">
                {expanded[r.id] ? "−" : "+"}
              </span>
            )}
          </>
        );
        const style = { left: r.x, top: r.y, width: r.w, height: n.big ? H : r.h };
        if (!onNode)
          return (
            <div key={r.id} className={cls} style={style}>
              {inner}
            </div>
          );
        return (
          <button
            key={r.id}
            type="button"
            className={cls}
            style={style}
            aria-expanded={n.big ? !!expanded[r.id] : undefined}
            aria-pressed={r.id === sel}
            aria-label={`${n.title}${filled ? " (글 있음)" : ""}`}
            onClick={() => onNode(r.id)}
            onPointerEnter={(e) => e.pointerType === "mouse" && onHover?.(r.id)}
            onPointerLeave={(e) => e.pointerType === "mouse" && onHover?.(null)}
          >
            {inner}
          </button>
        );
      })}
    </>
  );
}

export default memo(MapLayer);
