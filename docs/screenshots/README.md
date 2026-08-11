# 界面截图

十个导航模块 × 暗色 / 亮色，各一张 1440×900，全部来自**首次打开的示例数据**，没有摆拍。

## 怎么重新生成

```powershell
cd apps/gamepmer-web
npm.cmd run build
npx.cmd vite preview --host 127.0.0.1 --port 5180 --strictPort
npm.cmd run shots
```

脚本是 `apps/gamepmer-web/scripts/shoot-gallery.mjs`，输出**就地覆盖**这个目录——
README 里的链接因此不会失效，截图永远对应当前 HEAD。

三个要点写死在脚本里了：

- **跑构建产物，不要跑 dev server。** dev 模式每个模块一个 HTTP 请求，`networkidle` 不稳。
- **显式绑 `127.0.0.1`。** `vite preview` 默认可能只绑 IPv6，脚本连 `127.0.0.1` 会被拒。
- **切完主题必须校验 `data-theme-resolved`。** 暗色是 `:root` 默认值，
  切换失败会安静地退回暗色——不校验就会拍出两套一模一样的图。

## 目录

| # | 模块 | 暗色 | 亮色 | 这一页在演示什么 |
|---|---|---|---|---|
| 01 | 任务管理 | [图](01-tasks-dark.png) | [图](01-tasks-light.png) | 待办全部由正式状态投影生成；右侧智能详情带原始证据与「建议未执行」 |
| 02 | 项目总览 | [图](02-projects-dark.png) | [图](02-projects-light.png) | 按资产展开到每个可验收阶段，基准 / 当前 / 实际 / 等待客户四层日期同屏 |
| 03 | 候选收件箱 | [图](03-inbox-dark.png) | [图](03-inbox-light.png) | 逐字段置信度、原文可追溯、四步处理链，确认前不动任何正式数据 |
| 04 | 排期管理 | [图](04-schedule-dark.png) | [图](04-schedule-light.png) | 跨项目按制作组的组合排期、周容量、冲突检查区分「阻断」与「预警」 |
| 05 | 反馈中心 | [图](05-feedback-dark.png) | [图](05-feedback-light.png) | 「现在在等谁」三栏看板：等我处理 / 等团队提交 / 等客户反馈 |
| 06 | 报价与变更 | [图](06-quotation-dark.png) | [图](06-quotation-light.png) | 六步审批链、版本化报价、组长兼 BD 合并复核、冻结说明怎么解冻 |
| 07 | 结项中心 | [图](07-closeout-dark.png) | [图](07-closeout-light.png) | 五道串行证据门禁，跳步只看得到原因；出账资料自动汇总 |
| 08 | 文件与归档 | [图](08-files-dark.png) | [图](08-files-light.png) | 按批次登记六个盘位路径、编号逐段解析；只登记路径，不搬文件 |
| 09 | 智能分析 | [图](09-analytics-dark.png) | [图](09-analytics-light.png) | 客户等待与团队延期分开归因；每个数字能下钻到阶段，不下钻到个人 |
| 10 | 设置中心 | [图](10-settings-dark.png) | [图](10-settings-light.png) | 六个 LLM 预设、连接器审批门槛与替代路径、密钥边界写成表 |

## 为什么只有 1440

1280 和 1920 那两档是**溢出门禁**的事：`e2e/layout-overflow.spec.ts` 在
1280 / 1440 / 1920 三档 × 10 路由 × 2 主题共 60 组里逐元素量，比人眼看截图可靠得多。
这个目录只负责一件事——让人看清这个工作台长什么样。

## 和 `docs/design-assets/` 的关系

`docs/design-assets/2026-07-27-white-ui/` 是 7 月那批**白色原型**，是当时确认的设计基线，
作为设计过程留档保留。界面此后改成了暗色默认 + 完整亮色双主题，
**那批图不再代表现状**，看现状请看这个目录。
