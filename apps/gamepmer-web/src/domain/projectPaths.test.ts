import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { BATCH_CODE_EXAMPLE, findBatchCode, parseBatchCode } from './batchCode'
import { DEMO_TODAY } from './clock'
import {
  PATH_KIND_ORDER,
  PathBlocked,
  missingKinds,
  pathIssues,
  pathOf,
  pathsOf,
  removePath,
  savePath,
  suggestPath,
} from './projectPaths'
import type { DemoState } from './model'

const ACTOR = 'Brandon'
const NOW = `${DEMO_TODAY}T18:00:00+08:00`
const MAIN = 'NST_A_3D_B24'

/** 正式业务数据指纹。路径登记只该改路径。 */
function formalFingerprint(state: DemoState): string {
  return JSON.stringify({
    projects: state.projects,
    closeoutCases: state.closeoutCases,
    quoteCases: state.quoteCases,
  })
}

describe('批次编号解析', () => {
  it('四段都合法时逐段拆出来', () => {
    const parse = parseBatchCode('NST_A_3D_B24')

    expect(parse.valid).toBe(true)
    expect(parse.clientCode).toBe('NST')
    expect(parse.projectCode).toBe('A')
    expect(parse.discipline).toBe('3D')
    expect(parse.batchNo).toBe('B24')
    expect(parse.problems).toEqual([])
  })

  it('段数不对时直接说清要几段，并给例子', () => {
    const parse = parseBatchCode('NST_A_3D')

    expect(parse.valid).toBe(false)
    expect(parse.problems[0]).toContain('四段')
    expect(parse.problems[0]).toContain(BATCH_CODE_EXAMPLE)
  })

  it('逐段报错，而不是笼统一句「格式错误」', () => {
    const parse = parseBatchCode('NORTHSTAR_ABC_4D_X9')

    expect(parse.valid).toBe(false)
    expect(parse.problems.some((p) => p.includes('客户代号'))).toBe(true)
    expect(parse.problems.some((p) => p.includes('项目代号'))).toBe(true)
    expect(parse.problems.some((p) => p.includes('类型'))).toBe(true)
    expect(parse.problems.some((p) => p.includes('批次号'))).toBe(true)
  })

  it('客户 2~4 位字母、项目 1~2 位、类型只认 2D/3D、批次 B 加 2~3 位数字', () => {
    expect(parseBatchCode('NS_A_2D_B07').valid).toBe(true)
    expect(parseBatchCode('NSTR_A1_3D_B123').valid).toBe(true)
    expect(parseBatchCode('N_A_3D_B07').valid).toBe(false) // 客户只有 1 位
    expect(parseBatchCode('NST_ABC_3D_B07').valid).toBe(false) // 项目 3 位
    expect(parseBatchCode('NST_A_4D_B07').valid).toBe(false) // 类型不对
    expect(parseBatchCode('NST_A_3D_24').valid).toBe(false) // 批次缺 B
  })

  it('能从自由文本里捞出编号，捞不到就是 undefined', () => {
    expect(findBatchCode('麻烦看下 NST_A_3D_B24 的高模')).toBe('NST_A_3D_B24')
    expect(findBatchCode('麻烦看下高模')).toBeUndefined()
  })
})

describe('路径校验', () => {
  it('空路径不允许保存', () => {
    expect(pathIssues('   ').length).toBeGreaterThan(0)
  })

  it('UNC 与盘符都接受', () => {
    expect(pathIssues('\\\\NAS-ART\\Feedback\\NST_A_3D_B24')).toEqual([])
    expect(pathIssues('D:\\Art\\NST_A_3D_B24')).toEqual([])
  })

  it('不是完整路径时说清要怎么填', () => {
    const issues = pathIssues('Feedback/NST_A_3D_B24')
    expect(issues.some((issue) => issue.includes('UNC'))).toBe(true)
  })

  it('挡掉 Windows 不允许的字符', () => {
    expect(pathIssues('\\\\NAS\\a<b>c').some((issue) => issue.includes('不允许的字符'))).toBe(true)
  })

  it('不校验路径是否真实存在——工作台没有也不该有访问公司盘的权限', () => {
    // 一条完全编造但格式合法的路径必须能存下来
    expect(pathIssues('\\\\NOWHERE\\这个盘根本不存在\\X')).toEqual([])
  })
})

describe('路径只挂项目，不挂阶段', () => {
  it('登记表按盘位组织，一个项目一种盘位只有一条', () => {
    const state = createDemoState()
    const paths = pathsOf(state, MAIN)

    expect(paths.length).toBeGreaterThan(0)
    const kinds = paths.map((entry) => entry.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    // 条目上没有任何阶段或资产字段
    for (const entry of paths) {
      expect(Object.keys(entry)).not.toContain('stageId')
      expect(Object.keys(entry)).not.toContain('assetId')
    }
  })

  it('还没登记的盘位列得出来，不用 PM 自己数', () => {
    const state = createDemoState()
    const missing = missingKinds(state, MAIN)
    const registered = pathsOf(state, MAIN).map((entry) => entry.kind)

    expect(missing.length + registered.length).toBe(PATH_KIND_ORDER.length)
    expect(missing.some((kind) => registered.includes(kind))).toBe(false)
  })

  it('按约定生成建议路径，但只是建议，不自动保存', () => {
    const state = createDemoState()
    expect(suggestPath(MAIN, 'feedback')).toBe('\\\\NAS-ART\\Feedback\\NST_A_3D_B24')
    expect(suggestPath(MAIN, 'archive')).toContain('ARCHIVE')

    // 建议不进 state
    const before = JSON.stringify(state.projectPaths)
    suggestPath(MAIN, 'delivery')
    expect(JSON.stringify(state.projectPaths)).toBe(before)
  })
})

describe('登记与保存', () => {
  it('新登记一条路径，写审计', () => {
    const state = createDemoState()
    // 用一个种子里没登记过的盘位，否则测的是「更新」不是「新登记」
    const next = savePath(state, {
      projectCode: MAIN,
      kind: 'final',
      path: '\\\\NAS-ART\\Final\\NST_A_3D_B24\\v1',
      actor: ACTOR,
      now: NOW,
    })

    const entry = pathOf(next, MAIN, 'final')!
    expect(entry.path).toBe('\\\\NAS-ART\\Final\\NST_A_3D_B24\\v1')
    expect(entry.updatedBy).toBe(ACTOR)

    const audit = next.auditEvents.at(-1)!
    expect(audit.action).toContain('登记项目路径')
    expect(audit.after).toBe(entry.path)
  })

  it('同一项目同一盘位再保存是覆盖，且审计留下旧值', () => {
    const state = createDemoState()
    const before = pathOf(state, MAIN, 'feedback')!

    const next = savePath(state, {
      projectCode: MAIN,
      kind: 'feedback',
      path: '\\\\NAS2\\Feedback\\NST_A_3D_B24',
      actor: ACTOR,
      now: NOW,
    })

    expect(state.projectPaths.filter((e) => e.projectCode === MAIN && e.kind === 'feedback')).toHaveLength(1)
    expect(next.projectPaths.filter((e) => e.projectCode === MAIN && e.kind === 'feedback')).toHaveLength(1)
    expect(pathOf(next, MAIN, 'feedback')!.path).toBe('\\\\NAS2\\Feedback\\NST_A_3D_B24')

    const audit = next.auditEvents.at(-1)!
    expect(audit.before).toBe(before.path)
  })

  it('路径不合法时整体拒绝，零副作用', () => {
    const state = createDemoState()
    const before = JSON.stringify(state.projectPaths)

    expect(() =>
      savePath(state, { projectCode: MAIN, kind: 'reference', path: '随便写的', actor: ACTOR, now: NOW }),
    ).toThrow(PathBlocked)
    expect(JSON.stringify(state.projectPaths)).toBe(before)
  })

  it('项目号既不在管、又不符合编号规范时拒绝', () => {
    const state = createDemoState()
    expect(() =>
      savePath(state, {
        projectCode: '随手写的项目',
        kind: 'feedback',
        path: '\\\\NAS\\X',
        actor: ACTOR,
        now: NOW,
      }),
    ).toThrow(PathBlocked)
  })

  it('还没建项但编号合规的批次可以先登记路径——报价阶段就要先占好盘', () => {
    const state = createDemoState()
    const next = savePath(state, {
      projectCode: 'NST_E_3D_B40',
      kind: 'feedback',
      path: '\\\\NAS-ART\\Feedback\\NST_E_3D_B40',
      actor: ACTOR,
      now: NOW,
    })
    expect(pathOf(next, 'NST_E_3D_B40', 'feedback')).toBeTruthy()
  })

  it('登记与删除都不碰正式业务数据', () => {
    const state = createDemoState()
    const fingerprint = formalFingerprint(state)

    let next = savePath(state, {
      projectCode: MAIN,
      kind: 'reference',
      path: '\\\\NAS-ART\\Reference\\NST_A_3D_B24',
      actor: ACTOR,
      now: NOW,
    })
    const added = pathOf(next, MAIN, 'reference')!
    next = removePath(next, added.id, { actor: ACTOR, now: NOW })

    expect(formalFingerprint(next)).toBe(fingerprint)
    expect(pathOf(next, MAIN, 'reference')).toBeUndefined()
  })

  it('删除的是索引，审计里写明盘上文件不受影响', () => {
    const state = createDemoState()
    const entry = pathOf(state, MAIN, 'feedback')!
    const next = removePath(state, entry.id, { actor: ACTOR, now: NOW })

    const audit = next.auditEvents.at(-1)!
    expect(audit.action).toContain('删除项目路径登记')
    expect(audit.reason).toContain('盘上的文件不受影响')
  })
})

describe('结项读的是同一份路径', () => {
  it('结项案件不再自存路径，避免两处各存一套', () => {
    const state = createDemoState()
    const item = state.closeoutCases[0]
    expect(Object.keys(item)).not.toContain('paths')
  })

  it('结项项目的最终包与归档路径来自登记簿', () => {
    const state = createDemoState()
    const item = state.closeoutCases.find((entry) => entry.id === 'CO-011')!

    expect(pathOf(state, item.projectCode, 'final')).toBeTruthy()
    expect(pathOf(state, item.projectCode, 'archive')).toBeTruthy()
  })
})
