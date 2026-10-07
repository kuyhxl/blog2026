// 사이트 전체에서 쓰는 이름과 바깥 링크. 헤더, 푸터, 문서 제목이 여기서 읽는다
export const site = {
  // 헤더, 홈 제목, 푸터, 문서 제목(글 제목 · 사이트 이름), RSS 채널 제목
  name: "Pine: 솔",
  // 홈의 자기소개이자 RSS 채널 설명. 우선 짧게 두었다
  intro: "황찬혁의 개발 블로그입니다. 잘 부탁드립니다.",
  github: "https://github.com/kuyhxl",
  email: "markhwang710@gmail.com",
  // RSS 피드. 빌드 때 app/rss.xml/route.ts가 만든다
  feed: "/rss.xml",
  // 댓글(giscus). 사이트 저장소와 분리한 공개 저장소의 Discussions에 모인다.
  // id 값은 gh api graphql로 조회했다(2026-10-05). 비우면 댓글 자리에 "준비 중"만 보인다
  giscus: {
    repo: "kuyhxl/blog-comments",
    repoId: "R_kgDOU8eVMA",
    category: "Announcements",
    categoryId: "DIC_kwDOU8eVMM4DHFMH",
  },
};
