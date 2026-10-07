"use client";

import { useRef, useState } from "react";
import { site } from "@/lib/site";
import s from "./EmailCopy.module.css";

// 바깥 링크 줄의 Email(푸터, Beauty of CS 아래 줄). 누르면 이메일 주소를 클립보드에 복사하고, 그 위에 COPY 상자가 잠깐 떴다가 사라진다.
// mailto: 링크는 메일 앱을 정해 두지 않은 컴퓨터에서 아무 반응이 없어서 복사로 바꿨다.
// - 연달아 누르면 상자가 처음부터 다시 뜬다
// - 복사하지 못하면 상자에 주소를 대신 보여 준다
// - 화면 낭독기에는 복사했다고 읽어 준다
export default function EmailCopy() {
  const btn = useRef<HTMLButtonElement>(null);
  const [n, setN] = useState(0); // 누른 횟수. 상자의 key로 써서 누를 때마다 처음부터 다시 띄운다
  const [box, setBox] = useState<"copied" | "failed" | null>(null);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(site.email);
      ok = true;
    } catch {
      // https가 아니거나 권한이 없으면 클립보드 API가 없다. 예전 방식으로 한 번 더 해 본다
      ok = copyByCommand(site.email);
      btn.current?.focus();
    }
    setN((x) => x + 1);
    setBox(ok ? "copied" : "failed");
  };

  return (
    <span className={s.wrap}>
      <button ref={btn} type="button" className="mono lk" onClick={copy}>
        Email
      </button>
      {box && (
        <span
          key={n}
          className={box === "copied" ? `mono ${s.box}` : `${s.box} ${s.long}`}
          aria-hidden="true"
          onAnimationEnd={(e) => {
            if (e.animationName.endsWith("out")) setBox(null);
          }}
        >
          {box === "copied" ? "Copy" : site.email}
        </span>
      )}
      <span className="sr-only" role="status">
        {box === "copied" ? "이메일 주소를 복사했습니다" : box === "failed" ? `복사하지 못했습니다. 주소는 ${site.email}입니다` : ""}
      </span>
    </span>
  );
}

// 클립보드 API를 쓸 수 없을 때: 보이지 않는 입력칸에 주소를 넣고 골라서 복사한다
function copyByCommand(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    // 못 하면 상자에 주소를 보여 준다
  }
  ta.remove();
  return ok;
}
