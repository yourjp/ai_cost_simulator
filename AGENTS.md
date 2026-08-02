<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:git-deploy-rules -->
# Git Push & Packaging Deployment Policy

* **반영/배포 오더 규칙 (IMPORTANT):** 배포 패키지 최신화(ZIP 압축 파일 갱신) 및 Git Upload(원격 커밋/푸시)는 사용자가 명시적으로 **`"반영"`** 또는 **`"배포"`**라는 지시어를 줄 때에만 가동해야 합니다. 
* **Rule:** Never execute compression (`Compress-Archive` or ZIP packaging) or remote `git push` commands autonomously. Keep all modifications strictly local until the user explicitly commands **`"반영"`** or **`"배포"`**.
<!-- END:git-deploy-rules -->

<!-- BEGIN:app-update-date-rules -->
# App Update Date Maintenance Policy (앱 업데이트 일시 현행화 규칙)

* **앱 코드/기능 수정 시 필수 갱신 (IMPORTANT):** 소스 코드, UI 컴포넌트, 시뮬레이션 계산 로직, 라이브러리/의존성 추가 등 앱(애플리케이션) 수정 작업을 진행할 때마다 반드시 [CalculatorDashboard.tsx](file:///d:/AI_Pricing/src/components/calculator/CalculatorDashboard.tsx) 파일 상단의 `APP_UPDATED_AT` 상수를 해당 작업 일자(`YYYY.MM.DD` 형식, 예: `2026.08.02`)로 갱신해야 합니다.
<!-- END:app-update-date-rules -->

