import { createDemoState } from './seed'

describe('演示种子数据', () => {
  it('创建三个虚构项目与一条高模返修反馈', () => {
    const state = createDemoState()

    expect(state.projects.map((project) => project.code)).toEqual(['P-3D-024', 'P-2D-018', 'P-3D-031'])
    expect(state.feedbackBatches[0]).toMatchObject({
      id: 'F-017',
      projectCode: 'P-3D-024',
      affectedStageCode: '3D_HIGH',
      addedWorkdays: 2,
    })
  })

  it('为 MECH-01 创建完整的六段 3D PBR 流程', () => {
    const mech = createDemoState().projects[0].assets.find((asset) => asset.id === 'MECH-01')
    expect(mech?.stages.map((stage) => stage.code)).toEqual(['3D_MID', '3D_HIGH', '3D_LOW', '3D_BAKE', '3D_TEXTURE', '3D_LOD'])
  })
})
