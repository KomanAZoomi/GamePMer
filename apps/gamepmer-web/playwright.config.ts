import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 配置。
 *
 * 端口用 5180 而不是 Vite 默认的 5173：这台开发机上 5173 常被别的项目占着，
 * 撞上去会静默连到另一个应用，测试结果毫无意义。
 * 绑 127.0.0.1 是因为默认只监听 IPv6 时本机连不上。
 */
const PORT = 5180
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm.cmd run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
