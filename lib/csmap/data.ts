// Beauty of CS 지도 데이터. 빌드 때 만든다.
// - 개념(과목, 부모, 순서, 이름)과 선의 원본은 data/cs-map-graph.json이다
// - CS 노트에서는 id만 읽어 그 개념에 글을 잇는다: 글이 있는지, 요약 패널의 글 제목·요약·날짜
//   (본문이 빈 CS 노트는 글이 없는 개념과 같다. json에 없는 id의 노트는 지도에 나오지 않는다)
// - 공개된 CS 노트가 없으면 json만으로 그린다(전부 빈 노드)
import fs from "node:fs";
import path from "node:path";
import { posts } from "../content/posts.ts";
import type { MapData, MapNode } from "./layout.ts";

type Graph = {
  subjects: Record<string, string>;
  nodes: { id: string; title: string; subject: string; parent: string | null }[];
  edges: { from: string; to: string; type: "prerequisite" | "related"; note?: string }[];
};

export function csMapData(): MapData {
  const graph = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/cs-map-graph.json"), "utf8")) as Graph;
  const nodes: Record<string, MapNode> = {};
  for (const n of graph.nodes) nodes[n.id] = { id: n.id, title: n.title, zone: n.subject, big: !n.parent, parent: n.parent, kids: [] };
  for (const n of graph.nodes) if (n.parent && nodes[n.parent]) nodes[n.parent].kids.push(n.id);
  const edges = graph.edges.filter((e) => nodes[e.from] && nodes[e.to]).map((e) => ({ from: e.from, to: e.to, pre: e.type === "prerequisite", note: e.note ?? "" }));
  const linkedPosts: MapData["posts"] = {};
  for (const p of posts()) if (p.type === "cs" && nodes[p.slug]) linkedPosts[p.slug] = { slug: p.slug, title: p.title, date: p.date, summary: p.summary };
  return { nodes, edges, posts: linkedPosts };
}
