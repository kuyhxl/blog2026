import HeaderNav from "./HeaderNav";
import SearchButton from "./search/SearchButton";
import ThemeToggle from "./ThemeToggle";
import styles from "./SiteHeader.module.css";

// 모든 화면 공통 헤더. 원본은 각 화면 파일의 <header>
export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <HeaderNav />
      <div className={styles.tools}>
        <SearchButton />
        <ThemeToggle className={`ghost ${styles.theme}`} iconClassName={styles.th} />
      </div>
    </header>
  );
}
