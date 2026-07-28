import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    pool: 'threads',
    // 只跑 src 下的单元与组件测试。e2e/ 是 Playwright 的地盘，
    // 两套 test 运行器的全局函数不兼容，混在一起会以「测试文件加载失败」的形式炸掉。
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
  },
})
