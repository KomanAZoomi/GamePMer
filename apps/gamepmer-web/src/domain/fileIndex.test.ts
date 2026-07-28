import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  FileLinkBlocked,
  NAMING_RULE,
  driveSummary,
  entryOf,
  ignoreFile,
  indexMetrics,
  linkFile,
  parseFileName,
  restoreFile,
  suggestStage,
} from './fileIndex'
import type { DemoState } from './model'

const ACTOR = 'Brandon'
const NOW = `${DEMO_TODAY}T17:00:00+08:00`

/** 正式业务数据指纹。文件索引只该改索引本身。 */
function formalFingerprint(state: DemoState): string {
  return JSON.stringify({
    projects: state.projects,
    closeoutCases: state.closeoutCases,
    feedbackBatches: state.feedbackBatches,
  })
}

describe('命名解析', () => {
  it('规范命名四段全出', () => {
    const parse = parseFileName('MECH-01_低模_20260803_r02.fbx')

    expect(parse.assetId).toBe('MECH-01')
    expect(parse.stageCode).toBe('3D_LOW')
    expect(parse.fileDate).toBe('2026-08-03')
    expect(parse.revision).toBe('r02')
    expect(parse.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('只有「资产名_阶段名_日期」也能识别，版本按 r01 待确认', () => {
    const parse = parseFileName('MECH-02_高模_20260727.max')

    expect(parse.assetId).toBe('MECH-02')
    expect(parse.stageCode).toBe('3D_HIGH')
    expect(parse.fileDate).toBe('2026-07-27')
    expect(parse.revision).toBeUndefined()
    // 缺版本要压低置信度并说明原因，不能当成完整解析
    expect(parse.confidence).toBeLessThan(0.9)
    expect(parse.problem).toContain('版本')
  })

  it('完全不规范时四个字段全空，绝不猜一个默认值', () => {
    const parse = parseFileName('机甲主角_最终版本_改过的_v3_ok.fbx')

    expect(parse.assetId).toBeUndefined()
    expect(parse.stageCode).toBeUndefined()
    expect(parse.fileDate).toBeUndefined()
    expect(parse.revision).toBeUndefined()
    expect(parse.confidence).toBe(0)
    expect(parse.problem).toBeTruthy()
  })

  it('2D 阶段名同样认得', () => {
    expect(parseFileName('CHAR-08_草图_20260724_r01.psd').stageCode).toBe('2D_SKETCH')
    expect(parseFileName('CHAR-08_细化50_20260724_r03.psd').stageCode).toBe('2D_DETAIL_50')
    expect(parseFileName('CHAR-08_完成稿_20260724_r01.psd').stageCode).toBe('2D_FINAL')
  })

  it('命名规范作为常量导出，界面和解析用的是同一份', () => {
    expect(NAMING_RULE).toBe('资产名_阶段名_YYYYMMDD_rNN')
  })
})

describe('关联建议', () => {
  it('解析出的阶段在库里找得到就给出建议，并说明依据', () => {
    const state = createDemoState()
    const hint = suggestStage(state, parseFileName('MECH-01_低模_20260803_r02.fbx'))

    expect(hint?.stageId).toBe('MECH-01/3D_LOW')
    expect(hint?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('资产名对不上正式数据时置信度压低，不当成自动关联', () => {
    const state = createDemoState()
    // PROP-07 在种子里不存在
    const hint = suggestStage(state, parseFileName('PROP-07_贴图_20260723_r01.zip'))

    expect(hint).toBeUndefined()
  })

  it('解析不出时不给任何建议——宁可空着也不乱指', () => {
    const state = createDemoState()
    expect(suggestStage(state, parseFileName('随便一个名字.fbx'))).toBeUndefined()
  })
})

describe('原文件名永不改写', () => {
  it('手工关联之后文件名一个字符都没变', () => {
    const state = createDemoState()
    const before = entryOf(state, 'FI-0004')!
    expect(before.status).toBe('unresolved')

    const next = linkFile(state, 'FI-0004', 'MECH-01/3D_LOW', { actor: ACTOR, now: NOW })
    const after = entryOf(next, 'FI-0004')!

    expect(after.fileName).toBe(before.fileName)
    expect(after.status).toBe('linked')
    expect(after.linkedStageId).toBe('MECH-01/3D_LOW')
    expect(after.linkedBy).toBe(ACTOR)
  })

  it('忽略也不是删除，条目和原名都留着，还能退回', () => {
    const state = createDemoState()
    const ignored = ignoreFile(state, 'FI-0004', '临时目录下的过程文件', { actor: ACTOR, now: NOW })

    const entry = entryOf(ignored, 'FI-0004')!
    expect(entry.status).toBe('ignored')
    expect(entry.fileName).toBe(entryOf(state, 'FI-0004')!.fileName)
    expect(entry.ignoredReason).toContain('过程文件')

    const restored = restoreFile(ignored, 'FI-0004', { actor: ACTOR, now: NOW })
    expect(entryOf(restored, 'FI-0004')!.status).toBe('unresolved')
    expect(entryOf(restored, 'FI-0004')!.ignoredReason).toBeUndefined()
  })

  it('索引条目上没有任何移动、复制或删除的接口', () => {
    const state = createDemoState()
    const entry = entryOf(state, 'FI-0001')!
    const keys = Object.keys(entry)

    for (const forbidden of ['move', 'copy', 'delete', 'rename', 'destination']) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false)
    }
  })
})

describe('关联不污染正式数据', () => {
  it('关联、忽略、退回都只改索引，不动项目与结项', () => {
    const state = createDemoState()
    const fingerprint = formalFingerprint(state)

    let next = linkFile(state, 'FI-0004', 'MECH-01/3D_LOW', { actor: ACTOR, now: NOW })
    next = ignoreFile(next, 'FI-0003', '与正式流程无关', { actor: ACTOR, now: NOW })

    expect(formalFingerprint(next)).toBe(fingerprint)
  })

  it('每次关联与忽略都写审计', () => {
    const state = createDemoState()
    const next = linkFile(state, 'FI-0004', 'MECH-01/3D_LOW', { actor: ACTOR, now: NOW })

    const audits = next.auditEvents.filter((event) => event.targetId === 'FI-0004')
    expect(audits).toHaveLength(1)
    expect(audits[0].action).toContain('关联')
    expect(audits[0].after).toBe('MECH-01/3D_LOW')
  })

  it('关联到不存在的阶段会被拒绝，且零副作用', () => {
    const state = createDemoState()
    const fingerprint = JSON.stringify(state.fileIndex)

    expect(() =>
      linkFile(state, 'FI-0004', 'NOPE-99/3D_LOW', { actor: ACTOR, now: NOW }),
    ).toThrow(FileLinkBlocked)
    expect(JSON.stringify(state.fileIndex)).toBe(fingerprint)
  })

  it('已忽略的条目不能直接关联，要先退回', () => {
    const state = createDemoState()
    const ignored = ignoreFile(state, 'FI-0004', '无关', { actor: ACTOR, now: NOW })

    expect(() =>
      linkFile(ignored, 'FI-0004', 'MECH-01/3D_LOW', { actor: ACTOR, now: NOW }),
    ).toThrow(FileLinkBlocked)
  })
})

describe('盘位与指标', () => {
  it('五个盘位都登记在册，归档盘归 IT 管辖', () => {
    const state = createDemoState()
    const kinds = state.drives.map((drive) => drive.kind)

    expect(kinds).toEqual(
      expect.arrayContaining(['feedback', 'production', 'delivery', 'final', 'archive']),
    )
  })

  it('盘位汇总按状态分类，待关联数字对得上', () => {
    const state = createDemoState()
    const summary = driveSummary(state)
    const production = summary.find((row) => row.drive.kind === 'production')!

    expect(production.total).toBe(
      state.fileIndex.filter((entry) => entry.driveId === production.drive.id).length,
    )
    expect(production.pending).toBe(
      state.fileIndex.filter(
        (entry) =>
          entry.driveId === production.drive.id &&
          (entry.status === 'needs-review' || entry.status === 'unresolved'),
      ).length,
    )
  })

  it('指标里「无法解析」与「待确认」分开算——两者要采取的动作不同', () => {
    const state = createDemoState()
    const metrics = indexMetrics(state)

    expect(metrics.total).toBe(state.fileIndex.length)
    expect(metrics.unresolved).toBeGreaterThan(0)
    expect(metrics.needsReview).toBeGreaterThan(0)
    expect(metrics.unresolved + metrics.needsReview).toBeLessThan(metrics.total)
  })

  it('自动关联率按已关联除以总数算，不含被忽略的', () => {
    const state = createDemoState()
    const metrics = indexMetrics(state)
    const linked = state.fileIndex.filter(
      (entry) => entry.status === 'auto' || entry.status === 'linked',
    ).length

    expect(metrics.linked).toBe(linked)
  })
})
