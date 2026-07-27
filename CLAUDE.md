# GamePMer — Claude Code 交接说明

> 更新日期：2026-07-27
> 交接目的：让 Claude Code 在不重复走错方向、不破坏现有工作树的前提下，继续 GamePMer 内网 Web 工作台的设计审阅、实施计划和后续开发。

## 0. 进入仓库后的第一原则

请先阅读本文，不要直接改代码。

当前项目已经经历过一次“工程测试全部通过，但产品验收失败”。失败的核心不是业务理解，而是文字对齐替代了体验对齐、前端设计差、排期录入和档期过于简单、甘特图看不到真实节点、首次打开没有示例数据。

本轮已经重新完成白色 Web 工作台的页面设计和业务架构。新的设计说明尚处于“等待书面审阅”状态，因此：

1. 先请用户确认新版设计说明。
2. 确认后编写新的实施计划。
3. 实施必须按可视化纵向切片推进。
4. 每个切片都要给用户真实页面、截图或可操作 Demo 验收。
5. 不要因为用户说“继续直到完成”就跳过中间视觉验收。

与用户沟通默认使用中文。

## 1. 当前唯一产品方向

GamePMer 是给游戏美术 PM 使用的**公司内网 Web 工作台**，不是本地 WPF/EXE 优先产品，也不是公网 SaaS。

不可擅自重新讨论或改变的已确认决策：

- 使用桌面优先的内网 Web 形态，后续供公司同事通过内网试用。
- 整体 UI 采用白色和浅暖灰分层，不做黑色“任务指挥台”。
- 忠实延续用户参考图的结构思路：完整左侧导航、顶部搜索/操作、指标区、左侧列表、中央主工作区、右侧智能详情、底部时间线或流程。
- 左侧导航保持完整展开。用户明确不接受“左侧导航太长，所以应该折叠或删减”的判断。
- 项目是根业务对象；任务是从项目、资产、阶段、反馈、报价和结项状态生成的行动投影。
- 外部消息先成为候选信息，未经 PM 确认不得改变正式业务数据。
- AI 只识别、分类、建议和起草，不自动发信、不自动改排期、不自动批准报价、不自动结项。
- 排期必须同时保留基准、当前和实际三套日期，基准不可覆盖。
- 录入排期必须展开到资产的每个可验收阶段，不能只有项目开始日/结束日。
- 档期和负载分析到制作组、项目、资产、阶段，不记录具体制作人员或个人绩效。
- Demo 第一次打开必须有真实密度的虚构示例数据，不能是空白页。
- 第一个可验收 Demo 必须包含“客户反馈导致后续排期重排”。

完整左侧导航：

1. 任务管理
2. 项目总览
3. 候选收件箱
4. 排期管理
5. 反馈中心
6. 报价与变更
7. 结项中心
8. 文件与归档
9. 智能分析
10. 设置中心

## 2. 权威资料与阅读顺序

按以下顺序阅读：

### 2.1 当前权威设计

`docs/superpowers/specs/2026-07-27-intranet-web-workspace-redesign-design.md`

这是当前最重要的设计基线，产品设计提交为：

`aa220bd docs: define intranet web workspace redesign`

它定义：

- 端到端业务线
- 白色 UI 信息架构
- 七个核心页面和辅助模块
- 项目、资产、阶段、候选、反馈、报价、变更、结项和证据模型
- 制作组档期与容量
- 状态机和人工确认门禁
- AI、连接器、内网、安全边界
- Demo 种子数据
- 实施切片、测试要求和总体验收脚本

### 2.2 失败复盘

`docs/retrospectives/2026-07-16-m1-vibe-coding-retrospective.md`

这是用户留下的未跟踪文件，但内容是后续开发的必读规则。不要删除、移动、覆盖或擅自提交它。

必须遵守其中的阶段门：

- S0 需求钉子
- S1 带示例数据的界面原型
- S2 可交互切片
- S3 数据做实
- S4 加固
- S5 打磨发布

本轮 S1 的核心页面已经得到用户确认。书面设计审阅后应进入新的实施计划，再开始 S2。

### 2.3 旧 Web Demo 资料

- `docs/superpowers/specs/2026-07-17-web-demo-schedule-replan-design.md`
- `docs/superpowers/plans/2026-07-17-web-demo-schedule-replan.md`

这些资料可以帮助理解已经实现的工作日重排 Demo，但视觉和产品范围已被 2026-07-27 设计扩展。不要把旧 Demo 页面当作新 UI 基线。

### 2.4 旧 WPF 资料

- `docs/PRD.md`
- `docs/superpowers/specs/2026-07-15-gamepmer-workbench-design.md`
- `docs/superpowers/plans/2026-07-15-m1-foundation-schedule-control-tower.md`
- `docs/DECISIONS.md`
- 根目录 `README.md`

这些文件仍包含大量有效的领域知识，但平台、发布和 UI 方向已经过时：

- “Windows 本地应用、WPF、SQLite、本地优先、MSIX”不再是当前产品方向。
- 旧 README 的当前状态也不准确。
- 不要依据旧 ADR 决定新的内网 Web 技术栈。
- 工作日、阶段、排期版本、延期归因、人工确认、Excel 校验等领域规则可以参考。

书面设计通过后，应把 README 和 PRD 的平台/状态部分更新为内网 Web 方向，同时保留仍然有效的领域规则。

## 3. 本机 Git 与工作树现状

仓库根目录：

`D:\Outgoing\GamePMer`

### 3.1 `main`

- 当前设计基线位于 `main`。
- 在本交接前的设计提交：`aa220bd`。
- 主工作树没有应用代码，主要是 README 和设计文档。
- 存在用户自己的未跟踪目录：`docs/retrospectives/`。
- 不要把该目录混入其他提交。

### 3.2 可复用 Web Demo

分支：

`feat/web-schedule-replan-demo`

工作树：

`D:\Outgoing\GamePMer\.worktrees\web-schedule-replan-demo`

最新提交：

`25f20bf feat: deliver feedback-driven schedule replan demo`

当前状态：干净。

该分支包含 React + TypeScript + Vite 应用：

`apps/gamepmer-web`

它是新开发最值得复用的代码基线，但只复用其领域逻辑、种子数据、Repository 边界和测试思路。现有视觉未通过用户预期，不能只换配色后继续。

### 3.3 旧 WPF M1

分支：

`feat/m1-foundation`

工作树：

`D:\Outgoing\GamePMer\.worktrees\m1-foundation`

最新已提交版本：

`921f352 test: verify M1 schedule control tower end to end`

该工作树当前不是干净状态：

- 25 个已修改文件
- 约 387 行新增、220 行删除
- 新增未跟踪目录 `src/GamePMer.Desktop/Common/`

这些变更必须视为用户或前序工作的未提交资产：

- 不要执行 `git reset --hard`。
- 不要执行会丢弃修改的 checkout/restore。
- 不要在没有用户明确授权时提交、合并或删除该工作树。
- 不要把 WPF 分支合入新的 Web 产品分支。
- 如需复用领域规则，先只读检查，再在 Web 代码中重新表达。

## 4. 建议的接手方式

不要在 `main` 直接开发，也不要复用脏的 WPF 工作树。

在设计说明获得用户确认、实施计划获得确认后，推荐从干净 Web Demo 创建新的隔离工作树，再合入 `main` 的新文档：

```powershell
cd D:\Outgoing\GamePMer
git status --short --branch
git worktree list
git worktree add .worktrees/intranet-web-redesign -b feat/intranet-web-redesign feat/web-schedule-replan-demo
cd .worktrees/intranet-web-redesign
git merge main
```

执行前再次确认分支名和工作树路径没有被他人创建。不要删除现有两个工作树。

为什么从 Web Demo 分支起步：

- 它已有 React/Vite 工程和锁文件。
- 已有 2D/3D 种子数据。
- 已有工作日计算。
- 已有反馈重排草案、确认和取消的纯函数。
- 已有 Local Repository 边界和自动测试。

为什么仍需大幅重构：

- 当前 UI 只是旧单页排期 Demo，不符合新的白色工作台结构。
- 当前数据模型太薄，不能支撑候选、制作组容量、实际日期、证据、报价、变更和结项。
- 当前甘特逻辑不能表达完整依赖、客户等待、实际日期、容量和多项目组合排期。

## 5. 当前 Web Demo 代码地图

目录：

`D:\Outgoing\GamePMer\.worktrees\web-schedule-replan-demo\apps\gamepmer-web`

### 5.1 可复用部分

- `src/domain/workCalendar.ts`
  - `isWorkday`
  - `moveByWorkdays`
  - `countWorkdays`
  - 当前只覆盖周末规则，应扩展公司休息日和特殊工作日。

- `src/domain/replan.ts`
  - `generateReplanDraft`
  - `moveDraftStage`
  - `discardDraft`
  - `confirmDraft`
  - 已体现“草案不污染正式排期、确认后才写入”的核心原则。

- `src/data/seed.ts`
  - 已有 `P-3D-024`、`P-2D-018`、`P-3D-031`。
  - 可扩展而不是删除。

- `src/data/LocalDemoRepository.ts`
  - 使用 `gamepmer.web-demo.v1`。
  - 已有加载、保存、重置。
  - 正式设计要求通过 Repository 接口替换为内网 API，UI 不应直接依赖 localStorage。

- `src/features/workspace/workspaceStore.ts`
  - 已有选择资产、开始反馈、移动草案、取消、确认和重置的轻量 Store。
  - 可作为用例边界参考，不应继续膨胀为全局巨型 Store。

- 测试：
  - 工作日
  - 重排草案
  - 种子数据
  - Repository/Store
  - App 交互

### 5.2 已知技术缺口

- `Stage` 只有基准/当前日期，没有实际开始、完成、提交和客户确认的完整时间语义。
- 没有 `Project` 根对象所需的角色、工作日历、路径和状态。
- 没有制作组、容量日历和档期占用。
- 没有候选收件箱、字段置信度、来源证据和确认事务。
- 没有反馈批次下的多个资产级反馈项，也没有范围内/范围外分流。
- 没有首次报价、追加报价、版本、复核和开工门禁。
- 没有结项、最终包、客户确认、IT 回执和 BD 出账门禁。
- `confirmDraft` 目前以反馈接收日作为确认时间，应改为注入时钟或正式用例时间。
- `LocalDemoRepository.isState` 只检查 `schemaVersion`，缺少数据迁移和结构校验。
- 当前重排只是把未验收的后续阶段统一平移，没有显式依赖图、容量冲突和事务回滚。
- 当前 `test:e2e` 脚本引用 Playwright，但锁文件没有 `@playwright/test`，也没有可见的 E2E 配置/用例；不能声称 E2E 已可运行。
- 没有后端、账号、权限、审计或多用户协同。
- 现有 `App.tsx`/`App.css` 的视觉不应作为新版 UI 组件库基础。

## 6. 现场验证结果

验证日期：2026-07-27。

环境：

- Node `v26.5.0`
- npm `11.17.0`

PowerShell 会优先解析 `D:\Node\npm.ps1`，当前执行策略会阻止它运行。使用 `npm.cmd`，不要为了运行项目修改系统执行策略。

在 `apps/gamepmer-web` 下已重新验证：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

结果：

- Vitest：5 个测试文件通过，12 个测试通过。
- TypeScript 类型检查通过。
- Vite 生产构建通过。
- 测试有一条 Node 关于 localStorage 的实验性警告，但不影响通过结果。
- 构建后 Web 分支工作树仍然干净。

本地启动：

```powershell
cd D:\Outgoing\GamePMer\.worktrees\web-schedule-replan-demo\apps\gamepmer-web
npm.cmd run dev
```

新工作树建立后，路径应替换为新工作树中的 `apps/gamepmer-web`。

## 7. 业务主线

实现必须围绕这一条可追溯业务线，不要把页面做成互不关联的静态模块：

1. 邮件、企微、飞书转发、截图、粘贴文本和文件路径进入候选收件箱。
2. AI 提取字段并显示置信度，PM 核验。
3. PM 确认后生成正式报价、团队完成、客户反馈或结项记录。
4. BD 需求交给 2D/3D 总监报价和排期。
5. 组长/BD 复核，PM 发送正式开工邮件后项目才进入制作。
6. 2D/3D 资产按阶段制作，每个阶段可以客户验收。
7. 团队内部审核不在系统中管理；团队完成邮件代表已交给 PM。
8. PM 取件并提交客户，阶段进入等待客户。
9. 节点前一个工作日仍无完成邮件，生成提醒草稿。
10. 超过计划日仍无完成邮件，只标记“可能延期”，由 PM 决定是否询问。
11. 客户反馈拆成资产级反馈项。
12. 范围内反馈进入返修和排期草案。
13. 范围外反馈进入追加报价、复核和变更开工。
14. 客户造成的等待单独归因。
15. 所有资产验收后，总监整理最终包。
16. 客户最终确认后，IT 执行剪切备份并发正式邮件回执。
17. 证据完整后通知 BD 出账并归档。

## 8. 制作阶段与文件规则

2D：

`草图 → 细化 50% → 完成稿`

3D PBR：

`中模 → 高模 → 低模 → 烘焙 → 贴图 → LOD`

每个阶段保存：

- 制作组
- 预估人天
- 基准开始/结束
- 当前开始/结束
- 实际开始/完成
- 提交客户时间
- 客户确认时间
- 依赖和验收状态
- 延期或修订原因

默认文件识别：

`资产名_阶段名_YYYYMMDD_rNN`

实际文件只有“资产名_阶段名_日期”也应生成候选。命名不规范时保留原文件名并由 PM 手工关联，不能丢弃证据。

## 9. 首个实施纵向切片

用户已确认首个 Demo 必须包含客户反馈导致重排。

第一验收闭环：

`首页 → 项目甘特 → 客户反馈 → 排期影响 → 重排草案 → PM 确认 → 修订记录与通知草稿`

第一切片必须同时交付：

- 白色工作台外壳。
- 完整长导航。
- 至少三个种子项目。
- 多资产、多阶段真实日期轴。
- 制作组容量和跨项目档期。
- 基准、当前、实际和草案的清晰区别。
- 工作日、周末、今天线、客户等待和验收节点。
- `P-3D-024 / MECH-01 / F-017` 主路径。
- 取消草案不改变正式计划。
- 确认草案保留基准并生成新修订。
- 通知只生成未发送草稿。
- 一键恢复示例数据。

不要先实现连接器、数据库加密、备份或完整后端，再回头补页面。

## 10. Demo 种子数据

保留并扩展以下项目：

- `P-3D-024`：主路径；`MECH-01`、反馈 `F-017`、变更 `CQ-004`。
- `P-2D-018`：2D 阶段，当前等待客户。
- `P-3D-031`：多资产正常制作，用于组合排期和负载对照。

必须覆盖：

- 正常阶段
- T-1 提醒
- 可能延期
- 客户等待
- 客户反馈
- 范围内返修
- 追加报价
- 未确认排期草案
- 制作组容量预警
- 原始来源和路径证据
- 最终包、客户确认和 IT 回执的结项示例

所有示例必须是虚构、脱敏数据。

## 11. 视觉原型资产

本机存在已确认的静态 HTML 和截图，但位于被 Git 忽略的 `.superpowers` 目录。它们只在当前机器上可用，不能作为唯一规格来源。

目录：

`D:\Outgoing\GamePMer\.superpowers\brainstorm\white-ui-architecture-20260727-v3`

关键 HTML：

- `content/white-reference-clone-home-v1.html`
- `content/business-line-and-ui-audit-v1.html`
- `content/candidate-inbox-page-v1.html`
- `content/project-detail-gantt-page-v1.html`
- `content/feedback-center-replan-page-v1.html`
- `content/quotation-and-change-page-v1.html`
- `content/closeout-backup-billing-page-v1.html`

关键截图：

- `audit/01-white-home.png`
- `audit/03-candidate-inbox.png`
- `audit/04-project-gantt.png`
- `audit/05-feedback-center.png`
- `audit/06-quotation-change.png`
- `audit/07-closeout-backup-billing.png`

当前原型服务信息：

`http://localhost:57006/?key=fec8068f4015abfadc120ac250ff58fe464930d7cfa7d191abdaec7ff5c4793d`

服务可能因超时失效。失效时直接查看 HTML 和截图，不要把 URL 当成长期依赖。

实现时可以忠实复刻结构与信息层级，但应使用真实可维护的 React 组件、设计令牌和响应式布局，不能把静态原型整体硬编码进 `App.tsx`。

## 12. 新版领域对象

至少需要以下对象或等价模型：

- `Project`
- `Asset`
- `StagePlan`
- `ProductionGroup`
- `CapacityBucket`
- `WorkItem`
- `SourceRecord`
- `InboxCandidate`
- `FeedbackBatch`
- `FeedbackItem`
- `QuoteCase`
- `QuoteVersion`
- `QuoteLine`
- `ChangeRequest`
- `ScheduleRevisionDraft`
- `ScheduleRevision`
- `CloseoutCase`
- `CloseoutGate`
- `EvidenceRef`
- `Person`
- `ProjectRole`
- `NotificationDraft`
- `AuditEvent`
- `WorkCalendar`
- `PathReference`

规则：

- `Project → Asset → StagePlan` 是主要业务树。
- `StagePlan` 引用共享的 `ProductionGroup`。
- 制作组容量是跨项目共享资源，不能错误地挂成某个项目的私有容量。
- 首页、任务、指标和分析是正式对象的投影。
- 候选不是任务，确认候选后才产生正式记录和行动项。
- 排期确认必须是原子事务，部分更新必须回滚。

## 13. 内网、安全和集成边界

- 不做公网部署。
- 企微、飞书和邮件只使用公司认证、管理员批准的官方接口。
- 无法授权的私人会话使用转发给机器人、粘贴文本或截图导入。
- 工作台记录反馈盘、制作盘、提交盘、最终包和备份路径的索引，不执行真实文件移动或删除。
- IT 执行真实剪切备份，IT 正式邮件是完成证据。
- LLM 设置提供多个供应商预设，用户只填写 API Key。
- API Key 不得进入仓库、普通日志、导出文件或前端明文存储。
- 正式环境的连接器和 LLM 调用应通过内网服务端 Adapter/网关。
- 当前没有真实接口凭证，不要用真实客户或公司数据测试。

## 14. 实施顺序

新版设计说明定义了七个切片：

1. 白色工作台外壳与种子数据
2. 项目、资产、阶段、团队档期与真实甘特
3. 候选收件箱
4. 反馈返修与排期重排
5. 报价与变更
6. 结项、IT 与出账
7. 连接器、LLM、权限与运维

建议实施计划把前四项重新组合成可操作的第一纵向闭环，不要按“先建所有表、再做所有接口、最后做 UI”的水平层顺序。

每个切片：

1. 先定义可见验收场景。
2. 先写失败测试或组件交互测试。
3. 实现最小领域规则。
4. 实现页面。
5. 跑测试、类型检查、构建。
6. 在 1280/1440/1920 检查截图。
7. 给用户真实页面验收。
8. 用户确认后再进入下一切片。

## 15. 质量门禁

最低自动验证：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

补齐 Playwright 依赖、配置和真实 E2E 用例后，才能启用：

```powershell
npm.cmd run test:e2e
```

必须覆盖：

- 工作日、公司休息日和特殊工作日。
- 基准、当前、实际日期。
- 合法/非法状态迁移。
- 候选去重。
- 组长与 BD 同人时只生成一次确认待办，但保留双角色审计。
- 客户等待与团队延期分开。
- 候选确认事务。
- 排期修订事务与回滚。
- 报价复核和开工门禁。
- 追加报价对受影响/未受影响资产的差异处理。
- 结项证据门禁。
- Demo 重置。

视觉验收不能被自动测试替代：

- 真实日期轴和所有排期节点必须可见。
- 甘特不能用项目级静态进度条冒充。
- 排期录入不能退化为几个日期文本框。
- 页面首次打开必须有足够密度。
- 颜色不是唯一状态表达。
- 正文实际实现不小于约 14px。
- 键盘焦点、横向滚动和缩放必须可用。

## 16. 必须避免的失败模式

- 只写厚文档，不给页面。
- 只验证测试，不验证 PM 是否能完成工作。
- 在 UI 未验收前投入大量后端、安全、安装和连接器工程。
- 一次实现全部模块，最后才给用户看。
- 用空态验收排期产品。
- 把“完成制作”“已交 PM”“已提交客户”“客户确认”合并成一个完成状态。
- 把客户反馈延期算成团队延期。
- 自动确认 AI 提取结果。
- 自动发送通知。
- 覆盖基准排期。
- 冻结追加报价无关的其他资产。
- 重新建议折叠完整左侧导航。
- 在旧 WPF 工作树上执行任何破坏性 Git 操作。

## 17. 当前未决事项

以下内容尚未获得最终实现决策，不要静默假设：

- 新版书面设计说明是否正式通过。
- 新版详细实施计划。
- 正式内网后端技术栈、数据库、身份认证和部署拓扑。
- 各公司账号能获得哪些邮件、企微和飞书官方权限。
- LLM 供应商最终启用名单和模型。
- 正式 GitHub 许可证与公开发布范围。

第一个 Demo 可以继续使用 Repository 抽象和本地种子持久化，不需要为了这些未决项阻塞体验验证。

## 18. Claude Code 的下一步

建议严格按以下顺序：

1. 运行 `git status --short --branch` 和 `git worktree list`，确认现场未变化。
2. 阅读本文、新版设计说明和失败复盘。
3. 向用户确认新版书面设计说明是否通过。
4. 通过后编写 `docs/superpowers/plans/2026-07-27-intranet-web-workspace-redesign.md`。
5. 让用户审阅实施计划。
6. 创建新的隔离 Web 工作树。
7. 以第一纵向切片开始 TDD 实现。
8. 第一个可视化检查点完成后主动展示真实页面和截图。

不要在第 3 步获得确认之前开始大规模实现。

## 19. 完成定义

不能以“代码已写完”或“测试全绿”宣布产品完成。

只有同时满足以下条件，才可说对应切片完成：

- 用户能通过浏览器亲手完成约定场景。
- 页面符合已确认的白色 UI 结构。
- 示例数据能说明业务。
- 状态、证据和排期规则正确。
- 自动测试、类型检查和构建通过。
- 对应视觉截图经过用户验收。
- README、测试说明和已知限制与实际实现一致。

项目最终完成还需要全部业务切片、内网部署、安全评审、真实权限验证和公司试用反馈，不应在 Demo 阶段提前声称。
