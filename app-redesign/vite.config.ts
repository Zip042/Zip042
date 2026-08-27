import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/**
 * dev 서버가 `/v1` 요청을 백엔드로 그대로 넘깁니다(프록시).
 *
 * 왜 프록시인가: 브라우저 입장에서 같은 오리진이 되므로 **CORS 를 신경 쓸 필요가 없습니다.**
 * 백엔드 CORS 허용 목록에 포트를 추가하는 것을 잊어 "왜 안 되지"로 시간을 쓰는 일이
 * 흔한데, 프록시를 쓰면 그 문제 자체가 생기지 않습니다.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backend = env.VITE_BACKEND_ORIGIN ?? 'http://localhost:8787'

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 5174,
      // ngrok 등 외부 터널로 볼 때 Vite 가 낯선 Host 헤더를 막는 것을 푼다.
      allowedHosts: true,
      proxy: {
        '/v1': { target: backend, changeOrigin: true },
        '/health': { target: backend, changeOrigin: true },
      },
    },
  }
})
