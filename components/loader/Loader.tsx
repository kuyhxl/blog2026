"use client";

import { loaderHtml } from "./html";
import s from "./Loader.module.css";

// 로딩 화면: 세션에서 처음 들어올 때 화면을 덮었다가 걷히는 층(CLAUDE.md "디자인 메모"). 원본은 design/handoff/screens/LoaderV2.dc.html
// - 사이트 내용은 이 층 뒤에서 이미 그려져 있다. 층은 그 위를 덮었다가 걷히기만 한다
// - <body> 맨 앞에 둔다. 층 안의 스크립트가 사이트 내용보다 먼저 돌아, 보여 줄지를 화면을 그리기 전에 정한다(play.ts)
// - 층 바탕과 자리는 HTML에 있고, 그림 칸은 보여 줄 때만 스크립트가 채운다. 보여 주지 않는 페이지에 칸 수백 개를 싣지 않는다
// - 층에는 글자가 없다(화면 낭독기용 이름만 있다). 검색 엔진이 읽는 제목과 본문은 그대로다
// 안쪽 HTML은 서버에서 만들 때만 넣는다. 브라우저는 받은 HTML을 그대로 쓰고(React는 하이드레이션 때 안쪽을 비교하지도 바꾸지도 않는다),
// 스크립트가 안을 바꾸고 비워도 부딪히지 않는다. 그래서 격자와 재생 코드는 자바스크립트 번들과 RSC 페이로드에 실리지 않는다
export default function Loader() {
  return (
    <div
      className={s.cover}
      role="img"
      aria-label="시작 화면. 소나무 분재 네 그루가 자랍니다. 화면을 누르거나 아무 키나 누르면 건너뜁니다"
      // 서버와 브라우저의 안쪽 HTML이 다르고, 스크립트가 안을 바꾸므로 경고하지 않는다
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: typeof window === "undefined" ? loaderHtml() : "" }}
    />
  );
}
