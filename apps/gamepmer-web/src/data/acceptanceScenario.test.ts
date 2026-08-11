import { describe, expect, it } from 'vitest'

import { ACCEPTANCE_SCENARIO, createAcceptanceScenarioState } from './acceptanceScenario'

describe('官方完整验收场景', () => {
  it('生成从报价到归档都可追溯的 3D PBR 验收案例', () => {
    const state = createAcceptanceScenarioState()
    const project = state.projects.find((item) => item.code === ACCEPTANCE_SCENARIO.projectCode)

    expect(state.quoteCases.some((item) => item.id === ACCEPTANCE_SCENARIO.quoteCaseId)).toBe(true)
    expect(project?.assets[0].stages.map((stage) => stage.code)).toEqual([
      '3D_MID',
      '3D_HIGH',
      '3D_LOW',
      '3D_BAKE',
      '3D_TEXTURE',
      '3D_LOD',
    ])
    expect(state.feedbackBatches.some((item) => item.id === ACCEPTANCE_SCENARIO.feedbackBatchId)).toBe(true)
    expect(state.revisions.some((item) => item.sourceFeedbackItemId === 'F-018-01')).toBe(true)
    expect(state.closeoutCases.find((item) => item.projectCode === project?.code)?.status).toBe('Archived')
  })

  it('保留基准日期，并且 F-018 重排只改受影响资产的后续阶段', () => {
    const state = createAcceptanceScenarioState()
    const project = state.projects.find((item) => item.code === 'SKF_A_3D_B52')!
    const affected = project.assets.find((item) => item.id === 'SKF-A-01')!
    const untouched = project.assets.find((item) => item.id === 'SKF-A-02')!

    expect(affected.stages.find((stage) => stage.code === '3D_LOW')?.baselineStart).not.toBe(
      affected.stages.find((stage) => stage.code === '3D_LOW')?.currentStart,
    )
    expect(untouched.stages.every((stage) => stage.baselineStart === stage.currentStart)).toBe(true)
  })
})
