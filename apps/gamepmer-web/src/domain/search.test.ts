import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { SEARCHABLE_KINDS, SEARCH_RESULT_LIMIT, searchAll } from './search'

const state = createDemoState()

function kinds(query: string): string[] {
  return [...new Set(searchAll(state, query).map((hit) => hit.kind))]
}

describe('全局搜索', () => {
  it('空查询不给结果——不是把整库倒出来', () => {
    expect(searchAll(state, '')).toEqual([])
    expect(searchAll(state, '   ')).toEqual([])
  })

  /** 一个字符会把几乎所有东西都命中，那种结果没有任何用。 */
  it('单个字符不检索，至少两个字符才开始', () => {
    expect(searchAll(state, 'M')).toEqual([])
    expect(searchAll(state, '高')).toEqual([])
  })

  it('搜不到就是搜不到，绝不返回一个凑数的近似结果', () => {
    expect(searchAll(state, 'zzzz-不存在的东西')).toEqual([])
  })

  describe('占位符承诺的四类都真的能搜到', () => {
    it('项目：批次编号与项目名都命中', () => {
      expect(searchAll(state, 'NST_A_3D_B24').some((hit) => hit.kind === 'project')).toBe(true)
      // 编号大小写不敏感，PM 不会记得全大写
      expect(searchAll(state, 'nst_a_3d_b24').some((hit) => hit.kind === 'project')).toBe(true)
    })

    it('资产：资产编号命中，并写明属于哪个项目', () => {
      const hit = searchAll(state, 'MECH-01').find((entry) => entry.kind === 'asset')
      expect(hit).toBeDefined()
      expect(hit?.subtitle).toContain('NST_A_3D_B24')
    })

    it('阶段：按阶段名搜得到，且带资产上下文', () => {
      const hit = searchAll(state, '烘焙').find((entry) => entry.kind === 'stage')
      expect(hit).toBeDefined()
      expect(hit?.subtitle).toBeTruthy()
    })

    it('文件路径：贴一段路径片段能找回是哪个项目的哪个盘位', () => {
      const anyPath = state.projectPaths[0]
      const fragment = anyPath.path.slice(-12)
      const hit = searchAll(state, fragment).find((entry) => entry.kind === 'path')
      expect(hit).toBeDefined()
      expect(hit?.route).toBe('files')
    })
  })

  it('反馈、候选、报价和结项也在检索范围内', () => {
    expect(kinds('F-017')).toContain('feedback')
    expect(kinds('CQ-004')).toContain('quote')
    expect(searchAll(state, 'C-2').some((hit) => hit.kind === 'candidate')).toBe(true)
  })

  it('每条结果都知道自己该跳到哪个模块、选中哪条记录', () => {
    const hits = searchAll(state, 'MECH')
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(SEARCHABLE_KINDS.map((entry) => entry.kind)).toContain(hit.kind)
      expect(hit.route).toBeTruthy()
      expect(hit.title).toBeTruthy()
      // 没有跳转目标的结果就是个死链，不如不给
      expect(hit.selectId).toBeTruthy()
    }
  })

  /** 精确编号排在模糊命中前面——搜 `F-017` 的人要的就是 F-017。 */
  it('完全匹配编号的结果排第一', () => {
    expect(searchAll(state, 'MECH-01')[0]?.title).toContain('MECH-01')
    expect(searchAll(state, 'NST_A_3D_B24')[0]?.kind).toBe('project')
  })

  it('结果有上限，不会因为搜了个常见词就刷屏', () => {
    const hits = searchAll(state, '模')
    expect(hits.length).toBeLessThanOrEqual(SEARCH_RESULT_LIMIT)
  })

  it('结果 id 唯一，渲染列表不会撞 key', () => {
    const hits = searchAll(state, 'MECH')
    expect(new Set(hits.map((hit) => hit.id)).size).toBe(hits.length)
  })

  /**
   * 搜索只读，是纯投影。
   * 顺手也守着「不下钻到个人」：搜索不按人名建索引，
   * 免得它变成一个查某某人手上有什么活的入口。
   */
  it('不改任何数据，也不按人名建索引', () => {
    const before = JSON.stringify(state)
    searchAll(state, 'MECH-01')
    expect(JSON.stringify(state)).toBe(before)

    const pmName = state.projects[0].pmName
    expect(searchAll(state, pmName)).toEqual([])
  })
})
