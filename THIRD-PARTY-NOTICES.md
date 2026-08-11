# 第三方材料声明

本仓库的 `LICENSE`（MIT）覆盖仓库内自行编写的源码与文档。下列材料不在 MIT 覆盖范围内，
或者虽可自由使用但需要保留原始署名。

## 1. 设计语言：octopus-kaogong-workbench

GamePMer 的暗色主题、设计令牌组织方式和面板质感直接借鉴自：

- 项目：[octopus-kaogong-workbench](https://github.com/zhangyushaonao/octopus-kaogong-workbench)
- 许可：MIT

具体借鉴的是**方法**而不是代码，没有复制其源文件：

| 借鉴点 | 在本仓库的落点 |
|---|---|
| 强调色按 HSL 通道派生，而不是逐个手调十六进制 | `apps/gamepmer-web/src/styles/tokens.css` 的 `--accent-h/s/l` 派生链 |
| 面板靠「渐变 + 顶部高光 + 软阴影」分层，而不是靠边框 | `--panel-*` 系列令牌与 `.gp-card` |
| 全站统一一条缓动曲线 | `--ease-out` |
| 暗色与亮色是两套完整方案，不是互相反色 | `tokens.css` 的 `:root` / `[data-theme]` 双份令牌表 |

按 MIT 要求，此处保留对原作者的署名。

## 2. 字体：Geist / Geist Mono

- 来源：[@fontsource-variable/geist](https://www.npmjs.com/package/@fontsource-variable/geist)、
  [@fontsource-variable/geist-mono](https://www.npmjs.com/package/@fontsource-variable/geist-mono)
- 版权：Vercel
- 许可：SIL Open Font License 1.1，允许自托管与内网分发

字体文件通过 npm 依赖引入，未提交进本仓库；`src/styles/fonts.css` 只声明实际用到的拉丁子集。
中文字形不由 Geist 提供，落到系统中文字体栈。

## 3. 设计参考截图（**不属于 MIT 覆盖范围**）

`docs/design-assets/2026-07-27-white-ui/screenshots/` 下文件名带 `reference-*-comparison` 的
六张 JPG，左半幅是**第三方商业产品的界面截图**，作为「本方案是否忠实延续了参考图结构」的
并排对照留档：

- `04-reference-gantt-comparison.jpg`
- `04-reference-gantt-comparison-v2.jpg`
- `04-reference-gantt-comparison-stacked.jpg`
- `05-reference-feedback-comparison.jpg`
- `06-reference-quotation-comparison.jpg`
- `07-reference-closeout-comparison.jpg`

这些截图的著作权属于其原始权利人，本仓库既不主张权利，也不以 MIT 授权他人使用；
它们只作为设计过程记录保留。任何再分发请自行确认权利状态。

## 4. 运行时与构建依赖

React、TypeScript、Vite、Vitest、Testing Library、Playwright 等依赖各自的许可以
`apps/gamepmer-web/package.json` 与 `package-lock.json` 记录的版本为准，均未复制进本仓库。

## 5. 示例数据

仓库内全部项目、客户、人员、邮件、路径和金额均为**虚构、脱敏**数据。
邮箱域名一律使用 RFC 保留的 `.example` / `.internal`，网络盘路径为虚构主机名
（`\\NAS-ART`、`\\NAS2`、`\\ARCHIVE`）。不含任何真实客户、真实员工或真实凭证信息。
