import type { Metadata } from "next";
import { Suspense } from "react";
import { TYPE_LABEL, chipsOf } from "@/lib/content/format";
import { linkGraph } from "@/lib/content/graph";
import { posts } from "@/lib/content/posts";
import { PostList, PostListFromUrl, type ListPost } from "@/components/posts/PostList";

export const metadata: Metadata = { title: "Blog" };

// 글 목록. 필터와 정렬은 브라우저에서 하고, 그 상태는 주소의 검색어에 남는다
export default function BlogPage() {
  const list: ListPost[] = posts().map((p) => ({
    slug: p.slug, title: p.title, date: p.date, summary: p.summary, type: p.type, tags: p.tags, chips: chipsOf(p), kind: TYPE_LABEL[p.type],
  }));
  const { graph } = linkGraph();
  return (
    // 빌드 때는 검색어를 모르므로 거르지 않은 목록이 HTML에 들어가고, 브라우저에서 주소의 검색어대로 다시 그린다
    <main>
      <Suspense fallback={<PostList posts={list} graph={graph} query="" />}>
        <PostListFromUrl posts={list} graph={graph} />
      </Suspense>
    </main>
  );
}
