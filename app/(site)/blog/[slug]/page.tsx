import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TYPE_LABEL } from "@/lib/content/format";
import "katex/dist/katex.min.css";
import { findPost, formatDate, posts } from "@/lib/content/posts";
import { renderPost } from "@/lib/content/markdown";
import { connected, linkGraph, prevNext } from "@/lib/content/graph";
import { ConnectedFold, ConnectedSide } from "@/components/graph/Connected";
import { Backlinks, PrevNext } from "@/components/post/Below";
import Comments from "@/components/post/Comments";
import PostBody from "@/components/post/PostBody";
import { FoldToc, SideToc } from "@/components/post/Toc";
import prose from "@/components/post/prose.module.css";
import styles from "./post.module.css";

// 글 페이지는 빌드 때 모두 만든다. 없는 주소는 404
export const dynamicParams = false;

// 정적 내보내기는 만들 페이지가 하나도 없으면 빌드를 멈춘다. 공개 글이 없을 때는 이 주소 하나를 만들고 404로 둔다
const EMPTY = "_none";

export function generateStaticParams() {
  const list = posts().map((p) => ({ slug: p.slug }));
  return list.length ? list : [{ slug: EMPTY }];
}

// 주소의 한글이 %로 바뀌어 들어와도 같은 글을 찾는다. 풀어서 맞추면 %가 든 주소에서 깨지므로, 글 주소를 같은 방식으로 바꿔 견준다
const lookup = (raw: string) => findPost(raw) ?? posts().find((p) => encodeURIComponent(p.slug) === raw);

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const post = lookup((await params).slug);
  return post ? { title: post.title, description: post.summary || undefined } : {};
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const post = lookup((await params).slug);
  if (!post) notFound();
  const { html, toc } = await renderPost(post);
  const graph = connected(post.slug);
  const backlinks = linkGraph().backlinks.get(post.slug) ?? [];
  const { prev, next } = prevNext(post.slug);

  const cut = post.title.indexOf(": ");
  // 태그 칩을 누르면 그 종류나 태그로 걸러진 글 목록으로 간다
  const chips = [
    ...(TYPE_LABEL[post.type] ? [{ label: TYPE_LABEL[post.type], href: `/blog/?type=${post.type}` }] : []),
    ...post.tags.map((t) => ({ label: t, href: `/blog/?tag=${encodeURIComponent(t)}` })),
  ];

  return (
    <>
      <div className={styles.head}>
        <Link className={`mono lk ${styles.back}`} href="/blog/">
          ← Blog
        </Link>
        <h1 className={styles.title}>
          {cut > 0 ? (
            <>
              <span className={styles.line}>{post.title.slice(0, cut + 1)}</span>{" "}
              <span className={styles.line}>{post.title.slice(cut + 2)}</span>
            </>
          ) : (
            post.title
          )}
        </h1>
        <div className={styles.meta}>
          <time className={styles.date} dateTime={post.date}>
            {formatDate(post.date)}
          </time>
          <div className={styles.tags}>
            {chips.map((c) => (
              <Link key={c.href} className={styles.tagLink} href={c.href}>
                <span className={styles.tag}>{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        {/* 왼쪽 단: 이 글과 직접 이어진 글(FIG. 01) */}
        <aside className={styles.left}>
          <ConnectedSide data={graph} />
        </aside>
        <main className={styles.main}>
          <FoldToc items={toc} className={styles.fold} />
          <ConnectedFold data={graph} className={styles.connFold} />
          <div className={styles.label}>
            <span className="mono">/Article</span>
          </div>
          <PostBody html={html} className={`${prose.prose} ${styles.article}`} />
          <Backlinks items={backlinks} />
          <PrevNext prev={prev} next={next} />
          <Comments slug={post.slug} />
        </main>
        <aside className={styles.side}>
          <SideToc items={toc} />
        </aside>
      </div>
    </>
  );
}
