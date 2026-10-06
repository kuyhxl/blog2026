import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import Pine from "@/components/pine/Pine";
import s from "./not-found.module.css";

export const metadata: Metadata = { title: "페이지를 찾을 수 없습니다" };

// 404. 시안에는 없는 화면이라 글 목록의 제목 줄과 같은 말투로 짧게 만들었다
export default function NotFound() {
  return (
    <div className={s.page}>
      <Pine place="page" />
      <main className={s.main}>
        <p className={`mono ${s.code}`}>/404</p>
        <h1 className={s.title}>페이지를 찾을 수 없습니다</h1>
        <p className={s.text}>주소가 바뀌었거나 없는 글입니다. 글 목록이나 검색(⌘K)에서 찾아보세요.</p>
        <div className={s.links}>
          <Link className={`mono solid ${s.btn}`} href="/">
            <span>Home</span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link className={`mono solid ${s.btn}`} href="/blog/">
            <span>All posts</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
