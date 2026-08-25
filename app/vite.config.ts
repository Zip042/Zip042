import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * 개발 서버는 `/v1` 요청을 ZIP 042 백엔드로 그대로 넘긴다(프록시).
 *
 * 왜 프록시인가: 브라우저 입장에서 같은 오리진이 되므로 **CORS 를 신경 쓸 필요가 없다**.
 * 백엔드 CORS 허용 목록에 포트를 추가하는 것을 잊어 "왜 안 되지"로 시간을 쓰는 일이 흔한데,
 * 프록시를 쓰면 그 문제 자체가 생기지 않는다.
 *
 * 백엔드 주소는 `VITE_BACKEND_ORIGIN` 으로 바꿀 수 있다(기본 http://localhost:8787).
 * 배포처럼 다른 오리진을 브라우저가 직접 부르게 하려면 `VITE_API_BASE_URL` 을 쓴다 —
 * 그 경우 프록시를 타지 않으므로 백엔드 `CORS_ORIGINS` 에 프론트 주소를 넣어야 한다.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? 'http://localhost:8787'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/v1': {
          target: backendOrigin,
          changeOrigin: true,
        },
        // 백엔드가 살아 있는지 확인할 때 쓴다.
        '/health': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
  }
})
