import SiteFooter from "@/components/SiteFooter";
import Pine from "@/components/pine/Pine";

// 푸터가 붙는 화면 묶음: 홈, 글 목록, 글 본문
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Pine place="page" />
      {children}
      <SiteFooter />
    </>
  );
}
