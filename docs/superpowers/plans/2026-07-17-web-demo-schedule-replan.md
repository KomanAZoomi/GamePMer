# GamePMer Web Demo Schedule Replan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an intranet-ready React Web demo that loads realistic game-art sample projects and lets a PM turn a pasted customer-feedback batch into manually adjustable, workday-aware schedule drafts and one confirmed revision batch.

**Architecture:** The browser app is a vertical slice with a repository boundary. `LocalDemoRepository` owns versioned seed data and local persistence; pure scheduling functions generate, move, cancel, and confirm drafts without mutating the baseline. React components render a schedule-first three-column workspace and keep temporary feedback/replan state in a feature store until the PM confirms it.

**Tech Stack:** React, TypeScript, Vite, CSS Modules, Vitest, React Testing Library, Playwright, browser localStorage, Pointer Events.

## Global Constraints

- Create the Web application in `apps/gamepmer-web`; do not modify or revive the old WPF implementation.
- The first load must show fictitious seed data for `P-3D-024`, `P-2D-018`, and `P-3D-031`; no blank-state-only demo is acceptable.
- UI language is Simplified Chinese. Do not include real customer names, messages, email addresses, network paths, API keys, or business data.
- The visual system is “制作工作室”: warm gray surfaces, sage primary actions, amber feedback/draft states, restrained red risk states.
- The schedule workspace is desktop-first with a minimum working width of 1280px; show an explicit narrow-screen notice below that width.
- Baseline dates are immutable. Drafts never mutate formal schedules. Only explicit confirmation persists a revision.
- Workday calculations exclude Saturday and Sunday; the calendar service must make overrides possible in a later milestone.
- The browser must never send mail, call chat APIs, or alter files; notifications are draft records only.
- Every business mutation starts with a failing test. “Tests pass” is not a demo acceptance claim without a seeded-data browser run.

---

## File Map

- `apps/gamepmer-web/package.json`: frontend scripts and locked dependency manifest.
- `apps/gamepmer-web/src/domain/model.ts`: project, asset, stage, feedback, draft, revision, and notification types.
- `apps/gamepmer-web/src/domain/workCalendar.ts`: pure workday helpers.
- `apps/gamepmer-web/src/domain/replan.ts`: draft generation, drag adjustment, cancel, and confirmation functions.
- `apps/gamepmer-web/src/data/seed.ts`: versioned fictional demo projects and feedback batch.
- `apps/gamepmer-web/src/data/LocalDemoRepository.ts`: localStorage load/save/reset boundary.
- `apps/gamepmer-web/src/features/workspace/workspaceStore.ts`: selected project/asset, feedback, drafts, and persistence orchestration.
- `apps/gamepmer-web/src/features/workspace/ScheduleWorkspace.tsx`: three-column schedule-first page.
- `apps/gamepmer-web/src/features/gantt/GanttTimeline.tsx`: date axis, rows, baseline/current/draft bars, today line, and pointer drag.
- `apps/gamepmer-web/src/features/feedback/FeedbackDrawer.tsx`: paste feedback, impact review, and confirmation action.
- `apps/gamepmer-web/src/features/revisions/RevisionHistory.tsx`: confirmed revision and notification-draft view.
- `apps/gamepmer-web/src/styles/tokens.css`: shared studio design tokens.
- `apps/gamepmer-web/src/styles/app.css`: layout and responsive notice styles.
- `apps/gamepmer-web/src/test/setup.ts`: test DOM setup.
- `apps/gamepmer-web/src/**/*.test.ts`: unit and component tests.
- `apps/gamepmer-web/e2e/replan.spec.ts`: seeded-data browser acceptance test.
- `apps/gamepmer-web/playwright.config.ts`: local Vite test server configuration.
- `docs/TESTING.md`: Web demo run, reset, and visual acceptance instructions.

## Task 1: Create the React demo shell and studio visual foundation

**Files:**

- Create: `apps/gamepmer-web/package.json`
- Create: `apps/gamepmer-web/vite.config.ts`
- Create: `apps/gamepmer-web/src/main.tsx`
- Create: `apps/gamepmer-web/src/App.tsx`
- Create: `apps/gamepmer-web/src/styles/tokens.css`
- Create: `apps/gamepmer-web/src/styles/app.css`
- Create: `apps/gamepmer-web/src/App.test.tsx`
- Create: `apps/gamepmer-web/src/test/setup.ts`

**Interfaces:**

- Consumes: no previous Web code.
- Produces: `App` renders the persistent navigation shell and a desktop-width notice; Task 5 mounts `ScheduleWorkspace` inside it.

- [ ] **Step 1: Write the failing shell test**

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the studio navigation and desktop workspace heading", () => {
  render(<App />);
  expect(screen.getByText("GamePMer")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
  expect(screen.getByText("项目排期")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails because the app does not exist**

Run: `npm run test -- --run src/App.test.tsx`

Expected: FAIL with a module-not-found error for `./App`.

- [ ] **Step 3: Scaffold Vite React TypeScript and add the minimal application shell**

Create the application with `npm create vite@latest apps/gamepmer-web -- --template react-ts`, then replace the generated app with this stable shell:

```tsx
export function App() {
  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="主导航">
        <strong>GamePMer</strong>
        <button type="button" className="nav-item">今日控制台</button>
        <button type="button" className="nav-item nav-item--active">项目排期</button>
        <button type="button" className="nav-item">反馈中心</button>
        <button type="button" className="nav-item">报价与结项</button>
      </aside>
      <main className="app-content"><h1>项目排期</h1></main>
      <div className="narrow-screen-notice">请使用宽度至少为 1280px 的桌面浏览器。</div>
    </div>
  );
}
```

Define tokens such as `--surface: #fbfaf6`, `--canvas: #f1f2ec`, `--primary: #59796f`, `--draft: #c48734`, `--danger: #c95b60`, and `--baseline: #acb1a6` in `tokens.css`. Use CSS media queries so `.narrow-screen-notice` is visible only below 1280px.

- [ ] **Step 4: Run the unit test and visual development server**

Run: `npm run test -- --run src/App.test.tsx`

Expected: PASS.

Run: `npm run dev`

Expected: a browser page with the warm-gray studio shell and project-schedule navigation.

- [ ] **Step 5: Commit the shell**

```powershell
git add apps/gamepmer-web
git commit -m "feat(web): add studio schedule workspace shell"
```

## Task 2: Define the demo model, seed projects, and workday rules

**Files:**

- Create: `apps/gamepmer-web/src/domain/model.ts`
- Create: `apps/gamepmer-web/src/domain/workCalendar.ts`
- Create: `apps/gamepmer-web/src/domain/workCalendar.test.ts`
- Create: `apps/gamepmer-web/src/data/seed.ts`
- Create: `apps/gamepmer-web/src/data/seed.test.ts`

**Interfaces:**

- Produces: `Project`, `Stage`, `FeedbackBatch`, `ScheduleDraft`, `RevisionRecord`, `NotificationDraft`, `createDemoState()`, and `moveByWorkdays(date, delta, calendar)`.
- Later tasks consume `DemoState` from `createDemoState()` and workday helpers from `workCalendar.ts`.

- [ ] **Step 1: Write failing workday and seed-data tests**

```ts
import { moveByWorkdays } from "./workCalendar";
import { createDemoState } from "../data/seed";

it("moves a Friday stage by one workday to Monday", () => {
  expect(moveByWorkdays("2026-07-17", 1)).toBe("2026-07-20");
});

it("creates the three required fictional projects and the replan feedback batch", () => {
  const state = createDemoState();
  expect(state.projects.map((project) => project.code)).toEqual(["P-3D-024", "P-2D-018", "P-3D-031"]);
  expect(state.feedbackBatches[0]).toMatchObject({ id: "F-017", projectCode: "P-3D-024", affectedStageCode: "3D_HIGH" });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- --run src/domain/workCalendar.test.ts src/data/seed.test.ts`

Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement immutable demo types, calendar helpers, and seed data**

Use ISO `YYYY-MM-DD` strings in the demo model:

```ts
export type StageCode = "2D_SKETCH" | "2D_DETAIL_50" | "2D_FINAL" | "3D_MID" | "3D_HIGH" | "3D_LOW" | "3D_BAKE" | "3D_TEXTURE" | "3D_LOD";
export type Stage = { code: StageCode; name: string; baselineStart: string; baselineFinish: string; currentStart: string; currentFinish: string; status: "normal" | "awaiting-client" | "rework"; clientApprovalDate?: string };
export type Asset = { id: string; name: string; production: "2D" | "3D"; stages: Stage[] };
export type Project = { id: string; code: string; name: string; client: string; assets: Asset[] };
export type FeedbackBatch = { id: string; projectCode: string; assetId: string; affectedStageCode: StageCode; pastedText: string; addedWorkdays: number; receivedAt: string };
export type DemoState = { schemaVersion: 1; projects: Project[]; feedbackBatches: FeedbackBatch[]; revisions: RevisionRecord[]; notificationDrafts: NotificationDraft[] };
```

Implement `isWorkday`, `moveByWorkdays`, and `countWorkdays` with Saturday/Sunday exclusion. Seed `MECH-01` with all six 3D PBR stages, a `F-017` feedback record on `3D_HIGH`, a normal 2D project, and a multi-asset normal 3D project.

- [ ] **Step 4: Run tests and inspect the seed state**

Run: `npm run test -- --run src/domain/workCalendar.test.ts src/data/seed.test.ts`

Expected: PASS. The state contains realistic non-empty project, stage, feedback, and risk data.

- [ ] **Step 5: Commit the demo domain**

```powershell
git add apps/gamepmer-web/src/domain apps/gamepmer-web/src/data
git commit -m "feat(web): add seeded art-production schedule model"
```

## Task 3: Implement draft generation and explicit confirmation semantics

**Files:**

- Create: `apps/gamepmer-web/src/domain/replan.ts`
- Create: `apps/gamepmer-web/src/domain/replan.test.ts`

**Interfaces:**

- Consumes: `DemoState`, `FeedbackBatch`, `Stage`, and workday functions.
- Produces: `generateReplanDraft(state, feedbackId)`, `moveDraftStage(draft, stageCode, delta)`, `confirmDraft(state, draft, reason, note)`, and `discardDraft(draft)`.

- [ ] **Step 1: Write failing draft safety tests**

```ts
it("generates downstream workday drafts without mutating formal current dates", () => {
  const state = createDemoState();
  const before = findStage(state, "MECH-01", "3D_LOW").currentStart;
  const draft = generateReplanDraft(state, "F-017");
  expect(draft.changes.find((change) => change.stageCode === "3D_LOW")?.newStart).toBe("2026-07-20");
  expect(findStage(state, "MECH-01", "3D_LOW").currentStart).toBe(before);
});

it("only updates current dates, revision history, and notification drafts after confirmation", () => {
  const state = createDemoState();
  const draft = generateReplanDraft(state, "F-017");
  const confirmed = confirmDraft(state, draft, "客户反馈延迟", "肩甲比例返修");
  expect(findStage(confirmed, "MECH-01", "3D_LOW").currentStart).toBe("2026-07-20");
  expect(confirmed.revisions).toHaveLength(1);
  expect(confirmed.notificationDrafts[0].recipients).toEqual(["组长", "美术总监"]);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- --run src/domain/replan.test.ts`

Expected: FAIL with missing exports from `replan.ts`.

- [ ] **Step 3: Implement pure draft operations**

Define a draft as an immutable list of old/new dates:

```ts
export type DraftChange = { assetId: string; stageCode: StageCode; oldStart: string; oldFinish: string; newStart: string; newFinish: string };
export type ScheduleDraft = { id: string; feedbackId: string; projectCode: string; changes: DraftChange[] };
```

`generateReplanDraft` moves the affected stage and every later unapproved stage by `feedback.addedWorkdays`. `moveDraftStage` changes only one draft row by full workdays and leaves formal data unchanged. `confirmDraft` creates a new state copy, applies every draft date to `currentStart/currentFinish`, appends one `RevisionRecord`, and creates one unsent `NotificationDraft`. `discardDraft` returns `undefined` and mutates nothing.

- [ ] **Step 4: Run the draft tests**

Run: `npm run test -- --run src/domain/replan.test.ts`

Expected: PASS. Baselines never change, cancel has no effect, and confirmation writes exactly one batch.

- [ ] **Step 5: Commit the domain behavior**

```powershell
git add apps/gamepmer-web/src/domain
git commit -m "feat(web): add safe workday replan drafts"
```

## Task 4: Add local demo persistence and workspace state orchestration

**Files:**

- Create: `apps/gamepmer-web/src/data/LocalDemoRepository.ts`
- Create: `apps/gamepmer-web/src/data/LocalDemoRepository.test.ts`
- Create: `apps/gamepmer-web/src/features/workspace/workspaceStore.ts`
- Create: `apps/gamepmer-web/src/features/workspace/workspaceStore.test.ts`

**Interfaces:**

- Consumes: `DemoState` and pure draft functions.
- Produces: `DemoRepository.load()`, `DemoRepository.save(state)`, `DemoRepository.reset()`, and `WorkspaceStore` actions `selectAsset`, `startFeedback`, `moveDraft`, `cancelDraft`, `confirmDraft`, and `resetDemo`.

- [ ] **Step 1: Write failing persistence and store tests**

```ts
it("restores confirmed changes after a repository reload", () => {
  const storage = new MemoryStorage();
  const repository = new LocalDemoRepository(storage);
  const changed = confirmSeededHighModelDraft(repository.load());
  repository.save(changed);
  expect(repository.load().revisions).toHaveLength(1);
});

it("cancels a draft without saving schedule changes", () => {
  const store = createWorkspaceStore(new LocalDemoRepository(new MemoryStorage()));
  store.startFeedback("F-017");
  store.cancelDraft();
  expect(store.getState().draft).toBeUndefined();
  expect(store.getState().demo.revisions).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- --run src/data/LocalDemoRepository.test.ts src/features/workspace/workspaceStore.test.ts`

Expected: FAIL with missing repository and store modules.

- [ ] **Step 3: Implement versioned local persistence and feature store**

Store only JSON under the exact key `gamepmer.web-demo.v1`. On malformed JSON or a mismatched `schemaVersion`, return a fresh `createDemoState()`. `reset()` removes that one key and returns a new seed state. Keep the store framework-free: expose `getState()`, `subscribe(listener)`, and action methods so React can consume it through `useSyncExternalStore` later.

- [ ] **Step 4: Run tests and manually verify browser persistence**

Run: `npm run test -- --run src/data/LocalDemoRepository.test.ts src/features/workspace/workspaceStore.test.ts`

Expected: PASS.

Run: `npm run dev`

Expected: after Task 6, refresh preserves one confirmed revision; “恢复示例数据” clears it.

- [ ] **Step 5: Commit persistence**

```powershell
git add apps/gamepmer-web/src/data apps/gamepmer-web/src/features/workspace
git commit -m "feat(web): persist seeded demo workspace state"
```

## Task 5: Build the schedule-first workspace and real date-axis Gantt

**Files:**

- Create: `apps/gamepmer-web/src/features/workspace/ScheduleWorkspace.tsx`
- Create: `apps/gamepmer-web/src/features/workspace/ScheduleWorkspace.test.tsx`
- Create: `apps/gamepmer-web/src/features/gantt/dateAxis.ts`
- Create: `apps/gamepmer-web/src/features/gantt/dateAxis.test.ts`
- Create: `apps/gamepmer-web/src/features/gantt/GanttTimeline.tsx`
- Create: `apps/gamepmer-web/src/features/gantt/GanttTimeline.test.tsx`
- Create: `apps/gamepmer-web/src/features/gantt/gantt.css`
- Modify: `apps/gamepmer-web/src/App.tsx`

**Interfaces:**

- Consumes: `WorkspaceStore`, selected `Project`, selected `Asset`, and optional `ScheduleDraft`.
- Produces: an accessible three-column workspace with asset selection and a horizontally scrollable timeline.

- [ ] **Step 1: Write failing date-axis and component tests**

```tsx
it("marks weekends and today on the date axis", () => {
  const days = buildDateAxis("2026-07-13", 10, "2026-07-17");
  expect(days.find((day) => day.date === "2026-07-18")?.isWeekend).toBe(true);
  expect(days.find((day) => day.date === "2026-07-17")?.isToday).toBe(true);
});

it("shows seed assets, PBR rows, baseline bars, current bars, and client approval markers", () => {
  render(<ScheduleWorkspace store={seededStore()} today="2026-07-17" />);
  expect(screen.getByText("MECH-01 机甲主角")).toBeInTheDocument();
  expect(screen.getByLabelText("3D 高模基准排期")).toBeInTheDocument();
  expect(screen.getByLabelText("3D 高模当前排期")).toBeInTheDocument();
  expect(screen.getByLabelText("3D 中模客户验收")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- --run src/features/gantt/dateAxis.test.ts src/features/workspace/ScheduleWorkspace.test.tsx`

Expected: FAIL with missing components and date-axis helpers.

- [ ] **Step 3: Implement the non-negotiable Gantt visual model**

`buildDateAxis(startDate, days, today)` returns `{ date, label, isWeekend, isToday }[]`. Render headers and rows with CSS Grid, using a `--day-width` CSS variable and `gridColumnStart/gridColumnEnd` computed from ISO dates. Do not use a fixed canvas width or arrow-only movement.

Render every stage row with these elements and accessible labels:

```tsx
<div aria-label={`${stage.name}基准排期`} className="gantt-bar gantt-bar--baseline" style={baselineStyle} />
<button aria-label={`${stage.name}当前排期`} className="gantt-bar gantt-bar--current" style={currentStyle}>{stage.name}</button>
{stage.clientApprovalDate && <span aria-label={`${stage.name}客户验收`} className="gantt-milestone" style={milestoneStyle} />}
```

The center panel must have month/week controls, weekend shading, a today line, horizontal scrolling, asset stage rows, and a legend. The left panel must select an asset; the right panel remains a placeholder health summary until Task 6.

- [ ] **Step 4: Run tests and perform the first visual gate**

Run: `npm run test -- --run src/features/gantt/dateAxis.test.ts src/features/gantt/GanttTimeline.test.tsx src/features/workspace/ScheduleWorkspace.test.tsx`

Expected: PASS.

Run: `npm run dev`

Expected: default screen visibly contains P-3D-024, all six PBR stages, dates, weekends, today, baseline/current bars, and an approval diamond without any manual data entry.

- [ ] **Step 5: Commit the usable schedule workspace**

```powershell
git add apps/gamepmer-web/src/App.tsx apps/gamepmer-web/src/features apps/gamepmer-web/src/styles
git commit -m "feat(web): add seeded schedule workspace and date-axis gantt"
```

## Task 6: Add feedback paste, direct draft dragging, confirmation, and history

**Files:**

- Create: `apps/gamepmer-web/src/features/feedback/FeedbackDrawer.tsx`
- Create: `apps/gamepmer-web/src/features/feedback/FeedbackDrawer.test.tsx`
- Create: `apps/gamepmer-web/src/features/gantt/useDraftBarDrag.ts`
- Create: `apps/gamepmer-web/src/features/gantt/useDraftBarDrag.test.ts`
- Create: `apps/gamepmer-web/src/features/revisions/RevisionHistory.tsx`
- Create: `apps/gamepmer-web/src/features/revisions/RevisionHistory.test.tsx`
- Modify: `apps/gamepmer-web/src/features/gantt/GanttTimeline.tsx`
- Modify: `apps/gamepmer-web/src/features/workspace/ScheduleWorkspace.tsx`

**Interfaces:**

- Consumes: `WorkspaceStore.startFeedback`, `moveDraft`, `cancelDraft`, and `confirmDraft`.
- Produces: manually entered feedback, visible amber draft bars, pointer/keyboard replan controls, one confirmation action, revision history, and notification drafts.

- [ ] **Step 1: Write failing interaction tests**

```tsx
it("shows feedback impact and amber downstream drafts without changing current bars", async () => {
  const user = userEvent.setup();
  render(<ScheduleWorkspace store={seededStore()} today="2026-07-17" />);
  await user.click(screen.getByRole("button", { name: "处理反馈 F-017" }));
  expect(screen.getByLabelText("3D 低模重排草案")).toBeInTheDocument();
  expect(screen.getByText("低模、烘焙、贴图")).toBeInTheDocument();
  expect(screen.getByLabelText("3D 低模当前排期")).not.toHaveClass("gantt-bar--draft");
});

it("moves only a draft by whole workdays and cancels without persistence", () => {
  const store = seededStore();
  store.startFeedback("F-017");
  store.moveDraft("3D_LOW", 1);
  expect(store.getState().draft?.changes.find((change) => change.stageCode === "3D_LOW")?.newStart).toBe("2026-07-21");
  store.cancelDraft();
  expect(store.getState().demo.revisions).toHaveLength(0);
});

it("confirms a batch and renders one revision plus an unsent notification draft", async () => {
  const user = userEvent.setup();
  render(<ScheduleWorkspace store={seededStore()} today="2026-07-17" />);
  await user.click(screen.getByRole("button", { name: "处理反馈 F-017" }));
  await user.type(screen.getByLabelText("修订说明"), "肩甲比例返修");
  await user.click(screen.getByRole("button", { name: "确认 3 项排期修订" }));
  expect(screen.getByText("修订批次 R-001")).toBeInTheDocument();
  expect(screen.getByText("通知草稿：组长、美术总监")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- --run src/features/feedback/FeedbackDrawer.test.tsx src/features/gantt/useDraftBarDrag.test.ts src/features/revisions/RevisionHistory.test.tsx`

Expected: FAIL with missing feature components and draft-bar controls.

- [ ] **Step 3: Implement direct-but-safe Gantt editing**

`FeedbackDrawer` has a text area prefilled with fictional `F-017` content and a “处理反馈 F-017” action. It calls `store.startFeedback("F-017")`; no formal stage changes occur.

For each draft bar, `useDraftBarDrag` converts Pointer Event horizontal movement to `Math.round(pixelDelta / DAY_WIDTH)` and calls `store.moveDraft(stageCode, workdayDelta)` only when the workday delta changes. Also render “提前一天” and “延后一天” buttons for keyboard access. Current and baseline bars remain read-only.

The drawer always displays source text, impacted stages, old/new date pairs, a fixed reason `客户反馈延迟`, a required note field, recipients `组长` and `美术总监`, and `取消草案` / `确认 N 项排期修订` actions. Confirmation calls `store.confirmDraft`; cancellation calls `store.cancelDraft`.

`RevisionHistory` renders confirmed revision IDs and the unsent notification draft only after successful confirmation.

- [ ] **Step 4: Run all unit/component tests and test the visual flow manually**

Run: `npm run test -- --run`

Expected: PASS.

Run: `npm run dev`

Manual expected flow: select `MECH-01`, process `F-017`, see amber low/bake/texture bars, move low model one workday, cancel and see no persistence, repeat, confirm, refresh, and see the confirmed revision/history.

- [ ] **Step 5: Commit the complete vertical slice**

```powershell
git add apps/gamepmer-web/src/features apps/gamepmer-web/src/data
git commit -m "feat(web): confirm feedback-driven gantt replanning"
```

## Task 7: Add browser acceptance, reset action, and demo handoff documentation

**Files:**

- Create: `apps/gamepmer-web/playwright.config.ts`
- Create: `apps/gamepmer-web/e2e/replan.spec.ts`
- Modify: `apps/gamepmer-web/src/features/workspace/ScheduleWorkspace.tsx`
- Modify: `docs/TESTING.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: complete seeded workspace and browser local persistence.
- Produces: one repeatable end-to-end browser test and a documented manual acceptance script.

- [ ] **Step 1: Write the failing browser acceptance test**

```ts
import { expect, test } from "@playwright/test";

test("feedback produces editable drafts and one persisted replan batch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("MECH-01 机甲主角")).toBeVisible();
  await page.getByRole("button", { name: "处理反馈 F-017" }).click();
  await expect(page.getByLabel("3D 低模重排草案")).toBeVisible();
  await page.getByLabel("修订说明").fill("肩甲比例返修");
  await page.getByRole("button", { name: "确认 3 项排期修订" }).click();
  await expect(page.getByText("修订批次 R-001")).toBeVisible();
  await page.reload();
  await expect(page.getByText("修订批次 R-001")).toBeVisible();
});
```

- [ ] **Step 2: Run the acceptance test and confirm it fails before Playwright configuration exists**

Run: `npm run test:e2e -- e2e/replan.spec.ts`

Expected: FAIL because the test script and local web server are not configured.

- [ ] **Step 3: Configure Playwright and add a visible restore-demo-data action**

Use a `webServer` command of `npm run dev -- --host 127.0.0.1` in Playwright config. Add a button labelled `恢复示例数据` that calls `store.resetDemo()` after a browser `confirm("确定恢复示例数据？")`; the action is deliberately visible so reviewers can restart the demo without developer tools.

Document exact commands:

```powershell
cd apps/gamepmer-web
npm install
npm run test -- --run
npm run test:e2e
npm run dev
```

Document the five-minute manual scenario and the privacy rule that all shipped seed data remains fictional.

- [ ] **Step 4: Run final checks and capture evidence**

Run: `npm run lint && npm run test -- --run && npm run test:e2e && npm run build`

Expected: all commands exit with code 0.

Capture a browser screenshot showing the seeded PBR schedule, amber drafts, and confirmation drawer. Confirm that reload preserves a confirmed revision and that “恢复示例数据” removes it.

- [ ] **Step 5: Commit demo readiness artifacts**

```powershell
git add apps/gamepmer-web docs/TESTING.md README.md
git commit -m "test(web): verify seeded feedback replan demo"
```

## Plan Self-Review

- Spec coverage: Tasks 1 and 5 implement the studio visual and schedule-first workspace; Task 2 guarantees realistic seed data; Task 3 guarantees immutable baseline and safe drafts; Task 4 provides browser persistence; Task 6 implements feedback-driven direct Gantt replan and notification drafts; Task 7 verifies the full browser flow and documents reset/acceptance.
- Scope check: connectors, server APIs, quoting, closeout, Excel, and real notifications are explicitly deferred, so this remains one independently demoable vertical slice.
- Placeholder scan: no task depends on an undefined function; each task defines the files, interfaces, failing test, command, minimal implementation boundary, verification, and commit.
- Type consistency: all schedule mutations flow through `ScheduleDraft`, `WorkspaceStore`, and `confirmDraft`; components never update `DemoState` directly.
