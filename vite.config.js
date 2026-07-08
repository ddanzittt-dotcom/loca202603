import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  // 프리뷰/CI 하네스가 지정한 포트 우선 (CLI --port 가 있으면 그쪽이 이김)
  // globalThis.process — 브라우저 전역 기준 ESLint(no-undef) 회피용 (node 에선 동일 동작)
  server: globalThis.process?.env?.PORT ? { port: Number(globalThis.process.env.PORT) } : undefined,
  plugins: [
    react(),
    visualizer({
      filename: 'dist/bundle-report.html',
      gzipSize: true,
      open: false,
    }),
  ],
  build: {
    // 프로덕션 번들에 소스맵 미포함 — 원본 소스 역추출 방지
    sourcemap: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
          if (id.includes('node_modules/@sentry')) {
            return 'vendor-sentry'
          }
          if (id.includes('node_modules/fflate') || id.includes('node_modules/qrcode')) {
            return 'vendor-utils'
          }
        },
      },
    },
  },
})
