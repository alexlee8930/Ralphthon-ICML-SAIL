# 10 · 디자인 토큰·전역 CSS

의존: 01-foundation

산출 파일:

- `src/index.css`

---

전역 스타일 전문. **색·치수·폰트는 여기 정의된 CSS 변수와
tailwind.config.js 의 시맨틱 토큰(surface, accent, ok, warn, muted, faint,
border …)으로만 쓴다** — 컴포넌트에서 hex 하드코딩 금지.

렌더링을 좌우하는 규칙:
- 라이트("paper tone")가 기본, 다크 전환은 `<html data-theme="dark">` 속성
  (ThemeProvider가 토글, tailwind darkMode도 이 selector — `.dark` 클래스가 아님).
- 폰트: 본문 Inter, 제목·논문 serif = Source Serif 4, 코드 JetBrains Mono.
- `--series-1..8`: 리뷰어 아바타/차트 시리즈 색.
- shadow-card·rounded-card·rounded-input 등 커스텀 유틸은 tailwind.config.js
  (01-foundation에 verbatim)에 정의되어 있다.


---

### 파일: `src/index.css` (109줄) — **verbatim, 글자 그대로 사용**

````css
/* Design tokens ported from Open Science Desktop (MIT, ai4s-research/open-science). */
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/source-serif-4/400.css";
@import "@fontsource/source-serif-4/600.css";
@import "@fontsource/jetbrains-mono/400.css";
@import "@fontsource/jetbrains-mono/500.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

:root,
[data-theme="light"] {
  --bg: #f7f5ef;
  --surface: #ffffff;
  --surface-2: #f2efe7;
  --border: #e7e3da;
  --border-faint: #efece5;
  --text: #2a2723;
  --muted: #8c877d;
  --accent: #c15f3c;
  --accent-fg: #ffffff;
  --link: #2a6fdb;
  --warn: #c98a2b;
  --ok: #4b8b5b;
  --error: #c0564b;
  --series-1: #2a78d6;
  --series-2: #1baf7a;
  --series-3: #eda100;
  --series-4: #008300;
  --series-5: #4a3aa7;
  --series-6: #e34948;
  --series-7: #e87ba4;
  --series-8: #eb6834;
  --chart-grid: #e7e3da;
  --chart-axis: #cbc6bb;
}

[data-theme="dark"] {
  --bg: #16151a;
  --surface: #1e1d24;
  --surface-2: #26252d;
  --border: #33313c;
  --border-faint: #25242b;
  --text: #ece9e2;
  --muted: #9a958c;
  --accent: #d0764f;
  --accent-fg: #16151a;
  --link: #7aa5f0;
  --warn: #d7a24a;
  --ok: #6bb07d;
  --error: #d47a70;
  --series-1: #3987e5;
  --series-2: #199e70;
  --series-3: #c98500;
  --series-4: #008300;
  --series-5: #9085e9;
  --series-6: #e66767;
  --series-7: #d55181;
  --series-8: #d95926;
  --chart-grid: #33313c;
  --chart-axis: #4a4753;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Thin, calm scrollbars to match the paper aesthetic. */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
*::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: content-box;
}

/* Sidebar expand button appears after the collapse animation settles. */
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.fade-in {
  animation: fade-in 150ms ease-out 150ms backwards;
}
````
