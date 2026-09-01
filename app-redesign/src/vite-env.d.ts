/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 배포처럼 다른 오리진의 백엔드를 브라우저가 직접 부를 때만 씁니다.
   * 개발 중에는 비워 두세요 — vite dev 프록시가 /v1 을 백엔드로 넘깁니다.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
