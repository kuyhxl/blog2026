import { site } from "@/lib/site";
import styles from "./SiteFooter.module.css";

// 홈·글 목록·글 본문의 푸터. Beauty of CS 화면에는 없다
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span className={styles.copy}>
        <span className="mono">© 2026</span>
        <span className={styles.name}>{site.name}</span>
      </span>
      <nav className={styles.links} aria-label="바깥 링크">
        <a className="mono lk" href={site.github}>GitHub ↗</a>
        <a className="mono lk" href={site.feed}>RSS</a>
        <a className="mono lk" href={`mailto:${site.email}`}>Email</a>
      </nav>
    </footer>
  );
}
