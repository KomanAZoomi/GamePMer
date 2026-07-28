import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  APPROVAL_LABEL,
  CONNECTORS,
  DEFAULT_BINDINGS,
  DEFAULT_REDACTIONS,
  LLM_PROVIDERS,
  SettingsBlocked,
  keyIssues,
  keyTailOf,
  multiRolePeople,
  peopleByRole,
  saveApiKey,
} from './settings'

const ACTOR = 'Brandon'
const NOW = `${DEMO_TODAY}T19:00:00+08:00`
const REAL_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'

describe('API Key 不落前端', () => {
  it('供应商类型上根本没有存完整 Key 的字段', () => {
    for (const provider of LLM_PROVIDERS) {
      const keys = Object.keys(provider)
      expect(keys).not.toContain('apiKey')
      expect(keys).not.toContain('key')
      expect(keys).not.toContain('secret')
      expect(keys).not.toContain('token')
    }
  })

  it('保存后 state 里搜不到完整 Key，只有后 4 位', () => {
    const state = createDemoState()
    const next = saveApiKey(state, { providerId: 'anthropic', key: REAL_KEY, actor: ACTOR, now: NOW })

    const dump = JSON.stringify(next)
    expect(dump).not.toContain(REAL_KEY)
    expect(dump).not.toContain('sk-ant-api03')
    expect(dump).toContain(`••••${keyTailOf(REAL_KEY)}`)
  })

  it('审计里也只留后 4 位，并说明完整 Key 去了哪', () => {
    const state = createDemoState()
    const next = saveApiKey(state, { providerId: 'anthropic', key: REAL_KEY, actor: ACTOR, now: NOW })
    const audit = next.auditEvents.at(-1)!

    expect(audit.after).toBe('••••6789')
    expect(audit.reason).toContain('内网服务端密钥库')
    expect(audit.actor).toBe(ACTOR)
  })

  it('Key 格式不对时整体拒绝，零副作用', () => {
    const state = createDemoState()
    const before = JSON.stringify(state)

    expect(() => saveApiKey(state, { providerId: 'anthropic', key: '  ', actor: ACTOR, now: NOW })).toThrow(
      SettingsBlocked,
    )
    expect(() => saveApiKey(state, { providerId: 'anthropic', key: 'sk-短', actor: ACTOR, now: NOW })).toThrow(
      SettingsBlocked,
    )
    expect(JSON.stringify(state)).toBe(before)
  })

  it('复制时带了换行会被指出来，而不是存进去一个坏 Key', () => {
    expect(keyIssues('sk-ant-api03-abc def ghijklmnopqrstuvwxyz').some((i) => i.includes('空格'))).toBe(
      true,
    )
  })

  it('找不到的供应商预设不接受 Key', () => {
    const state = createDemoState()
    expect(() =>
      saveApiKey(state, { providerId: 'nope', key: REAL_KEY, actor: ACTOR, now: NOW }),
    ).toThrow(SettingsBlocked)
  })
})

describe('用途分档', () => {
  it('五个用途都有默认绑定', () => {
    expect(DEFAULT_BINDINGS).toHaveLength(5)
    expect(new Set(DEFAULT_BINDINGS.map((b) => b.purpose)).size).toBe(5)
  })

  it('提取与解析用最便宜的档，分流与起草用中档', () => {
    const anthropic = LLM_PROVIDERS.find((p) => p.id === 'anthropic')!
    const tierOf = (modelId: string) => anthropic.models.find((m) => m.id === modelId)!.tier

    expect(tierOf(DEFAULT_BINDINGS.find((b) => b.purpose === 'field-extract')!.modelId)).toBe('fast')
    expect(tierOf(DEFAULT_BINDINGS.find((b) => b.purpose === 'path-parse')!.modelId)).toBe('fast')
    expect(tierOf(DEFAULT_BINDINGS.find((b) => b.purpose === 'feedback-triage')!.modelId)).toBe(
      'balanced',
    )
    expect(tierOf(DEFAULT_BINDINGS.find((b) => b.purpose === 'draft-mail')!.modelId)).toBe('balanced')
  })

  it('每个绑定指向真实存在的供应商与模型', () => {
    for (const binding of DEFAULT_BINDINGS) {
      const provider = LLM_PROVIDERS.find((p) => p.id === binding.providerId)!
      expect(provider).toBeTruthy()
      expect(provider.models.some((m) => m.id === binding.modelId)).toBe(true)
    }
  })
})

describe('连接器如实标注审批门槛', () => {
  it('四条零审批路径都是已接入', () => {
    const zero = CONNECTORS.filter((entry) => entry.approval === 'none')
    expect(zero).toHaveLength(4)
    expect(zero.every((entry) => entry.connected)).toBe(true)
  })

  it('企微与飞书标为需企业管理员，且都没接入', () => {
    for (const id of ['wecom', 'feishu']) {
      const entry = CONNECTORS.find((row) => row.id === id)!
      expect(entry.approval).toBe('admin')
      expect(entry.connected).toBe(false)
      expect(entry.reason).toContain('管理员')
    }
  })

  it('公司邮箱区分本人授权与全公司授权', () => {
    const email = CONNECTORS.find((entry) => entry.id === 'email')!
    expect(email.approval).toBe('self')
    expect(email.reason).toContain('本人')
    expect(email.reason).toContain('全公司')
  })

  it('每个没接入的连接器都给了替代路径', () => {
    for (const entry of CONNECTORS.filter((row) => !row.connected)) {
      expect(entry.fallback).toBeTruthy()
    }
    expect(Object.keys(APPROVAL_LABEL)).toHaveLength(3)
  })
})

describe('脱敏默认值', () => {
  it('客户全称、联系方式与报价金额默认不外发', () => {
    for (const id of ['client-name', 'contact', 'amount']) {
      expect(DEFAULT_REDACTIONS.find((rule) => rule.id === id)!.enabled).toBe(true)
    }
  })

  it('每条规则都写明关掉的后果', () => {
    for (const rule of DEFAULT_REDACTIONS) {
      expect(rule.risk.length).toBeGreaterThan(0)
    }
  })
})

describe('角色', () => {
  it('按角色列出成员，覆盖五种角色', () => {
    const rows = peopleByRole(createDemoState())
    expect(rows).toHaveLength(5)
    expect(rows.find((row) => row.role === 'PM')!.names).toContain('Brandon')
  })

  it('点名同一人兼多角的组合——复核合并规则就是从这里来的', () => {
    const rows = multiRolePeople(createDemoState())
    const leo = rows.find((row) => row.name === 'Leo')!

    expect(leo).toBeTruthy()
    expect(leo.roles).toEqual(expect.arrayContaining(['组长', 'BD']))
  })
})
