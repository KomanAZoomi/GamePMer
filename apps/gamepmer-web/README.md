# GamePMer Web Demo

React + TypeScript + Vite 的内网工作台演示前端。

```powershell
npm install
npm run dev
npm test
npm run lint
npm run build
```

## Demo 数据与迁移

基础示例数据来自 `src/data/seed.ts`，浏览器数据键会随 schema 版本变化（当前为 `gamepmer.web-demo.v8`）。数据保存在浏览器 `localStorage`，因此不同浏览器配置、不同设备，以及 `localhost` 与 `127.0.0.1` 等不同来源之间不会自动同步。

在“设置中心 → 数据与运维”可以使用：

- **恢复示例数据**：回到覆盖多个模块的基础种子数据。
- **载入完整验收场景**：载入固定的 `CO-004 → SKF_A_3D_B52 → F-018 → 归档` 虚构业务线，用于跨模块验收。
- **导出当前数据**：下载 JSON 备份包；切换浏览器、设备或地址前应先导出。
- **导入数据**：先校验 JSON 格式、版本和必填集合，确认后整体替换当前 Demo 数据；不支持合并导入。

完整验收场景由源码构造，因此任何浏览器都能重新加载。JSON 备份包不是多人共享或服务端同步方案；演示数据和导出文件只应使用虚构、脱敏内容，并存放在公司内网批准的位置。

## 外观：暗色默认 + 完整亮色

2026-08-07 起视觉基线为双主题。设计语言参考
[octopus-kaogong-workbench](https://github.com/zhangyushaonao/octopus-kaogong-workbench)
（MIT License, Copyright 2026 张鱼烧脑🐙），只移植质感与结构手法，不含其任何业务内容。

- **切换**：顶栏圆钮三态循环（跟随系统 → 亮色 → 暗色）；设置中心「外观」分区可直接选定。
- **强调色**：五套（翡翠 / 静海 / 鸢尾 / 琥珀 / 绯樱），只改一个 HSL 色相通道，全站跟着走。
- **指标卡材质**：五套（语义 / 青蓝 / 霓虹 / 雨夜 / 铬金属），外加不透明度、模糊、
  流速三个滑块与「恢复默认参数」。第四张「可能延期」在所有材质下都保持暖色与琥珀边框——
  材质可以换，状态不能被换糊涂。
- **持久化**：`localStorage` 的 `gamepmer.appearance.theme` / `.accent` / `.metricPalette` / `.fluid`。
  只存在本机浏览器，不进业务数据，也不随「恢复示例数据」重置。
- **防闪烁**：`index.html` 的内联脚本在 CSS 加载前写入 `data-theme` / `data-theme-resolved` /
  `data-accent`。`<html>` 上写死暗色默认值，脚本失败时也不会没有主题。

### 令牌体系

全部色值集中在 `src/styles/tokens.css`：`:root` 承载暗色，
`html[data-theme-resolved="light"]` 承载亮色。两套共用同一批语义化 token 名
（`--surface-*` / `--text-*` / `--border-*` / `--accent-*`），因此 2000+ 处引用无需随主题改动。

强调色按 HSL 通道拆分：改 `--accent-h` 一个标量即可换整套配色，
`--accent-50` 到 `--accent-900` 由公式派生。新增一套强调色只需加一条
`html[data-accent="名字"] { --accent-h: … }`。

三组容易混淆的 token，改动前先分清：

| token | 角色 | 暗色下的约束 |
| --- | --- | --- |
| `--accent` | 线条 / 标记 / 无文字的纯色块 | 必须**亮**才看得见 |
| `--accent-fill` | 有浅色文字压在上面的填充底 | 必须**暗**才压得住（对比度 5.48） |
| `--cat-*` | 客户等待 / 依赖 / 项目段等**非状态**归类 | 刻意避开强调色、琥珀和克制红 |

### 文字与实心块：对比度在令牌层算好

四档文字色按 WCAG AA 定值，量的是**实测最不利的底**（暗色 `#1b241f` / 亮色 `#eff2ef`）。
最低一档取 4.8 而不是压着 4.5——这一档几乎全是 11–12px 的小字，
次像素抗锯齿会吃掉一点有效对比。层次靠亮度阶梯本身拉开，不靠把最低一档调到看不清。

任何「纯色块 + 压在上面的文字」都成对取值，不要只改一边：

- `--fill-ink-light` / `--fill-ink-dark` 是两支基础字色。
- 甘特条：`--bar-*` 配 `--bar-*-ink`，每种条各一对。`.gp-bar-label`
  读的是元素上的 `--bar-label-ink`，不是全局的 `--text-inverse`。
- 琥珀与克制红：承载文字时用 `--amber-fill` / `--danger-fill` 配
  `--ink-on-amber` / `--ink-on-danger`。不承载文字的圆点、进度条不用这一对。
- **渐变填充按最亮那个色标定色**。文字横跨整条渐变，浅的那一端压不住
  就等于半行字不达标——主按钮的 `--accent-fill-gradient` 就这么漏过一次。

### 字体：自托管 latin 子集

正文用 Geist Variable，编号与日期用 Geist Mono Variable，字形文件随包构建、不连外网
（内网工作台不能依赖 Google Fonts）。声明写在 `src/styles/fonts.css`，
**不要** import 包自带的 `index.css`：它会声明 5 个 unicode-range 子集，
产出 10 个 woff2，而这个应用只有拉丁字符需要它。当前 `dist/assets` 里恰好 2 个 woff2。

中日韩**不**换字体，`--font-sans` 尾部保留 `Microsoft YaHei UI` 等系统栈——
自带中文字形动辄几 MB，而系统中文字体在内网 Windows 上到处都有。

用可变字体而非静态字重，是因为 `--weight-medium: 550` 这类非标准字重要真实渲染，
静态字重下浏览器只能合成加粗，笔画会糊。

> Geist 比原来的系统字体宽约 8%。改动排版密集处（时间轴标签、品牌副标题、
> 表头）时先在 1280 下量一遍，不要沿用旧字宽调出来的数值。

### 阶段流的两种视图

首页「资产阶段流」默认**层叠**：当前阶段接近正面，前后阶段侧立可见，
支持滚轮、拖拽、方向键与 Home/End。位置是连续浮点数并做帧率无关的指数平滑，
计算规则是 `src/features/home/deckLayout.ts` 里的纯函数（19 个单测覆盖）。

刻意**没有**移植参考项目的 3D 环绕转盘与自动播放：转盘首尾相接会暗示阶段可循环，
而「下一阶段等上一阶段客户验收」是串行规则；自动播放会让一个需要人判断的业务视图自己动起来。
需要一次比对全部阶段日期时，切「平铺」。

平铺视图必须给 `.gp-deck-viewport` 保留 `min-width: 0`：它是 grid item，
默认 `min-width: auto` 会被 flex 轨道的 max-content 宽度顶开，
把内容撑出卡片边框、并把标题栏一起拉长，导致「层叠」按钮被推出可视区。
层叠视图下卡片是绝对定位、不参与固有宽度，所以这个坑只在平铺时暴露。
回归测试见 `e2e/stage-deck.spec.ts`。

### 版面溢出门禁

`e2e/layout-overflow.spec.ts` 对 10 个页面 × 1280/1440 逐元素检查两类问题：
内容横向溢出自己却不能滚、越出最近的裁剪祖先。改版面时它会先于肉眼发现问题。

**不要**用 `document.documentElement.scrollWidth` 判断有没有溢出——
`.gp-content` 自带 `overflow: auto`，会把子树的溢出吃掉，页面级检查一片绿但卡片已经被撑爆。

两个反复踩到的坑：

- `display: grid` 不写 `grid-template-columns` 时，列按 max-content 算，
  子项盒子会越出容器；父级 `overflow: hidden` 只是裁掉可见部分，盒子仍然出界。
  固定宽度的列里要写 `grid-template-columns: minmax(0, 1fr)`。
- `width: 100%` 配 `margin` 必然溢出父级。block 元素的 auto 宽度本来就会扣掉 margin。

**入场动画也会溢出，而「打开页面量一次」量不到。** `.gp-detail` 曾用
`translateX(8px) → 0` 入场，但它的宽度正好等于所在栅格列宽，那 420ms 会顶出列外，
于是每换一次选中项底部就闪一下横向滚动条。现在起手改成 `scale(0.99)`——
缩放只往里收，两个轴都不可能溢出。同名回归测试在动画进行中连续采样 700ms 取最大顶出量。

给右侧面板写入场动效时，默认选缩放或纯淡入；要用位移就先确认那一侧有可吃掉位移的空隙。

### 等宽数字与换页入场

`body` 上开了 `font-variant-numeric: tabular-nums`。探针跑下来，10 个页面上原有
30 类「以数字为主」的文本用的是比例数字——日期、编号、人天、金额、百分比、计数，
它们大多成列成行堆在一起，比例数字会让每一行宽度都不一样，扫读时列在抖。
选择开在根上而不是写 30 条选择器：这个产品里几乎没有长篇正文，每个数字都是业务数据。

**唯一的例外是首页日期轴 `.gp-axis-day`。** 那条轴用 `grid-auto-columns: 1fr`，
而 `1fr` 的自动最小值就是内容的 min-content 宽度，字一变宽轨道就撑不回去，
1280 下整条轴多出 33px 顶出卡片。何况那里每个日期各自居中在一条等宽轨道里，
对齐是网格给的不是字宽给的——等宽数字解决的是「靠字形宽度对齐」的场景。

换页时 `.gp-content > *` 走一次 240ms 淡入。**只做透明度，不做位移也不做缩放**：
transform 会让元素成为 `position: fixed` 后代的包含块，而录入抽屉正是 fixed 定位的，
在那 240ms 里打开抽屉会错位。opacity 只产生层叠上下文，不影响定位。

### 文字对比度门禁

`e2e/contrast.spec.ts` 对 10 个页面 × 亮/暗逐元素量文本对比度，按 WCAG AA 判定
（普通字 4.5、大字 3.0）。一轮全站审计一次捞出 170 处不达标，根因只有四个，全在令牌层：

| 根因 | 最差 | 修法 |
| --- | --- | --- |
| 两档次级文字色定得太浅 | 2.64 | 四档按实测最不利底重定 |
| 甘特/时间轴条的标签统一用近白色 | 1.33 | 底色字色成对，见上一节 |
| 主按钮渐变的浅端压不住白字 | 3.45 | 起手色标降一档 |
| 做成 `<button>` 的卡片没写 `background` | 1.61 | `base.css` 里给 `button` 归零 |

最后一条值得单独记：不写 `background` 的 `<button>` 会拿到 UA 的 `buttonface`，
暗色配色方案下是一块 `rgb(107 107 107)` 的中灰。任何被做成 button 的卡片、行、格子
都会莫名坐在灰底上，而各自的样式表通常只写了 border 和 padding。

写这个检测时有两个坑：

- **渐变底必须按最不利的色标算**，不能跳过。面板底色恰恰全是渐变，
  跳过等于放掉全站近一半的文字——第一版审计就是这么漏掉主按钮的。
- **先断言主题真的切过去了再量**。暗色是 `:root` 默认值，主题写不进去也不报错，
  「亮色」用例会在暗色下静默跑过。

## E2E 要跑构建产物

`playwright.config.ts` 的 `webServer` 指向 dev server，日常开发直接
`npm.cmd run test:e2e` 即可。但本机内存紧张时，Vite dev 模式「一个源文件一个请求」
会让 Chromium 网络栈耗尽资源，随机几条用例因 `net::ERR_INSUFFICIENT_RESOURCES`
加载不全而失败——看着像 UI 坏了，其实是环境。判断方法：单跑那个 spec 文件，
如果 100% 通过就是这个问题。对着构建产物跑可以完全避开：

```powershell
npm.cmd run build
npx vite preview --host 127.0.0.1 --port 5180 --strictPort   # 另开一个终端
npx playwright test                                          # reuseExistingServer 会复用它
```

## 跑测试时如果报 heap out of memory

`npm.cmd test` 会按 CPU 核数并行起 worker。空闲内存不足时（本机实测约 2GB 空闲）
并行峰值会触发 V8 `JavaScript heap out of memory`，与测试和实现都无关。串行跑即可：

```powershell
npx.cmd vitest run --no-file-parallelism
```

没有改 `package.json` 的默认值——内存宽裕时并行更快，不该为个别环境拖慢所有人。
