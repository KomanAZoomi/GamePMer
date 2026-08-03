import type { Clock } from '../../domain/clock'
import { createDemoClock } from '../../domain/clock'
import type { AxisScale } from '../../domain/gantt'
import type { StageRow } from '../../domain/conflicts'
import type {
  CloseoutGateCode,
  DemoState,
  EvidenceRef,
  QuoteLine,
  RevisionReason,
  ScheduleRevisionDraft,
  SourceChannel,
} from '../../domain/model'
import {
  applyFieldEdit,
  canConfirm,
  confirmCandidate as confirmInboxCandidate,
  ignoreCandidate as ignoreInboxCandidate,
  ingestText,
  restoreCandidate as restoreInboxCandidate,
} from '../../domain/inbox'
import { saveApiKey as persistApiKey } from '../../domain/settings'
import { disposeInsight, type DisposeInsightInput } from '../../domain/insightDisposition'
import { advanceStage, type StageAction } from '../../domain/stageFlow'
import {
  removePath as removeProjectPath,
  savePath as saveProjectPath,
  type SavePathInput,
} from '../../domain/projectPaths'
import {
  archiveCase as archiveCloseoutCase,
  completeGate as completeCloseoutGate,
  reopenGate as reopenCloseoutGate,
} from '../../domain/closeout'
import {
  abandonCase as abandonQuoteCase,
  createQuoteCase as createNewQuoteCase,
  deleteQuoteCase as removeQuoteCase,
  markNotEngaged as markQuoteNotEngaged,
  requoteCase as requoteQuoteCase,
  type CreateQuoteCaseInput,
  recordClientReply as recordQuoteClientReply,
  reviewQuote as reviewQuoteCase,
  sendKickoff as sendQuoteKickoff,
  sendToClient as sendQuoteToClient,
  submitQuoteVersion,
} from '../../domain/quotation'
import {
  removeHoliday as removeCalendarDay,
  removePerson as removeOrgPerson,
  removeProductionGroup as removeOrgGroup,
  saveHoliday as saveCalendarDay,
  savePerson as saveOrgPerson,
  saveProductionGroup as saveOrgGroup,
  type CalendarDayKind,
  type PersonDraft,
  type ProductionGroupDraft,
} from '../../domain/orgConfig'
import { confirmScheduleEntry as confirmEntry } from '../../domain/scheduleEntry'
import {
  classifyInScope,
  classifyNoChange,
  classifyOutOfScope,
  confirmReplan,
  generateReplanDraft,
  moveDraftStage,
  reclassifyFeedback,
  markNotificationSent,
  revokeRevision,
  unmarkNotificationSent,
} from '../../domain/replan'
import { EMPTY_CALENDAR } from '../../domain/workCalendar'
import { projectWorkItems, summarizeMetrics, type HomeMetrics, type WorkItem } from '../../domain/workItems'
import { LocalDemoRepository, type DemoRepository } from '../../data/LocalDemoRepository'

/**
 * 工作台 Store。
 *
 * 只保存「当前数据 + 用户在界面上的选择」，业务规则一律留在 domain 层。
 * 后续切片新增用例时应新建独立 Store 或用例函数，不要让这个文件长成全局巨型 Store。
 */

export interface WorkspaceState {
  demo: DemoState
  today: string
  selectedWorkItemId?: string
  selectedProjectCode: string
  selectedStageId?: string
  axisScale: AxisScale
  selectedFeedbackItemId?: string
  selectedCandidateId?: string
  inboxTab: InboxTab
  selectedQuoteCaseId?: string
  quoteTab: QuoteTab
  /**
   * 顶栏「新增需求」跳过来时置为 true，报价页据此直接把录入面板打开。
   * 跳过去还要自己再找一次按钮，那个入口就等于没接上。
   */
  quoteEntryIntent?: boolean
  selectedCloseoutCaseId?: string
  closeoutTab: CloseoutTab
  selectedPathProject?: string
  /** 排期草案只活在界面状态里，永不落盘——草案不污染正式数据 */
  draft?: ScheduleRevisionDraft
}

export type InboxTab = 'review' | 'blocked' | 'done'

/**
 * `mine` = 责任在 PM 自己的；`active` = 全部未终结（含等别人的）。
 * 原来按状态区间分桶，案件一过复核「处理中」就空了——按责任分才不会漏。
 */
export type QuoteTab = 'mine' | 'active' | 'done'

export type CloseoutTab = 'active' | 'ready' | 'archived'

export interface IngestRequest {
  text: string
  channel: SourceChannel
  subject?: string
  from?: string
  attachments?: string[]
}

export interface WorkspaceStore {
  getState(): WorkspaceState
  subscribe(listener: () => void): () => void
  selectWorkItem(id: string): void
  selectProject(code: string): void
  selectStage(stageId: string): void
  advanceStage(stageId: string, action: StageAction, note?: string): void
  setAxisScale(scale: AxisScale): void
  confirmScheduleEntry(
    projectCode: string,
    assetId: string,
    rows: StageRow[],
    reason: RevisionReason,
    note: string,
  ): void
  selectFeedbackItem(itemId: string): void
  classifyFeedback(itemId: string, scope: 'in-scope' | 'out-of-scope' | 'no-change'): void
  reclassifyFeedback(itemId: string): void
  revokeRevision(revisionId: string): void
  markNotificationSent(notificationId: string, via: string): void
  unmarkNotificationSent(notificationId: string): void
  startReplan(itemId: string): void
  moveDraft(stageId: string, deltaWorkdays: number): void
  cancelDraft(): void
  confirmDraft(note: string): void
  selectCandidate(candidateId: string): void
  setInboxTab(tab: InboxTab): void
  editCandidateField(candidateId: string, key: string, value: string): void
  confirmCandidate(candidateId: string): void
  ignoreCandidate(candidateId: string, reason: string): void
  restoreCandidate(candidateId: string): void
  ingestCandidate(request: IngestRequest): void
  selectQuoteCase(caseId: string): void
  setQuoteTab(tab: QuoteTab): void
  startQuoteEntry(): void
  clearQuoteEntryIntent(): void
  submitQuote(caseId: string, lines: QuoteLine[], scheduleImpactWorkdays: number): void
  reviewQuote(caseId: string, decision: 'approve' | 'reject', note: string): void
  createQuoteCase(input: Omit<CreateQuoteCaseInput, 'actor' | 'now'>): void
  sendToClient(caseId: string, via: string): void
  recordClientReply(caseId: string, decision: 'accept' | 'decline', via: string, note: string): void
  requoteCase(caseId: string, note: string): void
  abandonCase(caseId: string, note: string): void
  markNotEngaged(caseId: string, note: string): void
  deleteQuoteCase(caseId: string): void
  sendKickoff(caseId: string, via: string): void
  selectCloseoutCase(caseId: string): void
  setCloseoutTab(tab: CloseoutTab): void
  completeCloseoutGate(
    caseId: string,
    code: CloseoutGateCode,
    evidence: EvidenceRef[],
    note: string,
  ): void
  reopenCloseoutGate(caseId: string, code: CloseoutGateCode, reason: string): void
  archiveCloseoutCase(caseId: string): void
  selectPathProject(projectCode: string): void
  saveProjectPath(input: Omit<SavePathInput, 'actor' | 'now'>): void
  removeProjectPath(entryId: string): void
  saveApiKey(providerId: string, key: string): void
  disposeInsight(input: Omit<DisposeInsightInput, 'actor' | 'now'>): void
  resetDemo(): void
  /** 清空业务数据，保留制作组、工作日历与成员——没有它们工作台没法用 */
  clearBusinessData(): void
  saveProductionGroup(draft: ProductionGroupDraft): void
  removeProductionGroup(groupId: string): void
  saveCalendarDay(date: string, kind: CalendarDayKind): void
  removeCalendarDay(date: string, kind: CalendarDayKind): void
  savePerson(draft: PersonDraft): void
  removePerson(personId: string): void
}

const DEFAULT_PROJECT = 'NST_A_3D_B24'

function initialState(demo: DemoState, today: string): WorkspaceState {
  const items = projectWorkItems(demo, today)
  const first = items[0]
  return {
    demo,
    today,
    selectedWorkItemId: first?.id,
    selectedProjectCode: first?.projectCode ?? DEFAULT_PROJECT,
    selectedStageId: first?.stageId,
    axisScale: 'day',
    selectedCandidateId: demo.candidates.find((entry) => entry.status === 'NeedsReview')?.id,
    inboxTab: 'review',
    selectedQuoteCaseId: demo.quoteCases.find((entry) => entry.status === 'AwaitingReview')?.id,
    quoteTab: 'mine',
    selectedCloseoutCaseId: demo.closeoutCases.find((entry) => entry.status !== 'Archived')?.id,
    closeoutTab: 'active',
    selectedPathProject: demo.projects[0]?.code,
  }
}

export function createWorkspaceStore(
  repository: DemoRepository = new LocalDemoRepository(),
  clock: Clock = createDemoClock(),
): WorkspaceStore {
  let state = initialState(repository.load(), clock.today())

  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())

  const ACTOR = 'Brandon'
  /** 落盘 + 通知。领域层返回同一个引用（无变化）时什么都不做。 */
  const commit = (demo: DemoState) => {
    if (demo === state.demo) return
    repository.save(demo)
    state = { ...state, demo }
    emit()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    selectWorkItem(id) {
      const item = projectWorkItems(state.demo, state.today).find((entry) => entry.id === id)
      state = {
        ...state,
        selectedWorkItemId: id,
        // 选中待办同时把甘特定位到它所属的项目和阶段，避免两处上下文脱节
        selectedProjectCode: item?.projectCode ?? state.selectedProjectCode,
        selectedStageId: item?.stageId ?? state.selectedStageId,
      }
      emit()
    },
    selectProject(code) {
      if (code === state.selectedProjectCode) return
      state = { ...state, selectedProjectCode: code, selectedStageId: undefined }
      emit()
    },
    selectStage(stageId) {
      state = { ...state, selectedStageId: stageId }
      emit()
    },
    advanceStage(stageId, action, note) {
      // 领域层阻断时抛错且无副作用，让它冒泡——静默吞掉会显示虚假的成功
      const demo = advanceStage(state.demo, stageId, action, {
        actor: 'Brandon',
        now: clock.now(),
        note,
      })
      repository.save(demo)

      // 返修会新建一条待分流反馈项。把它选中再跳过去——
      // 否则人落在反馈中心的另一个批次上，还得自己找刚才那条
      const known = new Set(state.demo.feedbackBatches.flatMap((b) => b.items).map((i) => i.id))
      const created = demo.feedbackBatches
        .flatMap((batch) => batch.items)
        .find((item) => !known.has(item.id))

      state = {
        ...state,
        demo,
        selectedStageId: stageId,
        selectedFeedbackItemId: created?.id ?? state.selectedFeedbackItemId,
      }
      emit()
    },
    setAxisScale(scale) {
      state = { ...state, axisScale: scale }
      emit()
    },
    confirmScheduleEntry(projectCode, assetId, rows, reason, note) {
      // 领域层在有阻断时抛错且不产生副作用，这里让它冒泡——静默吞掉会让界面显示虚假的成功
      const demo = confirmEntry(state.demo, {
        projectCode,
        assetId,
        rows,
        reason,
        note,
        actor: 'Brandon',
        at: clock.now(),
      })
      if (demo === state.demo) return
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    selectFeedbackItem(itemId) {
      state = { ...state, selectedFeedbackItemId: itemId }
      emit()
    },
    classifyFeedback(itemId, scope) {
      const demo =
        scope === 'in-scope'
          ? classifyInScope(state.demo, itemId, clock.now(), 'Brandon')
          : scope === 'no-change'
            ? classifyNoChange(state.demo, itemId, clock.now(), 'Brandon')
            : classifyOutOfScope(state.demo, itemId, clock.now(), 'Brandon')
      repository.save(demo)
      state = { ...state, demo, selectedFeedbackItemId: itemId }
      emit()
    },
    reclassifyFeedback(itemId) {
      const demo = reclassifyFeedback(state.demo, itemId, clock.now(), 'Brandon')
      repository.save(demo)
      // 撤销判定时连带丢掉基于它生成的草案
      const draft = state.draft?.sourceFeedbackItemId === itemId ? undefined : state.draft
      state = { ...state, demo, draft, selectedFeedbackItemId: itemId }
      emit()
    },
    revokeRevision(revisionId) {
      const demo = revokeRevision(state.demo, revisionId, clock.now(), 'Brandon')
      repository.save(demo)
      state = { ...state, demo, draft: undefined }
      emit()
    },
    markNotificationSent(notificationId, via) {
      const demo = markNotificationSent(state.demo, notificationId, clock.now(), 'Brandon', via)
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    unmarkNotificationSent(notificationId) {
      const demo = unmarkNotificationSent(state.demo, notificationId, clock.now(), 'Brandon')
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    startReplan(itemId) {
      // 生成草案不写任何正式数据，因此不落盘
      state = {
        ...state,
        selectedFeedbackItemId: itemId,
        draft: generateReplanDraft(state.demo, itemId, state.today),
      }
      emit()
    },
    moveDraft(stageId, deltaWorkdays) {
      if (!state.draft) return
      const calendar = state.demo.calendars[0] ?? EMPTY_CALENDAR
      state = { ...state, draft: moveDraftStage(state.draft, stageId, deltaWorkdays, calendar) }
      emit()
    },
    cancelDraft() {
      // 丢掉草案就是全部撤销：正式计划从来没被碰过
      state = { ...state, draft: undefined }
      emit()
    },
    confirmDraft(note) {
      if (!state.draft) return
      const demo = confirmReplan(state.demo, {
        draft: state.draft,
        note,
        actor: 'Brandon',
        at: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo, draft: undefined }
      emit()
    },
    selectCandidate(candidateId) {
      state = { ...state, selectedCandidateId: candidateId }
      emit()
    },
    setInboxTab(tab) {
      state = { ...state, inboxTab: tab }
      emit()
    },
    editCandidateField(candidateId, key, value) {
      const demo = applyFieldEdit(state.demo, candidateId, key, value)
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    confirmCandidate(candidateId) {
      // 领域层在有阻断时抛错且不产生副作用；这里让它冒泡，界面绝不显示虚假的成功
      const { state: demo } = confirmInboxCandidate(state.demo, candidateId, {
        actor: 'Brandon',
        now: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo, selectedCandidateId: candidateId }
      emit()
    },
    ignoreCandidate(candidateId, reason) {
      const { state: demo } = ignoreInboxCandidate(state.demo, candidateId, {
        actor: 'Brandon',
        now: clock.now(),
        reason,
      })
      repository.save(demo)
      state = { ...state, demo, selectedCandidateId: candidateId }
      emit()
    },
    restoreCandidate(candidateId) {
      const { state: demo } = restoreInboxCandidate(state.demo, candidateId, {
        actor: 'Brandon',
        now: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo, selectedCandidateId: candidateId }
      emit()
    },
    ingestCandidate(request) {
      const { state: demo, candidate } = ingestText(state.demo, {
        text: request.text,
        channel: request.channel,
        subject: request.subject,
        from: request.from,
        attachments: request.attachments,
        now: clock.now(),
        actor: 'Brandon',
      })
      repository.save(demo)
      state = {
        ...state,
        demo,
        selectedCandidateId: candidate.id,
        // 跳到新候选实际所在的页签，免得用户以为导入失败了
        inboxTab:
          candidate.status === 'Duplicate' ? 'done' : canConfirm(demo, candidate) ? 'review' : 'blocked',
      }
      emit()
    },
    selectQuoteCase(caseId) {
      state = { ...state, selectedQuoteCaseId: caseId }
      emit()
    },
    setQuoteTab(tab) {
      state = { ...state, quoteTab: tab }
      emit()
    },
    submitQuote(caseId, lines, scheduleImpactWorkdays) {
      const quoteCase = state.demo.quoteCases.find((entry) => entry.id === caseId)
      const demo = submitQuoteVersion(state.demo, caseId, {
        lines,
        scheduleImpactWorkdays,
        submittedBy: quoteCase?.directorName ?? 'Evan',
        actor: 'Brandon',
        now: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    reviewQuote(caseId, decision, note) {
      // 领域层在有阻断时抛错且零副作用；这里让它冒泡，界面不显示虚假的成功
      const demo = reviewQuoteCase(state.demo, caseId, {
        decision,
        note,
        actor: 'Brandon',
        now: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    startQuoteEntry() {
      state = { ...state, quoteEntryIntent: true }
      emit()
    },
    clearQuoteEntryIntent() {
      if (!state.quoteEntryIntent) return
      state = { ...state, quoteEntryIntent: undefined }
      emit()
    },
    createQuoteCase(input) {
      const demo = createNewQuoteCase(state.demo, { ...input, actor: 'Brandon', now: clock.now() })
      const created = demo.quoteCases.at(-1)!
      repository.save(demo)
      // 立完案直接选中它，免得人还要去列表里翻自己刚录的那条
      state = { ...state, demo, selectedQuoteCaseId: created.id, quoteTab: 'active' }
      emit()
    },
    sendToClient(caseId, via) {
      const demo = sendQuoteToClient(state.demo, caseId, { actor: 'Leo（BD）', now: clock.now(), via })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    recordClientReply(caseId, decision, via, note) {
      const demo = recordQuoteClientReply(state.demo, caseId, decision, {
        actor: 'Leo（BD）',
        now: clock.now(),
        via,
        note,
      })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    requoteCase(caseId, note) {
      const demo = requoteQuoteCase(state.demo, caseId, {
        actor: 'Brandon',
        now: clock.now(),
        via: '内部决定',
        note,
      })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    abandonCase(caseId, note) {
      const demo = abandonQuoteCase(state.demo, caseId, {
        actor: 'Brandon',
        now: clock.now(),
        via: '内部决定',
        note,
      })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    markNotEngaged(caseId, note) {
      const demo = markQuoteNotEngaged(state.demo, caseId, {
        actor: 'Brandon',
        now: clock.now(),
        via: '内部决定',
        note,
      })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    deleteQuoteCase(caseId) {
      const demo = removeQuoteCase(state.demo, caseId, {
        actor: 'Brandon',
        now: clock.now(),
        via: '内部决定',
      })
      repository.save(demo)
      // 删掉的案件不能继续选中，否则详情区指向一个不存在的 id
      state = { ...state, demo, selectedQuoteCaseId: undefined }
      emit()
    },
    sendKickoff(caseId, via) {
      const demo = sendQuoteKickoff(state.demo, caseId, { actor: 'Brandon', now: clock.now(), via })
      repository.save(demo)
      state = { ...state, demo, selectedQuoteCaseId: caseId }
      emit()
    },
    selectCloseoutCase(caseId) {
      state = { ...state, selectedCloseoutCaseId: caseId }
      emit()
    },
    setCloseoutTab(tab) {
      state = { ...state, closeoutTab: tab }
      emit()
    },
    completeCloseoutGate(caseId, code, evidence, note) {
      // 领域层在有阻断时抛错且零副作用；让它冒泡，界面不显示虚假的成功
      const demo = completeCloseoutGate(state.demo, caseId, code, {
        actor: 'Brandon',
        now: clock.now(),
        evidence,
        note,
      })
      repository.save(demo)
      state = { ...state, demo, selectedCloseoutCaseId: caseId }
      emit()
    },
    reopenCloseoutGate(caseId, code, reason) {
      const demo = reopenCloseoutGate(state.demo, caseId, code, {
        actor: 'Brandon',
        now: clock.now(),
        reason,
      })
      repository.save(demo)
      state = { ...state, demo, selectedCloseoutCaseId: caseId }
      emit()
    },
    archiveCloseoutCase(caseId) {
      const demo = archiveCloseoutCase(state.demo, caseId, { actor: 'Brandon', now: clock.now() })
      repository.save(demo)
      state = { ...state, demo, selectedCloseoutCaseId: caseId, closeoutTab: 'archived' }
      emit()
    },
    selectPathProject(projectCode) {
      state = { ...state, selectedPathProject: projectCode }
      emit()
    },
    saveProjectPath(input) {
      // 领域层在路径不合法时抛错且零副作用；让它冒泡，界面不显示虚假的保存成功
      const demo = saveProjectPath(state.demo, { ...input, actor: 'Brandon', now: clock.now() })
      repository.save(demo)
      state = { ...state, demo, selectedPathProject: input.projectCode }
      emit()
    },
    removeProjectPath(entryId) {
      const demo = removeProjectPath(state.demo, entryId, { actor: 'Brandon', now: clock.now() })
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    disposeInsight(input) {
      // 领域层在阻断时抛错且无副作用，让它冒泡——静默吞掉会显示虚假的成功
      const demo = disposeInsight(state.demo, {
        ...input,
        actor: 'Brandon',
        now: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    saveApiKey(providerId, key) {
      // 只有后 4 位会进 state；完整 Key 在正式版提交给内网服务端密钥库
      const demo = persistApiKey(state.demo, {
        providerId,
        key,
        actor: 'Brandon',
        now: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    resetDemo() {
      state = initialState(repository.reset(), clock.today())
      emit()
    },
    clearBusinessData() {
      state = initialState(repository.clear(), clock.today())
      emit()
    },
    // 组织配置的六个用例形状一样：领域层校验不过就抛，界面照实显示，不静默吞掉
    saveProductionGroup(draft) {
      commit(saveOrgGroup(state.demo, { draft, actor: ACTOR, now: clock.now() }))
    },
    removeProductionGroup(groupId) {
      commit(removeOrgGroup(state.demo, groupId, { actor: ACTOR, now: clock.now() }))
    },
    saveCalendarDay(date, kind) {
      commit(saveCalendarDay(state.demo, { date, kind, actor: ACTOR, now: clock.now() }))
    },
    removeCalendarDay(date, kind) {
      commit(removeCalendarDay(state.demo, { date, kind, actor: ACTOR, now: clock.now() }))
    },
    savePerson(draft) {
      commit(saveOrgPerson(state.demo, { draft, actor: ACTOR, now: clock.now() }))
    },
    removePerson(personId) {
      commit(removeOrgPerson(state.demo, personId, { actor: ACTOR, now: clock.now() }))
    },
  }
}

/** 首页需要的派生数据集中在这里算，组件只负责渲染。 */
export interface HomeView {
  metrics: HomeMetrics
  items: WorkItem[]
  selected?: WorkItem
}

export function selectHomeView(state: WorkspaceState): HomeView {
  const items = projectWorkItems(state.demo, state.today)
  return {
    metrics: summarizeMetrics(state.demo, state.today),
    items,
    selected: items.find((item) => item.id === state.selectedWorkItemId) ?? items[0],
  }
}
