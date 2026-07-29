import type { RouteKey } from '../app/navigation'
import { PATH_KIND_LABEL } from './projectPaths'
import type { DemoState } from './model'

/**
 * 全局搜索。
 *
 * 顶栏那个输入框原来是个空壳：能打字、有占位符、什么都不接。
 * 占位符写着「搜索任务、项目、资产、文件路径」，那就得真能搜到这四类。
 *
 * 三条自我约束：
 *
 * 1. **搜不到就是搜不到。** 不做模糊补全、不返回「你是不是想找」的近似结果——
 *    PM 拿着一个编号来搜，给他一个别的编号比给空结果更坏。
 * 2. **每条结果必须能跳。** 没有跳转目标的结果是个死链，不如不出现。
 * 3. **不按人名建索引。** 技术上当然搜得了，但那样它就成了「查某某人手上有什么活」
 *    的入口，和「统计不下钻到个人」是一个道理。
 *
 * 这一层是纯投影，只读 state，不改任何数据。
 */

export type SearchKind =
  | 'project'
  | 'asset'
  | 'stage'
  | 'feedback'
  | 'candidate'
  | 'quote'
  | 'closeout'
  | 'path'

export interface SearchHit {
  id: string
  kind: SearchKind
  title: string
  subtitle: string
  /** 命中的是哪个字段，界面上说清楚，免得用户不懂为什么这条会出现 */
  matchedOn: string
  route: RouteKey
  /** 跳过去之后要选中的记录 id */
  selectId: string
}

export const SEARCHABLE_KINDS: Array<{ kind: SearchKind; label: string }> = [
  { kind: 'project', label: '项目' },
  { kind: 'asset', label: '资产' },
  { kind: 'stage', label: '阶段' },
  { kind: 'feedback', label: '反馈' },
  { kind: 'candidate', label: '候选' },
  { kind: 'quote', label: '报价' },
  { kind: 'closeout', label: '结项' },
  { kind: 'path', label: '路径' },
]

export const SEARCH_KIND_LABEL = Object.fromEntries(
  SEARCHABLE_KINDS.map((entry) => [entry.kind, entry.label]),
) as Record<SearchKind, string>

/** 一个字符会命中几乎所有东西，那种结果没有任何用 */
export const SEARCH_MIN_LENGTH = 2
export const SEARCH_RESULT_LIMIT = 12

interface Candidate {
  hit: Omit<SearchHit, 'matchedOn'>
  /** 按权重从高到低排列的可匹配字段 */
  fields: Array<{ label: string; value: string; weight: number }>
}

/** 编号权重最高：拿编号来搜的人要的就是那一条 */
const W_CODE = 100
const W_NAME = 60
const W_TEXT = 30

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function searchAll(state: DemoState, rawQuery: string): SearchHit[] {
  const query = normalize(rawQuery)
  if (query.length < SEARCH_MIN_LENGTH) return []

  const scored: Array<{ hit: SearchHit; score: number }> = []

  for (const candidate of collect(state)) {
    let best: { label: string; score: number } | undefined

    for (const field of candidate.fields) {
      const value = normalize(field.value)
      if (!value) continue
      const at = value.indexOf(query)
      if (at < 0) continue

      // 完全相等 > 开头命中 > 中间命中；同等情况下字段权重说了算
      const position = value === query ? 1000 : at === 0 ? 400 : 100
      const score = field.weight + position
      if (!best || score > best.score) best = { label: field.label, score }
    }

    if (best) {
      scored.push({ hit: { ...candidate.hit, matchedOn: best.label }, score: best.score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((entry) => entry.hit)
}

function collect(state: DemoState): Candidate[] {
  const rows: Candidate[] = []

  for (const project of state.projects) {
    rows.push({
      hit: {
        id: `search-project-${project.code}`,
        kind: 'project',
        title: project.code,
        subtitle: `${project.name} · ${project.client} · ${project.assets.length} 个资产`,
        route: 'projects',
        selectId: project.code,
      },
      // 刻意不收 pmName / artDirectorName：搜索不做成查人的入口
      fields: [
        { label: '批次编号', value: project.code, weight: W_CODE },
        { label: '项目名', value: project.name, weight: W_NAME },
        { label: '客户', value: project.client, weight: W_TEXT },
      ],
    })

    for (const asset of project.assets) {
      rows.push({
        hit: {
          id: `search-asset-${asset.id}`,
          kind: 'asset',
          title: `${asset.id} ${asset.name}`,
          subtitle: `${project.code} · ${asset.discipline} · ${asset.stages.length} 个阶段`,
          route: 'projects',
          selectId: project.code,
        },
        fields: [
          { label: '资产编号', value: asset.id, weight: W_CODE },
          { label: '资产名', value: asset.name, weight: W_NAME },
        ],
      })

      for (const stage of asset.stages) {
        rows.push({
          hit: {
            id: `search-stage-${stage.id}`,
            kind: 'stage',
            title: `${asset.id} · ${stage.name}`,
            subtitle: `${project.code} · ${stage.ownerName} · ${stage.currentStart} — ${stage.currentFinish}`,
            route: 'schedule',
            selectId: stage.id,
          },
          fields: [
            { label: '阶段名', value: stage.name, weight: W_NAME },
            { label: '制作组', value: stage.ownerName, weight: W_TEXT },
          ],
        })
      }
    }
  }

  for (const batch of state.feedbackBatches) {
    for (const item of batch.items) {
      rows.push({
        hit: {
          id: `search-feedback-${item.id}`,
          kind: 'feedback',
          title: `${batch.id} · ${item.title}`,
          subtitle: `${batch.projectCode} · ${item.assetId}`,
          route: 'feedback',
          selectId: item.id,
        },
        fields: [
          { label: '反馈批次号', value: batch.id, weight: W_CODE },
          { label: '反馈项', value: item.title, weight: W_NAME },
          { label: '客户原文', value: item.originalText, weight: W_TEXT },
        ],
      })
    }
  }

  for (const entry of state.candidates) {
    rows.push({
      hit: {
        id: `search-candidate-${entry.id}`,
        kind: 'candidate',
        title: entry.title,
        subtitle: `候选 ${entry.id}`,
        route: 'inbox',
        selectId: entry.id,
      },
      fields: [
        { label: '候选编号', value: entry.id, weight: W_CODE },
        { label: '候选标题', value: entry.title, weight: W_NAME },
        { label: 'AI 摘要', value: entry.aiSummary, weight: W_TEXT },
      ],
    })
  }

  for (const entry of state.quoteCases) {
    rows.push({
      hit: {
        id: `search-quote-${entry.id}`,
        kind: 'quote',
        title: `${entry.id} ${entry.title}`,
        subtitle: `${entry.projectCode} · ${entry.client}`,
        route: 'quotation',
        selectId: entry.id,
      },
      fields: [
        { label: '报价编号', value: entry.id, weight: W_CODE },
        { label: '变更单号', value: entry.changeRequestId ?? '', weight: W_CODE },
        { label: '报价标题', value: entry.title, weight: W_NAME },
        { label: '需求描述', value: entry.requirement, weight: W_TEXT },
      ],
    })
  }

  for (const entry of state.closeoutCases) {
    rows.push({
      hit: {
        id: `search-closeout-${entry.id}`,
        kind: 'closeout',
        title: `${entry.projectCode} 结项`,
        subtitle: `${entry.client} · ${entry.id}`,
        route: 'closeout',
        selectId: entry.id,
      },
      fields: [
        { label: '结项编号', value: entry.id, weight: W_CODE },
        { label: '批次编号', value: entry.projectCode, weight: W_CODE },
        { label: '客户', value: entry.client, weight: W_TEXT },
      ],
    })
  }

  for (const entry of state.projectPaths) {
    rows.push({
      hit: {
        id: `search-path-${entry.id}`,
        kind: 'path',
        title: `${entry.projectCode} · ${PATH_KIND_LABEL[entry.kind]}`,
        subtitle: entry.path,
        route: 'files',
        selectId: entry.projectCode,
      },
      fields: [
        { label: '路径', value: entry.path, weight: W_NAME },
        { label: '批次编号', value: entry.projectCode, weight: W_CODE },
        { label: '备注', value: entry.note ?? '', weight: W_TEXT },
      ],
    })
  }

  return rows
}
