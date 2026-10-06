// RSS 2.0 피드(/rss.xml). 빌드 때 정적 파일로 만들어진다.
// 본문이 있는 공개 글만 넣고(빈 CS 노드는 빠진다), TIL도 넣지 않는다(필요해지면 TIL 피드를 따로 만든다).
// 글마다 제목·주소·날짜·요약·종류와 태그만 담는다. 본문은 넣지 않는다
import { chipsOf } from "@/lib/content/format";
import { posts } from "@/lib/content/posts";
import { site } from "@/lib/site";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// frontmatter의 날짜(YYYY-MM-DD)를 한국 시간 자정으로 본다
function rfc822(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[day]}, ${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y} 00:00:00 +0900`;
}

export function GET() {
  const base = siteUrl();
  const list = posts().filter((p) => p.type !== "til");
  const items = list.map((p) => {
    const url = `${base}/blog/${encodeURIComponent(p.slug)}/`;
    return [
      "    <item>",
      `      <title>${esc(p.title)}</title>`,
      `      <link>${esc(url)}</link>`,
      `      <guid isPermaLink="true">${esc(url)}</guid>`,
      `      <pubDate>${rfc822(p.date)}</pubDate>`,
      p.summary ? `      <description>${esc(p.summary)}</description>` : "",
      ...chipsOf(p).map((c) => `      <category>${esc(c)}</category>`),
      "    </item>",
    ].filter(Boolean).join("\n");
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${esc(site.name)}</title>`,
    `    <link>${esc(base)}/</link>`,
    `    <description>${esc(site.intro)}</description>`,
    "    <language>ko</language>",
    // 빌드 시각 대신 가장 최근 글의 날짜를 써서, 글이 그대로면 피드도 그대로다
    list.length ? `    <lastBuildDate>${rfc822(list[0].date)}</lastBuildDate>` : "",
    `    <atom:link href="${esc(base)}/rss.xml" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].filter((l) => l !== "").join("\n");
  return new Response(xml + "\n", { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
