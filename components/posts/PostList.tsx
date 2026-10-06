"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { TYPE_LABEL } from "@/lib/content/format";
import type { Graph } from "@/lib/content/graph";
import { BrainMapFold, BrainMapSide, useBrainMap, type Pointed } from "@/components/graph/BrainMap";
import PostRow, { type RowPost } from "./PostRow";
import s from "./PostList.module.css";

export type ListPost = RowPost & { type: string; tags: string[] };

type Sort = "date" | "name";
type State = { types: Set<string>; tags: Set<string>; sort: Sort; dir: "asc" | "desc" };

// 필터와 정렬은 주소에 남는다: /blog/?type=cs&tag=MySQL&sort=name. 기본값은 적지 않는다
const defaultDir = (sort: Sort) => (sort === "date" ? "desc" : "asc");

function parse(query: string): State {
  const q = new URLSearchParams(query);
  const sort: Sort = q.get("sort") === "name" ? "name" : "date";
  const dir = q.get("dir");
  return { types: new Set(q.getAll("type")), tags: new Set(q.getAll("tag")), sort, dir: dir === "asc" || dir === "desc" ? dir : defaultDir(sort) };
}

function stringify(st: State) {
  const q = new URLSearchParams();
  for (const t of st.types) q.append("type", t);
  for (const t of st.tags) q.append("tag", t);
  if (st.sort !== "date") q.set("sort", st.sort);
  if (st.dir !== defaultDir(st.sort)) q.set("dir", st.dir);
  return q.toString();
}

const toggled = (set: Set<string>, v: string) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

// 주소의 검색어를 읽는 쪽. 빌드 때는 검색어를 모르므로 Suspense의 대체 화면(검색어 없는 목록)이 HTML에 들어간다
export function PostListFromUrl({ posts, graph }: { posts: ListPost[]; graph: Graph }) {
  return <PostList posts={posts} graph={graph} query={useSearchParams().toString()} />;
}

export function PostList({ posts, graph, query }: { posts: ListPost[]; graph: Graph; query: string }) {
  const st = parse(query);
  const brain = useBrainMap(graph);
  // 펼친 행(펼친 순서대로)과 가리킨 점이나 행. 브레인 맵은 가리킨 것을, 없으면 마지막으로 펼친 행의 글을 보여 준다
  const [open, setOpen] = useState<string[]>([]);
  const [pointed, setPointed] = useState<Pointed>(null);
  const indexOf = new Map(graph.nodes.map((n, i) => [n.slug, i]));
  // 필터나 정렬이 바뀔 때마다 목록이 한 번 옅게 다시 나타난다(MainV2의 .rows.a / .rows.b)
  const [rev, setRev] = useState(0);
  const update = (next: State) => {
    const qs = stringify(next);
    window.history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
    setRev((r) => r + 1);
  };

  // 묶음 안에서는 하나라도 맞으면(OR), 묶음 사이에서는 둘 다 맞아야(AND) 보인다
  const match = (p: ListPost) => (!st.types.size || st.types.has(p.type)) && (!st.tags.size || p.tags.some((t) => st.tags.has(t)));
  const visible = posts.filter(match);
  const sorted = visible.slice().sort((a, b) => {
    const c = st.sort === "date" ? a.date.localeCompare(b.date) || b.title.localeCompare(a.title, "ko") : a.title.localeCompare(b.title, "ko");
    return st.dir === "asc" ? c : -c;
  });
  const filtered = st.types.size + st.tags.size > 0;
  const visibleSet = new Set(visible.map((p) => p.slug));
  const lastOpen = [...open].reverse().find((slug) => visibleSet.has(slug));
  const active = pointed?.i ?? (lastOpen ? (indexOf.get(lastOpen) ?? null) : null);
  const mapProps = { map: brain, visible: visibleSet, filtered, active, pointed, onPoint: setPointed };

  // 글 종류(/Type): 시안에는 /Filters 안의 묶음이었지만 TIL을 글 목록에 합치면서 /Filters 위의 따로 된 칸으로 옮겼다.
  // 아무것도 고르지 않은 상태가 "전체"다. "전체"를 누르면 종류 선택을 비우고, 세 종류를 다 고르면 "전체"로 돌아간다
  const kinds = Object.keys(TYPE_LABEL);
  const pickType = (k: string) => {
    const next = toggled(st.types, k);
    update({ ...st, types: next.size === kinds.length ? new Set() : next });
  };
  const typeItems = [
    { key: "all", name: "전체", count: posts.length, on: !st.types.size, toggle: () => update({ ...st, types: new Set() }) },
    ...kinds.map((k) => ({ key: k, name: TYPE_LABEL[k], count: posts.filter((p) => p.type === k).length, on: st.types.has(k), toggle: () => pickType(k) })),
  ];
  // /Filters의 항목: 태그를 공개 글에 나온 것을 많이 쓴 순서로. 주소로 들어온 없는 태그도 끌 수 있게 보여 준다
  const tagCount = new Map<string, number>();
  for (const p of posts) for (const t of p.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  for (const t of st.tags) if (!tagCount.has(t)) tagCount.set(t, 0);
  const groups = [
    {
      label: "Topic",
      wide: true,
      items: [...tagCount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
        .map(([t, n]) => ({ key: t, name: t, count: n, on: st.tags.has(t), toggle: () => update({ ...st, tags: toggled(st.tags, t) }) })),
    },
  ];
  // Reset ×는 /Filters(태그)만 비운다. 종류는 "전체"로 되돌린다
  const reset = st.tags.size ? (
    <button className={`mono lk ${s.reset}`} type="button" onClick={() => update({ ...st, tags: new Set() })}>
      Reset ×
    </button>
  ) : null;
  type Item = (typeof typeItems)[number];
  const check = (f: Item) => (
    <label key={f.key} className={`${s.chk} ${f.on ? s.on : ""}`}>
      <input className={s.chkI} type="checkbox" checked={f.on} onChange={f.toggle} />
      <span className={s.chkL}>{f.name}</span>
      <span className={s.chkN}>{f.count}</span>
    </label>
  );
  const chip = (f: Item) => (
    <button key={f.key} className={s.chipBtn} type="button" aria-pressed={f.on} onClick={f.toggle}>
      <span className={`${s.chip} ${f.on ? s.on : ""}`}>
        <span>{f.name}</span>
        <span className={s.chipN}>{f.count}</span>
      </span>
    </button>
  );
  const sortBy = (sort: Sort) => () => update({ ...st, sort, dir: st.sort === sort ? (st.dir === "desc" ? "asc" : "desc") : defaultDir(sort) });
  const arrow = (sort: Sort) => (st.sort === sort ? (st.dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <>
      <div className={s.head}>
        <h1 className={s.title}>
          <span>Blog</span>
          <span className={s.count} aria-live="polite">
            ({visible.length})
          </span>
        </h1>
      </div>

      <div className={s.grid}>
        {/* 데스크톱: 왼쪽에 따라오는 필터 창과 그 아래의 브레인 맵 창(FIG. 01) */}
        <aside className={s.side}>
          <div className={s.sideHead}>
            <span className="mono">/Type</span>
          </div>
          <fieldset className={`${s.group} ${s.typeGroup}`}>
            <legend className="sr-only">글 종류</legend>
            <div className={s.cols1}>{typeItems.map(check)}</div>
          </fieldset>
          <div className={s.sideHead}>
            <span className="mono">/Filters</span>
            {reset}
          </div>
          <div className={s.groups}>
            {groups.map((g) => (
              <fieldset key={g.label} className={s.group}>
                <legend className={`mono ${s.legend}`}>{g.label}</legend>
                <div className={g.wide ? s.cols2 : s.cols1}>{g.items.map(check)}</div>
              </fieldset>
            ))}
          </div>
          <BrainMapSide {...mapProps} />
        </aside>

        {/* 좁은 화면: 묶음마다 옆으로 미는 한 줄 */}
        <section className={s.strips} aria-label="필터">
          <div className={s.stripsHead}>
            <span className="mono">/Type</span>
          </div>
          <div className={`${s.strip} ${s.typeStrip}`} role="group" aria-label="글 종류">
            <div className={s.hs}>{typeItems.map(chip)}</div>
          </div>
          <div className={s.stripsHead}>
            <span className="mono">/Filters</span>
            {reset}
          </div>
          {groups.map((g) => (
            <div key={g.label} className={s.strip} role="group" aria-label={g.label}>
              <span className={`mono ${s.stripLabel}`} aria-hidden="true">
                {g.label}
              </span>
              <div className={s.hs}>{g.items.map(chip)}</div>
            </div>
          ))}
        </section>

        <div className={s.foldMap}>
          <BrainMapFold {...mapProps} />
        </div>

        <section className={s.list} aria-label="글 목록">
          <div className={s.listHead}>
            <span className={s.pad} />
            <button className={`mono lk ${s.sortDate} ${st.sort === "date" ? s.cur : ""}`} type="button" onClick={sortBy("date")}>
              /Date{arrow("date")}
            </button>
            <button className={`mono lk ${s.sortName} ${st.sort === "name" ? s.cur : ""}`} type="button" onClick={sortBy("name")}>
              /Name{arrow("name")}
            </button>
            <span className={s.fill} />
            <span className={`mono ${s.shown}`}>{filtered ? `${visible.length} / ${posts.length}` : ""}</span>
          </div>
          <div className={rev ? (rev % 2 ? s.a : s.b) : undefined}>
            {sorted.map((p) => {
              const i = indexOf.get(p.slug) ?? -1;
              return (
                <PostRow
                  key={p.slug}
                  post={p}
                  open={open.includes(p.slug)}
                  onToggle={() => setOpen((o) => (o.includes(p.slug) ? o.filter((x) => x !== p.slug) : [...o, p.slug]))}
                  onEnter={() => setPointed({ i, via: "row" })}
                  onLeave={() => setPointed(null)}
                />
              );
            })}
          </div>
          {!posts.length ? <p className={s.empty}>아직 공개된 글이 없습니다.</p> : !sorted.length && <p className={s.empty}>고른 조건에 맞는 글이 없습니다.</p>}
        </section>
      </div>
    </>
  );
}
