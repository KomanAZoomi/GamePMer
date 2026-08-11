# GamePMer 视觉移植计划：octopus-kaogong-workbench 设计语言

> 建立日期：2026-08-07
> 分支/工作树：`feat/intranet-web-redesign` → `D:\Outgoing\GamePMer\.worktrees\intranet-web-redesign`
> 参考源：https://github.com/zhangyushaonao/octopus-kaogong-workbench （MIT License, Copyright 2026 张鱼烧脑🐙）

## 0. 目标与非目标

**目标**：把 kaogong 工作台的前端设计语言完整移植到 GamePMer，交付一个观感和交互效果与之同级的内网 PM 工作台。功能仍然全部是 GamePMer 的业务闭环。

**非目标**：
- 不移植 kaogong 的业务内容（考公题库、行测申论、岗位雷达）。
- 不移植 kaogong 的假控件模式（它把十几个按钮绑成同一句 toast）。
- 不移植 kaogong 的字号阶梯（它大量使用 8–11px，GamePMer 正文下限是 14px）。
- 不移植 3D 环绕转盘（循环语义与阶段串行规则冲突，已与用户确认改为侧向层叠）。

## 1. 已确认决定（2026-08-07 用户裁决）

| 决定项 | 结论 |
| --- | --- |
| 默认主题 | **暗色默认 + 完整亮色**，顶栏三态切换（跟随系统/亮/暗） |
| 中央卡片流 | **只做侧向层叠**（fan view），不做 3D 环绕转盘 |
| 交付范围 | **首页 + 外壳做深，其余 9 页靠 token 继承 + 修补** |

### 1.1 本计划推翻的既有规则

以下条目与 `CLAUDE.md` 现有文字冲突，按用户 2026-08-07 最新指令执行，实施完成后需同步更新规则文件：

- `CLAUDE.md` §2「桌面端优先……采用白色和浅暖灰层级」→ 改为暗色默认、亮色可切换。
- `docs/agent-state/CURRENT.md` §1「新版白色工作台设计已经通过书面审阅」→ 视觉基线变更。
- `docs/design-assets/2026-07-27-white-ui/` 降级为亮色主题的参考来源，不再是唯一视觉基线。

### 1.2 明确保留、不因本次移植破坏的规则

- 左侧导航保持完整展开（10 项），不折叠不删减。
- 不留假控件：动作要么真实可用，要么禁用并说明阻断原因。
- 正文实际渲染不小于 14px。
- 颜色不是唯一状态表达（暗色下更要保证形状/文字/图标同时表意）。
- 最低有效宽度 1280px（token 值 1264px 已扣除滚动条）。
- `Project → Asset → StagePlan` 业务树和全部业务不变量不受影响。

## 2. 现场事实（2026-08-07 核对）

- 工作树 `feat/intranet-web-redesign` 有 6 个已修改 + 6 个未跟踪文件，是一个**数据备份/恢复功能**（`DataOpsPanel`），共 48 行改动，与视觉移植正交。**全部视为用户资产，不提交、不还原、不覆盖。**
- `tokens.css` 的未提交修改只有一行：`--min-workspace-width: 1264px` 及其注释。**重写时必须原样保留。**
- CSS 规模：14 个文件约 7100 行。**`var(--)` 引用 2013 处，token 之外硬编码色值仅 34 处**——token 层是最大杠杆，重写它可自动改掉约 98% 的配色。
- 测试规模：单元 694、E2E 135。只有 2 处读计算样式，均不断言颜色；其中一处要求聚焦元素 `boxShadow` 非空 → `--focus-ring` 必须继续产出可见阴影。
- 首页结构与 kaogong 近乎同构，可直接对位改造：

| kaogong | GamePMer |
| --- | --- |
| 侧栏 brand/nav/vault/profile | `.gp-rail` |
| 顶栏 search + 圆钮 + 主按钮 | `.gp-topbar` |
| 四张流体指标卡 | `.gp-metrics`（今日待办/进行中/已完成/可能延期） |
| 分组可折叠队列 | `TaskBoard` |
| 中央卡片流 | `StageDeck`（资产阶段流） |
| 底部时间轴 | `HomeTimeline` |
| 右侧详情面板 | `SmartDetail` |
| 材质设置抽屉 | 设置中心新增「外观」分区 |

## 3. 工作树策略

**在 `.worktrees/intranet-web-redesign` 原地实施**，不新建隔离工作树。理由：本次移植必须改 `SettingsPage.tsx`（新增外观分区），而该文件有未提交改动；另开工作树必然在合并时冲突。

保护要求：
- 只改本计划列出的文件。
- 不执行 `git reset --hard`、破坏性 checkout/restore、`git clean`。
- 不提交、不推送，除非用户明确要求。
- 每阶段开始前重跑 `git status --short --branch` 确认未跟踪资产仍在。

## 4. 执行项

### 阶段 A — 设计令牌层重写（最大杠杆）

**已完成（2026-08-07）。**

改 `src/styles/tokens.css`：

1. **保留全部现有 token 名**，只重新取值——2013 处引用因此无需改动。
2. 引入 HSL 通道拆分的强调色体系：
   - `--accent-h` / `--accent-s` 标量 + `--accent-rgb`（空格分量，供 `rgb(var(--accent-rgb) / .16)`）
   - `--accent-50` … `--accent-900` 全部由 `hsl(var(--accent-h) …)` 派生
   - 现有语义别名 `--accent` / `--accent-hover` / `--accent-ink` / `--accent-soft` 等改为指向对应阶
3. `:root` 承载暗色取值；`html[data-theme-resolved="light"]` 承载亮色取值（沿用现有白色方案，不丢弃）。
4. 新增质感 token：`--panel-bg`（微渐变）、`--panel-inset`（顶部 1px 高光）、`--shadow-panel`、`--ease-out: cubic-bezier(.16, 1, .3, 1)`。
5. 保留 `--min-workspace-width: 1264px` 及注释。
6. `--focus-ring` 去掉硬编码 `#ffffff`，改为主题感知的双层环，且保证 box-shadow 非空（E2E 依赖）。
7. **字号阶梯原样不动**（14px 正文下限）。

**验证**：`npm.cmd run build` 通过；启动 dev 逐页肉眼确认没有「白底白字」类语义翻转事故。

### 阶段 B — 主题运行时

**已完成（2026-08-07）。**

- 新增 `src/domain/theme.ts`：`resolveTheme` / `nextTheme` / `isAccent` 等**纯函数**，注入式读取偏好，可测试。
- 新增 `src/features/appearance/` 薄封装：读写 `localStorage`（键 `gamepmer.theme`、`gamepmer.accent`），写 `document.documentElement.dataset`。
- `index.html` 加内联启动脚本，先写 `data-theme` / `data-theme-resolved` / `data-accent` 再加载 CSS，消除首屏闪烁。
- 顶栏加主题切换圆钮（三态循环，`aria-label` 同步）。
- `SettingsPage` 新增「外观」分区：强调色选择（5 套）+ 主题偏好，与既有 `DataOpsPanel` 并列，不改动其代码。
- 监听 `prefers-color-scheme` change，仅在 system 模式下响应。

**验证**：`theme.ts` 单元测试（三态循环、system 解析、非法值兜底）；刷新页面不闪白。

### 阶段 C — 外壳质感

**已完成（2026-08-07）。**

改 `src/styles/base.css`、`shell.css`：

- 面板三件套：`linear-gradient(145deg, …)` 微渐变 + `inset 0 1px` 顶部高光 + 大范围软阴影。
- 侧栏导航 active 态改为渐变高亮 + 细边框 + 投影；live-dot 指示当前页。
- 顶栏搜索框改胶囊 + 内阴影；圆形图标钮；主操作按钮用强调色渐变。
- 全站位移统一 `var(--ease-out)`。
- 滚动条在面板内部隐藏，页面本身不横滚。

**验证**：1280 宽度不出现横向滚动；键盘 Tab 焦点环在暗/亮两套下都可见。

### 阶段 D — 首页做深

**已完成（2026-08-07）。**

1. **四张流体指标卡**（`home.css` + `HomePage.tsx`）
   - `::before` 多层 `radial-gradient` + `blur()` + drift 动画，纯 CSS 零图片。
   - 四张各自配色与**相位错开**（修正 kaogong 只有半数生效的缺陷，四张都显式给 `animation-delay`）。
   - 指针驱动 `--pointer-x/y` 高光与 `--metric-rx/ry` 微倾斜（≤5°/7°）。
   - 「可能延期」卡保持风险色语义，不被材质淹没。
2. **StageDeck 侧向层叠**（新建 `src/features/home/useDeckPosition.ts` + 改 `StageDeck.tsx`）
   - 连续浮点位置 + 帧率无关指数平滑（移植 kaogong 的 `1 - Math.exp(-elapsed/170)` 手法）。
   - 位置计算抽成**纯函数**并单测；React 侧只写 CSS 变量，不拼 transform 字符串。
   - 滚轮 / 拖拽 / 方向键 / 点击切换；当前阶段高亮，前后阶段层叠可见。
   - **不做自动播放**（阶段流不是轮播内容）。
   - `prefers-reduced-motion` 降级为静态平铺。
   - 保留开关可回退平铺视图。
3. **TaskBoard**：分组折叠质感、状态点辉光、hover 态。
4. **HomeTimeline**：移植时间轴刻度、节点徽章、进度条辉光。
5. **SmartDetail**：右侧详情面板质感 + 切换时的 `detail-refresh` 入场动效 + 标签逐个 pop。

**验证**：单测覆盖层叠位置纯函数；首页在暗/亮两套 × 1280/1440/1920 截图；键盘可完成阶段切换。

### 阶段 E — 其余 9 页继承与修补

**已完成（2026-08-07）。**

- 把 34 处硬编码色值改为 token。
- 逐页（项目总览/排期/反馈/报价/结项/文件/分析/收件箱/设置）在暗+亮下检查，重点：甘特条四层日期色、状态徽章、表格斑马纹、抽屉与浮层。
- 甘特条颜色需在暗色下重新定值——`--bar-baseline` 等 6 个是形态+颜色双编码，不能只靠反色。

**验证**：逐页截图；确认颜色不是唯一状态表达。

### 阶段 F — 全量门禁

**已完成（2026-08-07）。**

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

加视觉验收：暗/亮 × 1280/1440/1920 × 首页与 9 个功能页截图；键盘焦点；`prefers-reduced-motion` 降级；页面缩放 125%。

## 5. 后续执行项

六个阶段全部完成。剩余为可选加深项，非本次交付范围：

- `TaskBoard` / `HomeTimeline` / `SmartDetail` 的细节动效（当前已继承面板质感，未单独加深）。
- 其余 9 页的逐页深度加工（当前靠 token 继承 + 分类色修补，观感一致但无专属效果）。
- **既有的 3 个 E2E 失败**（`full-line` ×2、`settings` ×1）与本次移植无关，已用 HEAD 基线工作树
  证明在改动前即失败；属于业务功能缺口，需另行处理。

## 6. 已完成项

- 通读 kaogong 仓库全部源码与截图，提炼可移植技术清单。
- 核对 GamePMer 现场：分支、工作树、未提交资产、CSS token 覆盖率、测试对样式的依赖。
- 取得三项产品决定（默认主题 / 卡片流形态 / 交付范围）。
- 建立本计划。
- **阶段 A**：`tokens.css` 重写为双主题 HSL 通道令牌层。补齐 5 个此前被引用但未定义的
  token（`--text-base` / `--weight-regular` / `--surface-raised` / `--warn-soft` / `--warn-ink`）。
  新增 `--accent-fill`：暗色下「线条色」与「填充底色」必须分离，否则近白文字糊在亮绿底上。
  证据：主按钮对比度 暗 5.48 / 亮 5.25，均过 WCAG AA；10 页 × 暗亮 × 1280/1440 无横向滚动。
- **阶段 B**：`domain/theme.ts` 纯函数 + 15 个单测；`features/appearance/useAppearance.ts`
  副作用层；`index.html` 内联防闪烁脚本；顶栏三态切换钮；设置中心「外观」分区（5 套强调色）。
  证据：三态循环、刷新持久化、首屏属性、强调色切换 `--accent → hsl(263 68% 52%)` 全部实测通过；
  全量单测 728 通过（原 713 无回归）、类型检查与构建通过。
- **阶段 C**：面板三件套（渐变+顶部高光+软阴影）、导航当前页渐变高亮 + 3px 左侧指示条、
  胶囊搜索框内阴影、主按钮强调色渐变、主题化滚动条、全站统一 `--ease-out`。
  补上此前从未定义的 `.gp-btn-quiet`。
- **阶段 D**：四张流体指标卡（纯 CSS 多层径向渐变 + blur + 漂移，四张相位与时长各异；
  指针驱动高光与 ≤4°/6° 微倾斜；配色绑定语义而非装饰，「可能延期」保持琥珀）。
  `StageDeck` 侧向层叠：`deckLayout.ts` 纯函数 + 19 个单测，`useDeckPosition` 驱动动画。
  修掉一个真实缺陷：React 的 `onWheel` 是被动监听器，`preventDefault` 失效导致滚轮既翻不动
  阶段又把整页滚走——改为 ref + `{ passive: false }` 原生监听。
- **阶段 E**：分类色 token 化（`--cat-sand/slate/plum/sage` 各含 soft/ink 三档，两套主题分别定值），
  外加 `--amber-soft-strong` / `--overlay-faint` / `--stripe-gap`。
  token 之外的硬编码色值从 34 处降到 0（余下均为有意为之：强调色预览需固定色相、中性内阴影）。
- **阶段 F**：暗/亮 × 1280/1440/1920 × 10 页 = **60 张截图，全部无横向滚动**。
  最终门禁：单测 747 通过、类型检查通过、构建通过、E2E 134 通过 / 3 个既有失败（与本次无关）。

## 6.1 用户验收反馈与返工（2026-08-07 第二轮）

用户指出两个问题，均已处理：

1. **平铺视图撑爆卡片，且切不回层叠。**
   根因：`.gp-deck-viewport` 是 grid item，缺 `min-width: 0`，被 flex 轨道的
   max-content 宽度从 554px 顶到 904px；grid 列被撑宽后连带把 `.gp-card-head` 拉长，
   「层叠」按钮从 x=934 推到 x=1284，跑出卡片可视区，只能刷新页面。
   层叠视图下卡片是绝对定位、不参与固有宽度，所以只在平铺时暴露。
   **我上一轮的验证方法本身有缺陷**：只查了 `documentElement.scrollWidth`，
   而 `.gp-content` 自带 `overflow: auto`，把溢出吃掉了，所以测不出来。
   已补回归测试 `e2e/stage-deck.spec.ts`（先失败后修复），改为断言
   视口宽度 ≤ 卡片宽度、卡片右边界 ≤ 工作区右边界、「层叠」按钮在视口内且可点击。

2. **配色单调。** 第一版把四张指标卡都绑到同一个强调色的不同透明度上，
   结果是四块深浅不一的绿。已补五套可切换材质（语义 / 青蓝 / 霓虹 / 雨夜 / 铬金属），
   每套给前三张卡三个互相区分得开的色相；另加不透明度、模糊、流速三个滑块
   与「恢复默认参数」，对应参考项目的材质抽屉。
   保留的约束：第四张「可能延期」在所有材质下都走暖色，边框与注释仍是琥珀。
   证据：五套材质实测 `--fluid-a` 取值互不相同，且第四张恒为 `rgb(224 160 63 / 46%)`。

## 6.2 第三轮：修正验证方法后补捞出的溢出（2026-08-07）

上一轮的溢出检查只看 `document.documentElement.scrollWidth`，被 `.gp-content` 的
`overflow: auto` 挡住，所以「60 张截图无横滚」这个结论是用坏检测器得出的。
重写检测逻辑为**逐元素**两类判定后，又捞出 5 处：

| 位置 | 症状 | 根因 |
| --- | --- | --- |
| `.gp-batch-card` | 父级溢出 8px | `width: 100%` 与自身 `margin` 叠加 |
| `.gp-item-table` | 1280 下溢出 32px | 表格 min-content 超过容器，无滚动出口 |
| `.gp-combo-project` | 溢出 3px | 缺省略号收口 |
| `.gp-combo-stage > small` | 越界 4px | grid 无显式列 → 列按 max-content 算 |
| `.gp-gate-form label` | 越界 3px | 同上，被 `<select>` 最长选项撑开 |

后两条是同一个易踩的坑：**`display: grid` 不写 `grid-template-columns` 时列按
max-content 算**，子项盒子会越出容器；父级的 `overflow: hidden` 只是把越出部分裁掉，
盒子本身仍然出界。`min-width: 0` 只约束元素自己的盒子，管不到它内部的列，
必须写 `minmax(0, 1fr)`。

检测逻辑已固化为 `e2e/layout-overflow.spec.ts`：10 页 × 1280/1440 共 20 项门禁，
逐元素检查「内容溢出自己且不可滚」与「越出最近的裁剪祖先」，2px 容差。
另有 `e2e/stage-deck.spec.ts` 3 项守住阶段流两视图。

同轮补齐阶段 D 剩余：任务看板当前条目辉光与分组计数底色、时间轴今天线辉光与等宽数字、
智能详情换选中项时的入场动效（靠 `key={item.id}` 让 React 重建以重放动画）。

## 6.3 第四轮：修掉三个既有 E2E 失败（2026-08-07）

前几轮一直标注为「与本次移植无关的既有失败」，本轮查清并修复。
**三个都是测试过时，UI 是对的**——所以改的是测试，不是实现：

| 用例 | 测试期望 | 实际（正确的）实现 |
| --- | --- | --- |
| `settings.spec.ts` 成员与角色 | 一个叫「成员与角色」的导航分区 + `.gp-merge-note` | 这块在「组织配置」里；`.gp-merge-note` 是报价页复核轨的类名 |
| `full-line.spec.ts` 第三段 | 「确认不接入」按钮与「放弃变更」同时可见 | 两者是互斥分支：变更案件走「放弃变更 · 解冻阶段」，首次报价才走「确认不接这单 · 可删除」；第三条出路是对开工前任何状态开放的「作废」 |
| `full-line.spec.ts` 第四段 | 点「确认不接入」→「删除这张案件」 | 作废走 `markNotEngaged`，按钮是「作废并释放编号」；删除是独立第二步，按钮是「彻底删除这张案件」 |

判定依据：领域层 `markNotEngaged` 与 `NotEngaged` 状态一直都在且有单测；
`QuotationPage.tsx` 的代码注释写明了「作废对开工前任何阶段开放」的设计理由；
对应的单元测试（`SettingsPage.test.tsx`、`QuotationPage.test.tsx`）全部通过。
是 `5fde3c5`、`ded6bec` 两次演进细化了出路，E2E 停留在旧版文案。

**E2E 现状：160 项全部通过，零失败。**

## 6.4 已知环境限制

`npm.cmd test` 默认按 CPU 核数并行起 worker。本机当前空闲内存约 2GB
（16GB 中大部分被其他应用占用），并行峰值会触发
`FATAL ERROR: ... JavaScript heap out of memory`——**不是测试或实现的问题**：

```powershell
npx.cmd vitest run --no-file-parallelism   # 串行跑，754 全过
```

内存宽裕时默认并行同样通过。不改 `package.json` 的默认值，以免拖慢正常环境。

## 6.5 第五轮：前端审计整改（2026-08-10）

用户要求装 `taste` skill 再审前端，审计结论逐条整改。
自托管子集字体经用户单独确认后采纳，其余照改。

| # | 改动 | 文件 | 验证 |
| --- | --- | --- | --- |
| 1 | 自托管 Geist / Geist Mono 可变字体，只声明 latin 子集 | 新增 `src/styles/fonts.css`，`tokens.css` 的 `--font-sans`/`--font-mono` | `dist/assets` 只有 2 个 woff2（23.1KB + 29.4KB）；引包自带的 `index.css` 会声明 5 个 unicode-range 子集、产出 10 个 |
| 2 | 中日韩仍走系统字体栈 | `--font-sans` 尾部保留 `Microsoft YaHei UI` 等 | 探针实测：拉丁文宽度 472 vs 438（换了字体），中文 280 vs 280（没换） |
| 3 | 用可变字体而不是静态字重 | `fonts.css` 用 `wght` 轴 | `--weight-medium: 550` 是真实渲染，不是浏览器合成加粗 |
| 4 | 按钮/导航/页签补 `:active` 态 | `base.css`、`shell.css` | 手动点击确认按下有位移反馈 |
| 5 | 阴影带强调色色相，不是纯黑叠加 | `tokens.css` 的 `--shadow-card` / `--shadow-float` | 双主题截图目视 |
| 6 | z-index 收成一套具名标尺 | `tokens.css` 的 `--z-deck-card` … `--z-drawer` | 全站搜不到裸数字 z-index |
| 7 | 接上 favicon 与 meta description | `index.html` | 标签页图标不再是浏览器默认 |
| 8 | 加「跳到主内容」跳过链接 | `AppShell.tsx`、`shell.css` | 第一次 Tab 即可跳过十项导航 |
| 9 | 删掉已无引用的死资源 | `public/icons.svg`、`src/assets/{hero.png,react.svg,vite.svg}`、`src/index.css` | 删前逐个确认零引用 |

### 换字体引发的两处回归（同轮修掉）

Geist 比原系统字体宽约 8%，两处按旧字宽调过的地方被挤爆：

- **时间轴标签溢出 +3px**。第一版修法把资产编号截成了 `MECH-...`，把最该看的信息截掉了。
  改为 `.gp-timeline-label strong { flex: 0 0 auto }`——资产编号不参与收缩，让项目编号先让位。
- **品牌副标题折成两行**。`.gp-brand span` 字距 `0.08em → 0.05em` 并 `white-space: nowrap`。

### 智能详情入场动画顶出栅格列（本轮新查出）

`.gp-detail` 的入场动画是 `translateX(8px) → 0`，但这张卡的宽度**正好等于**它所在的栅格列宽，
于是那 420ms 会顶出列外 8px；`.gp-content` 是 `overflow: auto`，
每换一次选中项底部就闪一下横向滚动条。

原有的溢出门禁没抓到，因为它是「打开页面 → 量一次」，量到的是动画结束后的静止态。
只有沿真实路径走（任务管理 → 点导航进项目总览）才会重放入场动画。

- 修法：起手改成 `scale(0.99)`。缩放只会往里收，两个轴都不可能溢出。
- 回归测试：`layout-overflow.spec.ts` 新增「智能详情入场动画不把卡片顶出栅格列」，
  在动画进行中用 `requestAnimationFrame` 连续采样 700ms 取最大顶出量。
  **先验证过它在旧动画下确实失败（+8px），再改的实现。**

### 本轮验证结果

| 门禁 | 结果 |
| --- | --- |
| `tsc --noEmit` | 通过 |
| `vitest run --no-file-parallelism` | 39 个文件 / 754 项全过 |
| `vite build` | 通过，dist 内 woff2 恰好 2 个 |
| `playwright test` | **161 项全过**（原 160 + 本轮新增回归 1） |
| 溢出审计 1280/1440/1920 × 亮/暗 × 10 页 | 60 个组合全过 |

### E2E 必须跑构建产物，不是 dev server

全量 E2E 首次跑出 2 条 analytics 失败，单跑该文件却 14/14 通过。
解压失败用例的 trace 看到 16 条 `net::ERR_INSUFFICIENT_RESOURCES`——
Vite dev 模式下每个源文件都是一个独立请求，本机内存紧张时 Chromium 网络栈耗尽资源，
部分模块加载失败导致页面渲染不全。**不是实现问题**。

改成对着构建产物跑，161 项全过：

```powershell
npm.cmd run build
npx vite preview --host 127.0.0.1 --port 5180 --strictPort   # 另开一个终端
npx playwright test                                          # 配置里 reuseExistingServer 会复用它
```

`playwright.config.ts` 的 `webServer` 仍指向 dev server，没有改动——
内存宽裕时 dev 模式同样能过，改默认值会让日常开发少掉 HMR。

## 6.6 第六轮：剩余 9 页做深，实际做成了全站对比度整改（2026-08-10）

原计划是逐页补质感。先截了 9 页看现状，页面本身状态比预期好——
问题不在「哪一页没做深」，而在**跨全站的可读性**，肉眼扫不出来（每一处单看都「还行」）。
于是改成量：写脚本对 10 页 × 亮/暗逐元素算 WCAG 对比度。

**一次捞出 170 处不达标，根因只有四个，全在令牌层。**

| 根因 | 最差 | 覆盖面 | 修法 |
| --- | --- | --- | --- |
| 四档文字色里有三档不达标 | 亮色 2.64 | ~160 处 | 按**实测**最不利底重定，不按 token 表推算 |
| 甘特/时间轴条标签统一取近白 | 暗色 1.33 | 8 处 | `--bar-*` 配 `--bar-*-ink` 成对定值 |
| 主按钮渐变浅端压不住白字 | 3.45 | 每页 1 处 | 起手色标 `--accent-600 → --accent-700` |
| `<button>` 卡片没写 `background` | 1.61 | 反馈中心批次卡 | `base.css` 给 `button` 归零 background |

三条值得记住的判断：

- **第一版按 token 表上最极端的表面推算最不利底，实测仍有 4.4x 的漏网。**
  改成拿审计跑出来的实测值反推（暗色 #1b241f / 亮色 #eff2ef）才收干净。
- **亮色只把最低两档拉到 AA 会把四档挤成三档**（secondary 和 muted 的 HSL 亮度
  差不到 3%）。所以 secondary 一起往下压，整条阶梯重排成 18 / 27 / 36 / 43。
- **`<button>` 的 UA `buttonface` 在暗色下是 `rgb(107 107 107)`。**
  这不是配色问题，是漏了一条 reset；任何做成 button 的卡片都会中招。

### 门禁固化

新增 `e2e/contrast.spec.ts`（20 项 = 10 页 × 2 主题）。两个必须坚持的细节：

- **渐变底按最不利色标算**。第一版审计脚本直接跳过渐变底，
  等于放掉全站近一半文字——主按钮那条正是这么漏的。加上渐变解析后
  20 项全红，才暴露出来。
- **先断言 `data-theme-resolved` 再量**。暗色是 `:root` 默认值，
  主题写不进去也不报错，「亮色」用例会在暗色下静默跑过（这个坑本项目踩过一次）。

### 本轮验证结果

| 门禁 | 结果 |
| --- | --- |
| `tsc --noEmit` | 通过 |
| `vitest run --no-file-parallelism` | 39 文件 / 754 项全过 |
| `playwright test` | **181 项全过**（161 + 本轮新增 20） |
| 对比度审计 10 页 × 2 主题 | 170 → **0** 处不达标 |
| 溢出审计 3 档宽 × 2 主题 × 10 页 | 60 个组合全过 |

### 与原计划的偏差

阶段 E 原本写的是「其余 9 页继承与修补」，本轮没有逐页加质感，
而是把预算花在了跨页的可读性上。理由：截图审阅显示 9 页的结构与密度已经成立，
真正拖后腿的是全站性的对比度，且它有客观判据、可以固化成门禁。
逐页的质感深做仍然待办。

## 6.7 第七轮：等宽数字与换页入场（2026-08-10）

继续做深剩余 9 页。先按样式表统计各文件的 `:hover` / `animation` / `box-shadow` /
`tabular-nums` 数量，想找出「哪一页没上质感」。

**这个统计有误导性，中途纠正过来了**：`.gp-card` 等共享类携带了面板质感，
所以「analytics.css 里 0 个 box-shadow」不等于分析页没有阴影——截图上卡片质感明明成立。
按文件计数会把共享样式算成缺失。**没有据此虚构差距**，只做了两条经探针实证的：

| 改动 | 证据 | 结果 |
| --- | --- | --- |
| `body` 开 `font-variant-numeric: tabular-nums` | 探针查出 10 页共 30 类「以数字为主」的文本用比例数字 | 30 类 → 1 类 |
| `.gp-content > *` 240ms 淡入 | 此前只有首页有入场动效，其余 9 页换页是硬切 | 10 页统一 |

两处判断：

- **等宽数字留了一个故意的例外**：首页日期轴 `.gp-axis-day`。
  那条轴是 `grid-auto-columns: 1fr`，`1fr` 的自动最小值等于内容 min-content 宽度，
  字一变宽轨道撑不回去，1280 下整条轴多出 33px 顶出卡片（溢出门禁当场抓到）。
  而且那里对齐是网格给的、不是字宽给的，等宽本来就买不到东西。
- **换页入场只做透明度**。transform 会让元素成为 `position: fixed` 后代的包含块，
  录入抽屉正是 fixed 定位，在那 240ms 里打开抽屉会错位。

### 本轮验证结果

| 门禁 | 结果 |
| --- | --- |
| `tsc --noEmit` | 通过 |
| `vitest run --no-file-parallelism` | 39 文件 / 754 项全过 |
| `playwright test` | 181 项全过 |
| 对比度审计 | 0 处不达标 |
| 溢出审计 60 组合 | 全过（等宽数字一度撑出 33px，加例外后归零） |

### 仍然待办

逐页的质感深做（把某一页像首页那样重新组织材质与信息密度）仍未做。
本轮的结论是：**在有客观判据的地方（对比度、等宽、溢出）已经收干净了，
剩下的属于审美判断，需要先拿到用户对当前观感的反馈再决定往哪个方向加。**

## 7. 阻塞项与风险

| 风险 | 应对 |
| --- | --- |
| 语义 token 反转事故（如 `--surface-card: #fff` 在暗色下变白底白字） | token 名是语义化的（surface/text/border），整体反转即可；阶段 A 结束逐页肉眼扫一遍 |
| 甘特图四层日期色在暗色下辨识度下降 | 阶段 E 单独重新定值，保持形态编码不变 |
| 流体材质在密集数据页干扰可读性 | 材质只用于首页四张指标卡，不铺到表格与甘特 |
| 与未提交的 DataOps 功能冲突 | 只在 `SettingsPage` 新增并列分区，不改其代码；每阶段前查 `git status` |
| E2E 焦点环断言 | `--focus-ring` 保证 box-shadow 非空 |
| 暗色长时间阅读疲劳 | 亮色主题完整保留，一键切换 |

**当前无阻塞项。**
