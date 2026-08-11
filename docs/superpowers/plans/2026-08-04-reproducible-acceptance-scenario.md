# 可复现完整验收场景与数据迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Demo 中提供可重复加载的完整业务验收场景，以及通过 JSON 在浏览器间备份和整体迁移数据的能力。

**Architecture:** 把官方场景和备份编解码放在 `src/data` 的纯函数模块中，保持页面不直接接触 `localStorage`。Repository 仍是唯一持久化边界，Workspace Store 负责原子替换状态并重置各页面选择；设置页只编排确认、文件选择、下载和可见反馈。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Testing Library、Playwright。

## Global Constraints

- 不接入后端、数据库、真实凭证、真实企业连接器或真实客户数据。
- 所有加载与导入均为整体替换；不得实现合并导入。
- JSON 解析或校验失败不得调用 Repository `save`，不得污染当前数据。
- 继续遵守 `Project → Asset → StagePlan`、阶段验收、反馈重排、报价门禁和结项门禁的不变量。
- UI 动作必须可操作且有成功、取消或错误反馈；桌面端最低宽度 1280px。
- 每项行为变化先写失败测试，再写最小实现；未经用户明确授权不提交、推送或合并 Git。

---

## 文件结构

- 新建 `apps/gamepmer-web/src/data/acceptanceScenario.ts`：构造官方 `CO-004` / `SKF_A_3D_B52` / `F-018` 验收状态。
- 新建 `apps/gamepmer-web/src/data/acceptanceScenario.test.ts`：验证场景对象、关联关系和业务不变量。
- 新建 `apps/gamepmer-web/src/data/demoBackup.ts`：JSON 备份包类型、编码、解码和错误信息。
- 新建 `apps/gamepmer-web/src/data/demoBackup.test.ts`：验证往返、版本、格式及坏输入。
- 修改 `apps/gamepmer-web/src/data/LocalDemoRepository.ts` 和对应测试：增加已校验状态的替换边界。
- 修改 `apps/gamepmer-web/src/features/workspace/workspaceStore.ts` 并新建 `workspaceStore.test.ts`：加载场景/导入状态后重建 UI 选择并持久化。
- 新建 `apps/gamepmer-web/src/features/settings/DataOpsPanel.tsx` 和 `DataOpsPanel.test.tsx`：设置页的场景、导出和导入交互。
- 修改 `apps/gamepmer-web/src/features/settings/SettingsPage.tsx`、`SettingsPage.test.tsx` 与 `styles/settings.css`：将运维区改为使用专用面板。
- 新建 `apps/gamepmer-web/e2e/data-portability.spec.ts`：在真实 Chromium 中验证完整场景、下载、导入确认与页面投影。
- 修改 `apps/gamepmer-web/README.md`：说明 Demo 数据的浏览器隔离、完整场景与导入导出边界。

## Task 1: 官方完整验收场景

**Files:**

- Create: `apps/gamepmer-web/src/data/acceptanceScenario.test.ts`
- Create: `apps/gamepmer-web/src/data/acceptanceScenario.ts`
- Reference: `apps/gamepmer-web/src/data/seed.ts`, `apps/gamepmer-web/src/domain/model.ts`, `apps/gamepmer-web/src/domain/closeout.ts`

**Interfaces:**

- Produces: `createAcceptanceScenarioState(): DemoState`
- Produces: `ACCEPTANCE_SCENARIO = { quoteCaseId: 'CO-004', projectCode: 'SKF_A_3D_B52', feedbackBatchId: 'F-018' }`
- Consumes: `createDemoState()`, `DemoState`, `StagePlan`, `QuoteCase`, `QuoteVersion`, `FeedbackBatch`, `ScheduleRevision`, `CloseoutCase`。

- [ ] **Step 1: 写入场景完整性的失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { createAcceptanceScenarioState, ACCEPTANCE_SCENARIO } from './acceptanceScenario'

it('生成从报价到归档都可追溯的 3D PBR 验收案例', () => {
  const state = createAcceptanceScenarioState()
  const project = state.projects.find((item) => item.code === ACCEPTANCE_SCENARIO.projectCode)

  expect(state.quoteCases.some((item) => item.id === ACCEPTANCE_SCENARIO.quoteCaseId)).toBe(true)
  expect(project?.assets[0].stages.map((stage) => stage.code)).toEqual([
    '3D_MID', '3D_HIGH', '3D_LOW', '3D_BAKE', '3D_TEXTURE', '3D_LOD',
  ])
  expect(state.feedbackBatches.some((item) => item.id === ACCEPTANCE_SCENARIO.feedbackBatchId)).toBe(true)
  expect(state.revisions.some((item) => item.sourceFeedbackItemId === 'F-018-01')).toBe(true)
  expect(state.closeoutCases.find((item) => item.projectCode === project?.code)?.status).toBe('Archived')
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm.cmd test -- src/data/acceptanceScenario.test.ts`

Expected: FAIL，原因是 `acceptanceScenario` 模块和导出的工厂尚不存在。

- [ ] **Step 3: 写入“反馈仅影响目标资产”的失败测试**

```ts
it('保留基准日期，并且 F-018 重排只改受影响资产的后续阶段', () => {
  const state = createAcceptanceScenarioState()
  const project = state.projects.find((item) => item.code === 'SKF_A_3D_B52')!
  const affected = project.assets.find((item) => item.id === 'SKF-A-01')!
  const untouched = project.assets.find((item) => item.id === 'SKF-A-02')!

  expect(affected.stages.find((stage) => stage.code === '3D_LOW')?.baselineStart)
    .not.toBe(affected.stages.find((stage) => stage.code === '3D_LOW')?.currentStart)
  expect(untouched.stages.every((stage) => stage.baselineStart === stage.currentStart)).toBe(true)
})
```

- [ ] **Step 4: 实现最小场景工厂**

```ts
export const ACCEPTANCE_SCENARIO = {
  quoteCaseId: 'CO-004',
  projectCode: 'SKF_A_3D_B52',
  feedbackBatchId: 'F-018',
} as const

export function createAcceptanceScenarioState(): DemoState {
  const state = createDemoState()
  // 以完整、虚构且彼此关联的对象替换基础业务集合；保留日历、制作组和人员配置。
  return {
    ...state,
    projects: [acceptanceProject, unaffectedCompanionProject],
    quoteCases: [acceptanceQuoteCase],
    quoteVersions: [acceptanceQuoteVersion],
    feedbackBatches: [acceptanceFeedbackBatch],
    revisions: [acceptanceRevision],
    closeoutCases: [acceptanceCloseoutCase],
    projectPaths: acceptancePaths,
    sourceRecords: acceptanceSources,
    candidates: acceptanceCandidates,
    notificationDrafts: acceptanceNotifications,
    auditEvents: acceptanceAuditEvents,
    changeRequests: [],
    insightDispositions: [],
  }
}
```

构造时明确填写 `SKF-A-01` 的六个 3D PBR 阶段及连续 `dependsOn`；`3D_LOW` 至 `3D_LOD` 的 `currentStart/currentFinish` 相对 `baseline*` 顺延，`SKF-A-02` 不改日期。`F-018-01` 指向 `SKF-A-01/3D_HIGH`；重排 `sourceFeedbackItemId` 同样指向该反馈项；`CO-004` 状态为 `KickoffSent`；结项五道门禁有证据且状态为 `Archived`。

- [ ] **Step 5: 运行场景测试并确认绿灯**

Run: `npm.cmd test -- src/data/acceptanceScenario.test.ts`

Expected: PASS，两个断言均通过。

## Task 2: JSON 备份包的纯函数编解码

**Files:**

- Create: `apps/gamepmer-web/src/data/demoBackup.test.ts`
- Create: `apps/gamepmer-web/src/data/demoBackup.ts`
- Reference: `apps/gamepmer-web/src/data/LocalDemoRepository.ts`, `apps/gamepmer-web/src/domain/model.ts`

**Interfaces:**

- Produces: `DemoBackupPackage`、`DemoBackupError`、`exportDemoBackup(state, exportedAt)`、`serializeDemoBackup(state, exportedAt)`、`importDemoBackup(raw)`。
- Consumes: `DEMO_SCHEMA_VERSION` 与 `isDemoState(value)`。

- [ ] **Step 1: 写入导出/导入往返的失败测试**

```ts
import { createAcceptanceScenarioState } from './acceptanceScenario'
import { importDemoBackup, serializeDemoBackup } from './demoBackup'

it('导出的备份包可被导入并保留完整场景', () => {
  const state = createAcceptanceScenarioState()
  const raw = serializeDemoBackup(state, '2026-08-04T10:00:00+08:00')

  expect(JSON.parse(raw)).toMatchObject({
    format: 'gamepmer-demo-backup',
    schemaVersion: state.schemaVersion,
    exportedAt: '2026-08-04T10:00:00+08:00',
  })
  expect(importDemoBackup(raw)).toEqual(state)
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm.cmd test -- src/data/demoBackup.test.ts`

Expected: FAIL，原因是 `demoBackup` 模块不存在。

- [ ] **Step 3: 写入坏输入的失败测试**

```ts
it.each([
  ['非 JSON', '{ not json'],
  ['错误格式', JSON.stringify({ format: 'other', schemaVersion: 8, state: {} })],
  ['错误版本', JSON.stringify({ format: 'gamepmer-demo-backup', schemaVersion: 7, state: {} })],
  ['缺少集合', JSON.stringify({ format: 'gamepmer-demo-backup', schemaVersion: 8, state: { schemaVersion: 8, projects: [] } })],
])('拒绝%s备份包', (_label, raw) => {
  expect(() => importDemoBackup(raw)).toThrow(DemoBackupError)
})
```

- [ ] **Step 4: 实现受校验的编解码**

```ts
export class DemoBackupError extends Error {}

export interface DemoBackupPackage {
  format: 'gamepmer-demo-backup'
  schemaVersion: number
  exportedAt: string
  state: DemoState
}

export function serializeDemoBackup(state: DemoState, exportedAt: string): string {
  return JSON.stringify({ format: 'gamepmer-demo-backup', schemaVersion: DEMO_SCHEMA_VERSION, exportedAt, state })
}

export function importDemoBackup(raw: string): DemoState {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new DemoBackupError('文件不是有效的 JSON 备份包。') }
  const backup = value as Partial<DemoBackupPackage>
  if (backup.format !== 'gamepmer-demo-backup') throw new DemoBackupError('不是 GamePMer 备份文件。')
  if (backup.schemaVersion !== DEMO_SCHEMA_VERSION) throw new DemoBackupError('备份文件版本与当前 Demo 不兼容。')
  if (!isDemoState(backup.state)) throw new DemoBackupError('备份文件缺少必需业务数据。')
  return structuredClone(backup.state)
}
```

- [ ] **Step 5: 运行编解码测试并确认绿灯**

Run: `npm.cmd test -- src/data/demoBackup.test.ts`

Expected: PASS，往返和四类拒绝都通过。

## Task 3: Repository 与 Workspace Store 的原子替换

**Files:**

- Modify: `apps/gamepmer-web/src/data/LocalDemoRepository.ts`
- Modify: `apps/gamepmer-web/src/data/LocalDemoRepository.test.ts`
- Modify: `apps/gamepmer-web/src/features/workspace/workspaceStore.ts`
- Create: `apps/gamepmer-web/src/features/workspace/workspaceStore.test.ts`

**Interfaces:**

- Add to `DemoRepository`: `replace(state: DemoState): DemoState`。
- Add to `WorkspaceStore`: `loadAcceptanceScenario(): void`、`replaceDemo(state: DemoState): void`。
- Consumes: `createAcceptanceScenarioState()` 与已由 `importDemoBackup()` 校验过的 `DemoState`。

- [ ] **Step 1: 写入 Repository 替换和失败不污染的测试**

```ts
it('replace 将一份已校验状态落盘并能重新读取', () => {
  const storage = fakeStorage()
  const repository = new LocalDemoRepository(storage)
  const acceptance = createAcceptanceScenarioState()

  repository.replace(acceptance)
  expect(repository.load().projects.map((item) => item.code)).toContain('SKF_A_3D_B52')
})
```

- [ ] **Step 2: 运行 Repository 测试并确认红灯**

Run: `npm.cmd test -- src/data/LocalDemoRepository.test.ts`

Expected: FAIL，原因是 `replace` 尚未定义。

- [ ] **Step 3: 实现最小持久化边界和 Store 动作**

```ts
// LocalDemoRepository
replace(state: DemoState): DemoState {
  this.save(state)
  return state
}

// Workspace Store
loadAcceptanceScenario() {
  state = initialState(repository.replace(createAcceptanceScenarioState()), clock.today())
  emit()
},
replaceDemo(demo) {
  state = initialState(repository.replace(demo), clock.today())
  emit()
},
```

在 Store 测试中先选中基础数据的项目，再调用 `loadAcceptanceScenario()`；断言选中项目已回到 `SKF_A_3D_B52`，重新创建同一 Repository 的 Store 后仍能读到该场景。再以 `importDemoBackup(serializeDemoBackup(...))` 调用 `replaceDemo()`，断言旧项目不再存在。

- [ ] **Step 4: 运行 Repository 和 Store 测试并确认绿灯**

Run: `npm.cmd test -- src/data/LocalDemoRepository.test.ts src/features/workspace/workspaceStore.test.ts`

Expected: PASS，替换、重置选择与重载持久化均通过。

## Task 4: 设置中心的数据操作面板

**Files:**

- Create: `apps/gamepmer-web/src/features/settings/DataOpsPanel.tsx`
- Create: `apps/gamepmer-web/src/features/settings/DataOpsPanel.test.tsx`
- Modify: `apps/gamepmer-web/src/features/settings/SettingsPage.tsx`
- Modify: `apps/gamepmer-web/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/gamepmer-web/src/styles/settings.css`

**Interfaces:**

- `DataOpsPanel({ demo, store, now }: { demo: DemoState; store: WorkspaceStore; now: string })`。
- 使用 `serializeDemoBackup(demo, now)` 生成 `Blob`，用 `<a download>` 下载。
- 文件文本经 `importDemoBackup()` 校验后仅存入 React 本地 `pendingImport`；确认按钮才调用 `store.replaceDemo(pendingImport.state)`。

- [ ] **Step 1: 写入官方场景确认载入的失败组件测试**

```tsx
it('二次确认后整体载入完整验收场景', async () => {
  const { user } = renderSettings()
  await goto(user)
  await section(user, '数据与运维')

  await user.click(screen.getByRole('button', { name: '载入完整验收场景' }))
  expect(screen.getByText(/将覆盖当前浏览器中的全部 Demo 数据/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '确认载入完整验收场景' }))

  expect(store.getState().demo.projects.map((item) => item.code)).toContain('SKF_A_3D_B52')
  expect(screen.getByRole('status')).toHaveTextContent('已载入完整验收场景')
})
```

- [ ] **Step 2: 写入导入失败不覆盖和成功确认的失败测试**

```tsx
it('无效导入显示错误且不覆盖当前数据', async () => {
  const { user } = renderDataOps()
  const before = store.getState().demo.projects.map((item) => item.code)
  await user.upload(screen.getByLabelText('导入 GamePMer JSON 备份'), new File(['not json'], 'broken.json'))

  expect(screen.getByRole('alert')).toHaveTextContent('文件不是有效的 JSON 备份包')
  expect(store.getState().demo.projects.map((item) => item.code)).toEqual(before)
})
```

- [ ] **Step 3: 运行组件测试并确认红灯**

Run: `npm.cmd test -- src/features/settings/DataOpsPanel.test.tsx src/features/settings/SettingsPage.test.tsx`

Expected: FAIL，原因是数据操作面板和相应可访问名称尚不存在。

- [ ] **Step 4: 实现面板与页面接线**

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="application/json,.json"
  aria-label="导入 GamePMer JSON 备份"
  hidden
  onChange={handleImportFile}
/>
```

实现三个互斥的本地状态：`confirmAcceptance`、`pendingImport`、`notice`。导入成功后显示项目、报价、反馈、结项、审计事件数量；取消仅清空 `pendingImport`；导入错误放入 `alert`。导出时生成文件名 `gamepmer-demo-backup-YYYY-MM-DD.json`，点击临时链接后立即 `URL.revokeObjectURL`。把原设置页“数据与运维”的内联恢复/清空区替换为该面板，保留基础恢复和清空原有二次确认行为。

- [ ] **Step 5: 运行组件测试并确认绿灯**

Run: `npm.cmd test -- src/features/settings/DataOpsPanel.test.tsx src/features/settings/SettingsPage.test.tsx`

Expected: PASS，场景确认、导入失败不污染、导入确认替换、导出文件名和现有恢复/清空测试均通过。

## Task 5: 端到端验收与使用说明

**Files:**

- Create: `apps/gamepmer-web/e2e/data-portability.spec.ts`
- Modify: `apps/gamepmer-web/README.md`

**Interfaces:**

- E2E 以设置页的可访问名称操作，不读取浏览器 `localStorage`。
- 文档声明 `localStorage` 按浏览器和来源隔离，完整场景由源码加载，JSON 导入采用整体替换。

- [ ] **Step 1: 写入完整场景跨模块投影 E2E**

```ts
test('载入完整验收场景后，项目、反馈和归档页面看到同一业务线', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '设置中心' }).click()
  await page.getByRole('button', { name: /^数据与运维/ }).click()
  await page.getByRole('button', { name: '载入完整验收场景' }).click()
  await page.getByRole('button', { name: '确认载入完整验收场景' }).click()

  await page.getByRole('button', { name: '项目总览' }).click()
  await expect(page.getByText('SKF_A_3D_B52')).toBeVisible()
  await page.getByRole('button', { name: '反馈中心' }).click()
  await expect(page.getByText('F-018', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '结项中心' }).click()
  await expect(page.getByText('已归档')).toBeVisible()
})
```

- [ ] **Step 2: 写入导出与导入确认 E2E**

```ts
const download = page.waitForEvent('download')
await page.getByRole('button', { name: '导出当前数据' }).click()
expect((await download).suggestedFilename()).toMatch(/^gamepmer-demo-backup-\d{4}-\d{2}-\d{2}\.json$/)
```

接着通过 `page.setInputFiles('[aria-label="导入 GamePMer JSON 备份"]', { name: 'acceptance.json', mimeType: 'application/json', buffer: Buffer.from(backup) })` 选择有效包；断言摘要出现、确认前项目不变、确认后项目变为 `SKF_A_3D_B52`。

- [ ] **Step 3: 实现 README 使用说明**

在“数据与运维”章节加入：基础示例和完整验收场景的区别；加载或导入会覆盖当前浏览器 Demo 数据；在切换浏览器或地址前先导出 JSON；备份包不承诺多人同步，仍应只放公司内网批准位置。

- [ ] **Step 4: 运行最小端到端检查**

Run: `npm.cmd run test:e2e -- e2e/data-portability.spec.ts`

Expected: PASS，下载事件、场景投影和导入确认均成功。

- [ ] **Step 5: 完整质量门禁与视觉检查**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Expected: 四个命令均以退出码 0 完成。随后在真实浏览器以 1280、1440、1920 宽度逐一验证设置页不横向溢出、键盘可聚焦文件选择与确认操作，并人工检查“完整验收场景”数据在项目、排期、反馈、文件、结项和分析页均可见。

## 覆盖自检

- 官方场景、六阶段、F-018、重排和归档证据由 Task 1 覆盖。
- JSON 格式、版本和失败不污染由 Task 2 覆盖。
- 持久化和 UI 选择重建由 Task 3 覆盖。
- 载入确认、导出、文件导入、摘要和错误提示由 Task 4 覆盖。
- 真实浏览器、跨模块投影、三档宽度和完整质量门禁由 Task 5 覆盖。

检查完成：计划不含 `TBD`、`TODO` 或“后续补充”等占位项；所有新增接口在任务中有定义、调用方和测试。
