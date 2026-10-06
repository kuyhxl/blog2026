import Link from "next/link";
import { TYPE_LABEL, chipsOf } from "@/lib/content/format";
import { posts } from "@/lib/content/posts";
import { csMapData } from "@/lib/csmap/data";
import { site } from "@/lib/site";
import MapPreview from "@/components/csmap/MapPreview";
import PostRow from "@/components/posts/PostRow";
import s from "./home.module.css";

const LATEST = 5;

// 홈: 자기소개, 최신 글 다섯 개, Beauty of CS 입구. 원본은 HomeV2(데스크톱)와 HomeV2M(모바일)
export default function HomePage() {
  const list = posts();
  // 최신 글은 TIL을 빼고 고른다. TIL은 글 목록에서 본다(CLAUDE.md "화면")
  const latest = list.filter((p) => p.type !== "til").slice(0, LATEST);
  // Beauty of CS 입구의 (글 있는 개념 수/전체 개념 수)
  const map = csMapData();
  const cs = { posted: Object.keys(map.posts).length, nodes: Object.keys(map.nodes).length };
  const openMap = (cls: string) => (
    <Link className={`fill ${cls}`} href="/cs/">
      <span>Beauty of CS 열기</span>
      <span className={s.arrow} aria-hidden="true">
        →
      </span>
    </Link>
  );
  const allPosts = (cls: string) => (
    <Link className={`mono solid ${cls}`} href="/blog/">
      <span>All posts ({list.length})</span>
      <span aria-hidden="true">→</span>
    </Link>
  );

  return (
    <main>
      <div className={s.head}>
        <h1 className={s.name}>{site.name}</h1>
        <p className={s.intro}>{site.intro}</p>
      </div>

      <div className={s.grid}>
        <aside className={s.latestSide}>
          <div className={s.boxHead}>
            <span className="mono">/Latest</span>
            <span className={`mono ${s.dim}`}>({latest.length})</span>
          </div>
          {allPosts(s.allSide)}
        </aside>

        <section className={s.latest} aria-label="최신 글">
          {/* 데스크톱은 목록 머리, 모바일은 /Latest 머리 */}
          <div className={s.listHead}>
            <span className={s.pad} />
            <span className={`mono ${s.colDate}`}>/Date</span>
            <span className={`mono ${s.colName}`}>/Name</span>
            <span className={s.fill} />
            <span className={`mono ${s.dim}`}>
              {latest.length} / {list.length}
            </span>
          </div>
          <div className={s.mobileHead}>
            <span className="mono">/Latest</span>
            <span className={`mono ${s.dim}`}>
              {latest.length} / {list.length}
            </span>
          </div>
          {latest.map((p) => (
            <PostRow key={p.slug} post={{ slug: p.slug, title: p.title, date: p.date, summary: p.summary, chips: chipsOf(p), kind: TYPE_LABEL[p.type] }} />
          ))}
          {!latest.length && <p className={s.empty}>아직 공개된 글이 없습니다.</p>}
          {allPosts(s.allBelow)}
        </section>

        <section className={s.csSide} aria-label="Beauty of CS">
          <div className={s.boxHead}>
            <span className="mono">/Beauty of CS</span>
            <span className={`mono ${s.dim}`}>
              ({cs.posted}/{cs.nodes})
            </span>
          </div>
          <p className={s.csText}>컴퓨터 구조, 자료구조, 운영체제, 네트워크, 데이터베이스의 개념을 선수 지식 순서로 이은 지도입니다. 검은 네모가 붙은 개념에는 글이 있습니다.</p>
          {openMap(s.csOpen)}
        </section>
        {/* 지도의 왼쪽 위를 그린 미리 보기. 좁은 화면에서는 설명과 열기 버튼 사이에 온다 */}
        <div className={s.csPreview}>
          <MapPreview data={map} />
          {openMap(s.csOpenBelow)}
        </div>
      </div>
    </main>
  );
}
