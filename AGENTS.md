<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:git-deploy-rules -->
# Git Push & Packaging Deployment Policy

* **반영/배포 오더 규칙 (IMPORTANT):** 배포 패키지 최신화(ZIP 압축 파일 갱신) 및 Git Upload(원격 커밋/푸시)는 사용자가 명시적으로 **`"반영"`** 또는 **`"배포"`**라는 지시어를 줄 때에만 가동해야 합니다. 
* **Rule:** Never execute compression (`Compress-Archive` or ZIP packaging) or remote `git push` commands autonomously. Keep all modifications strictly local until the user explicitly commands **`"반영"`** or **`"배포"`**.
<!-- END:git-deploy-rules -->
