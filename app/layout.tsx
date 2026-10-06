import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import SearchProvider from "@/components/search/SearchProvider";
import CursorFx from "@/components/CursorFx";
import { site } from "@/lib/site";
import { siteUrl } from "@/lib/site-url";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// 글꼴은 빌드 때 Google Fonts에서 받아 사이트와 함께 배포한다. 한글 글자는 구간별 파일로 나뉘어 필요한 것만 받는다
const sans = IBM_Plex_Sans_KR({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // 빌드 때 SITE_URL이 없으면 여기서 멈춘다(lib/site-url.ts)
  metadataBase: new URL(siteUrl()),
  title: { default: site.name, template: `%s · ${site.name}` },
  // 모든 페이지의 <head>에 RSS 피드 주소를 등록한다
  alternates: { types: { "application/rss+xml": [{ url: site.feed, title: site.name }] } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // dark 클래스는 아래 스크립트가 그리기 전에 붙이므로, 서버가 만든 HTML과 달라도 경고하지 않는다
    <html lang="ko" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SearchProvider>
          <SiteHeader />
          {children}
        </SearchProvider>
        <CursorFx />
      </body>
    </html>
  );
}
