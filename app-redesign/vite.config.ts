import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5174,
    // ngrok 등 외부 터널로 볼 때 Vite 가 낯선 Host 헤더를 막는 것을 푼다.
    // 디자인 확인용 임시 노출이라 전체 허용으로 둔다.
    allowedHosts: true,
  },
})
