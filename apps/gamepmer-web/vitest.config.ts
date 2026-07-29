import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    pool: 'threads',
    // 默认 5s 在这台机器上不够：组件测试要渲染整个 App，
    // 与 dev server / Playwright 并行时会被抢到 5~7s。
    // 这些用例单独跑都在 1s 内完成，超时是资源竞争不是真慢。
    testTimeout: 20_000,
    // 只跑 src 下的单元与组件测试。e2e/ 是 Playwright 的地盘，
    // 两套 test 运行器的全局函数不兼容，混在一起会以「测试文件加载失败」的形式炸掉。
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
  },
})
