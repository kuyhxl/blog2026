// 테마: <html>에 dark 클래스가 있으면 다크.
// 버튼으로 고른 값은 localStorage에 "light" | "dark"로 남는다. 고른 적이 없으면 운영체제 설정을 따른다
export const THEME_KEY = "theme";

// <head>에서 화면을 그리기 전에 실행해, 새로고침할 때 다른 테마가 잠깐 보이지 않게 한다
export const themeScript = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")})()`;
