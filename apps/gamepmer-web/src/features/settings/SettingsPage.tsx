import { useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import { BATCH_CODE_EXAMPLE, BATCH_CODE_RULE } from '../../domain/batchCode'
import {
  APPROVAL_LABEL,
  CONNECTORS,
  DEFAULT_BINDINGS,
  DEFAULT_REDACTIONS,
  LLM_PROVIDERS,
  LLM_PURPOSE_LABEL,
  LLM_PURPOSE_TRIGGER,
  KNOWN_LIMITS,
  dataScale,
  keyIssues,
  multiRolePeople,
  peopleByRole,
} from '../../domain/settings'
import { PATH_KIND_LABEL, PATH_KIND_ORDER } from '../../domain/projectPaths'
import type { WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'

interface SettingsPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

type Section = 'org' | 'rules' | 'connectors' | 'llm' | 'ops'

const SECTIONS: Array<{ key: Section; label: string; group: string }> = [
  { key: 'org', label: '成员与角色', group: '组织' },
  { key: 'rules', label: '业务规则', group: '组织' },
  { key: 'connectors', label: '连接器', group: '集成' },
  { key: 'llm', label: 'LLM 供应商', group: '集成' },
  { key: 'ops', label: '数据与运维', group: '运维' },
]

const STAGE_TEMPLATES = [
  { discipline: '2D', stages: ['草图', '细化 50%', '完成稿'] },
  { discipline: '3D PBR', stages: ['中模', '高模', '低模', '烘焙', '贴图', 'LOD'] },
]

export function SettingsPage({ workspace, store, onNavigate }: SettingsPageProps) {
  const { demo, today } = workspace
  const [section, setSection] = useState<Section>('llm')
  const [providerId, setProviderId] = useState('anthropic')
  const [keyDraft, setKeyDraft] = useState('')
  // 清空不可撤销，所以走两步：先亮出要清多少条，再确认
  const [confirmClear, setConfirmClear] = useState(false)
  const [editingKey, setEditingKey] = useState(false)

  const provider = LLM_PROVIDERS.find((entry) => entry.id === providerId) ?? LLM_PROVIDERS[0]
  const draftIssues = editingKey ? keyIssues(keyDraft) : []
  const roles = peopleByRole(demo)
  const multiRole = multiRolePeople(demo)
  const calendar = demo.calendars[0]

  return (
    <div className="gp-settings">
      <header className="gp-page-head">
        <div>
          <h1>设置中心</h1>
          <p>
            工作区「产品美术中心」· 你的角色 <b>PM（可读写本工作区设置）</b> · {today}
          </p>
        </div>
        <div className="gp-chip-row">
          <button type="button" className="gp-chip" onClick={store.resetDemo}>
            恢复示例数据
          </button>
        </div>
      </header>

      <div className="gp-settings-body">
        <aside className="gp-card gp-settings-nav" aria-label="设置分组">
          {['组织', '集成', '运维'].map((group) => (
            <div key={group}>
              <div className="gp-settings-group">{group}</div>
              {SECTIONS.filter((entry) => entry.group === group).map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`gp-settings-link${entry.key === section ? ' is-active' : ''}`}
                  onClick={() => setSection(entry.key)}
                >
                  {entry.label}
                  {entry.key === 'connectors' && <em className="gp-warn-tag">未接入</em>}
                  {entry.key === 'llm' && <em className="gp-warn-tag">待定</em>}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <section className="gp-card gp-settings-main" aria-label="设置内容">
          {section === 'llm' && (
            <>
              <header className="gp-card-head">
                <h2>
                  LLM 供应商预设
                  <small>地址与模型由预设预填，管理员或授权用户只需填 API Key</small>
                </h2>
                <span className="gp-count">{LLM_PROVIDERS.length}</span>
              </header>

              <div className="gp-settings-scroll">
                <table className="gp-provider-table" aria-label="供应商预设">
                  <thead>
                    <tr>
                      <th />
                      <th>供应商预设</th>
                      <th>接口地址（内网网关转发）</th>
                      <th>可选模型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LLM_PROVIDERS.map((entry) => (
                      <tr
                        key={entry.id}
                        className={entry.id === providerId ? 'is-active' : undefined}
                        onClick={() => {
                          setProviderId(entry.id)
                          setEditingKey(false)
                          setKeyDraft('')
                        }}
                      >
                        <td>
                          <input
                            type="radio"
                            className="gp-radio"
                            name="llm-provider"
                            aria-label={`选用 ${entry.label}`}
                            checked={entry.id === providerId}
                            onChange={() => setProviderId(entry.id)}
                          />
                        </td>
                        {/* 状态和 Key 都并进这一格：拆成独立列后表格在 1280 会被裁掉右边 */}
                        <td className="gp-provider-name">
                          <strong>{entry.label}</strong>
                          <div className="gp-provider-tags">
                            <span
                              className={`gp-pill ${entry.status === 'active' ? 'is-plan' : 'is-plain'}`}
                            >
                              {entry.status === 'active'
                                ? '当前启用'
                                : entry.status === 'undeployed'
                                  ? '未部署'
                                  : '未配置'}
                            </span>
                            <span className="gp-pill is-plain">
                              {entry.keyless
                                ? 'Key：无需'
                                : entry.keyTail
                                  ? 'Key：已存服务端'
                                  : 'Key：未填写'}
                            </span>
                          </div>
                          <span>{entry.note}</span>
                        </td>
                        <td className="gp-provider-url">{entry.baseUrl}</td>
                        <td>
                          {entry.models.length === 0 ? (
                            <span className="gp-pill is-plain">待确认</span>
                          ) : (
                            entry.models.map((model) => (
                              <span key={model.id} className="gp-model-id">
                                {model.id}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="gp-key-box">
                <h3>{provider.label} · API Key</h3>
                {provider.keyless ? (
                  <p className="gp-key-note">内网自托管不经过外部服务，不需要 Key。</p>
                ) : (
                  <>
                    <div className="gp-key-row">
                      <span className="gp-key-mask">
                        {provider.keyTail ? `sk-••••••••••••••••••••••••${provider.keyTail}` : '未填写'}
                      </span>
                      {editingKey ? (
                        <>
                          <input
                            className={`gp-input${draftIssues.length > 0 ? ' is-invalid' : ''}`}
                            aria-label="API Key"
                            type="password"
                            placeholder="粘贴完整 Key，提交后前端不再持有"
                            value={keyDraft}
                            onChange={(event) => setKeyDraft(event.target.value)}
                          />
                          <button
                            type="button"
                            className="gp-btn gp-btn-sm"
                            onClick={() => {
                              setEditingKey(false)
                              setKeyDraft('')
                            }}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="gp-btn gp-btn-sm gp-btn-primary"
                            disabled={draftIssues.length > 0}
                            title={draftIssues.length > 0 ? draftIssues.join('；') : undefined}
                            onClick={() => {
                              store.saveApiKey(provider.id, keyDraft)
                              setEditingKey(false)
                              setKeyDraft('')
                            }}
                          >
                            提交到服务端密钥库
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="gp-btn gp-btn-sm"
                          onClick={() => setEditingKey(true)}
                        >
                          {provider.keyTail ? '替换 Key' : '填写 Key'}
                        </button>
                      )}
                    </div>
                    {draftIssues.length > 0 && (
                      <ul className="gp-path-issues">
                        {draftIssues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    )}
                    <p className="gp-key-danger">
                      Key 提交到内网服务端的密钥库，工作台<strong>只保留后 4 位</strong>用于识别。
                      不写入仓库、日志、导出文件或浏览器存储——这一条有测试守着，不是口号。
                    </p>
                  </>
                )}
              </div>

              <div className="gp-binding">
                <h3>用途 → 模型分配</h3>
                <p className="gp-settings-note">
                  三类任务难度差一个数量级：提取和解析用最便宜的档，分流和起草用中档。
                  一个模型跑到底不是更简单，是更贵。
                </p>
                <div className="gp-settings-scroll">
                  <table className="gp-binding-table" aria-label="用途分配">
                    <thead>
                      <tr>
                        <th>用途</th>
                        <th>触发时机</th>
                        <th>模型</th>
                        <th>档位</th>
                        <th>开关</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEFAULT_BINDINGS.map((binding) => {
                        const bound = LLM_PROVIDERS.find((p) => p.id === binding.providerId)!
                        const model = bound.models.find((m) => m.id === binding.modelId)!
                        return (
                          <tr key={binding.purpose}>
                            <td>
                              <strong>{LLM_PURPOSE_LABEL[binding.purpose]}</strong>
                            </td>
                            <td className="gp-settings-muted">
                              {LLM_PURPOSE_TRIGGER[binding.purpose]}
                            </td>
                            <td className="gp-model-id">{model.id}</td>
                            <td className="gp-settings-muted">
                              {model.tier === 'fast' ? '便宜快' : model.tier === 'balanced' ? '平衡' : '最强'}
                              {model.inputPrice !== undefined &&
                                ` · $${model.inputPrice}/$${model.outputPrice} 每百万 token`}
                            </td>
                            <td>
                              <span className={`gp-pill ${binding.enabled ? 'is-plan' : 'is-plain'}`}>
                                {binding.enabled ? '开' : '关'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="gp-redaction">
                <h3>发送前脱敏</h3>
                <ul>
                  {DEFAULT_REDACTIONS.map((rule) => (
                    <li key={rule.id}>
                      <span className={`gp-pill ${rule.enabled ? 'is-plan' : 'is-plain'}`}>
                        {rule.enabled ? '已开启' : '未开启'}
                      </span>
                      <strong>{rule.label}</strong>
                      <em>{rule.risk}</em>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {section === 'connectors' && (
            <>
              <header className="gp-card-head">
                <h2>
                  连接器
                  <small>接不接得上不取决于我们写不写代码，取决于企业管理员批不批</small>
                </h2>
                <span className="gp-count">{CONNECTORS.filter((c) => c.connected).length} / {CONNECTORS.length}</span>
              </header>
              <ul className="gp-connector-list" aria-label="连接器状态">
                {CONNECTORS.map((entry) => (
                  <li key={entry.id} className={entry.connected ? 'is-on' : undefined}>
                    <div className="gp-connector-head">
                      <strong>{entry.label}</strong>
                      <span className={`gp-pill ${entry.connected ? 'is-plan' : 'is-plain'}`}>
                        {entry.connected ? '已接入' : '未接入'}
                      </span>
                      <span
                        className={`gp-pill ${entry.approval === 'none' ? 'is-plan' : entry.approval === 'self' ? 'is-feedback' : 'is-risk'}`}
                      >
                        {APPROVAL_LABEL[entry.approval]}
                      </span>
                    </div>
                    <p>{entry.reason}</p>
                    {entry.fallback && <p className="gp-connector-fallback">替代路径：{entry.fallback}</p>}
                  </li>
                ))}
              </ul>
              <p className="gp-settings-note">
                候选收件箱刻意先把四条零审批路径做实，接口到位后只是多一个 Adapter，
                候选、去重和确认逻辑一行都不用改。
              </p>
            </>
          )}

          {section === 'org' && (
            <>
              <header className="gp-card-head">
                <h2>
                  成员与角色
                  <small>一个人可以兼多职，这直接决定复核要不要合并</small>
                </h2>
                <span className="gp-count">{demo.people.length}</span>
              </header>
              <table className="gp-role-table" aria-label="成员与角色">
                <thead>
                  <tr>
                    <th>角色</th>
                    <th>成员</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((row) => (
                    <tr key={row.role}>
                      <td>
                        <strong>{row.role}</strong>
                      </td>
                      <td>{row.names.length > 0 ? row.names.join('、') : <span className="gp-settings-muted">暂无</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="gp-merge-note">
                <h3>兼任多角色的成员</h3>
                {multiRole.map((row) => (
                  <p key={row.name}>
                    <strong>{row.name}</strong> 同时是 {row.roles.join(' 与 ')}
                    ——报价复核时<strong>只需确认一次</strong>，但审计里两个角色都会记下来。
                  </p>
                ))}
              </div>

              <div className="gp-group-list">
                <h3>制作组</h3>
                <ul>
                  {demo.productionGroups.map((group) => (
                    <li key={group.id}>
                      <strong>{group.name}</strong>
                      <span>
                        {group.discipline} · 组长 {group.leadName} · {group.dailyCapacity} 人天/工作日
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="gp-settings-note">
                  制作组容量是<strong>跨项目共享资源</strong>，不挂在任何单个项目下。
                  排期页的筛选只影响显示，不影响这里的容量数字。
                </p>
              </div>
            </>
          )}

          {section === 'rules' && (
            <>
              <header className="gp-card-head">
                <h2>
                  业务规则
                  <small>这些规则被领域层直接引用，改这里等于改业务</small>
                </h2>
              </header>
              <div className="gp-rule-block">
                <h3>阶段模板</h3>
                <ul className="gp-template-list">
                  {STAGE_TEMPLATES.map((template) => (
                    <li key={template.discipline}>
                      <strong>{template.discipline}</strong>
                      <span>{template.stages.join(' → ')}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="gp-rule-block">
                <h3>批次编号</h3>
                <p>
                  规范：<code>{BATCH_CODE_RULE}</code>，例如 <code>{BATCH_CODE_EXAMPLE}</code>
                </p>
                <ul className="gp-rule-items">
                  <li>客户代号：2~4 位大写字母</li>
                  <li>项目代号：1~2 位字母或数字</li>
                  <li>类型：只能是 2D 或 3D</li>
                  <li>批次号：B 加 2~3 位数字</li>
                </ul>
                <p className="gp-settings-note">
                  候选收件箱识别项目、文件与归档登记路径，用的是<strong>同一份解析规则</strong>——
                  两处各写各的正则，迟早出现「这边认得出、那边不合法」。
                </p>
              </div>

              <div className="gp-rule-block">
                <h3>盘位</h3>
                <ul className="gp-rule-items">
                  {PATH_KIND_ORDER.map((kind) => {
                    const registered = demo.projectPaths.filter((entry) => entry.kind === kind).length
                    return (
                      <li key={kind}>
                        <span>{PATH_KIND_LABEL[kind]}</span>
                        <em>
                          {registered > 0 ? `已登记 ${registered} 个项目` : '暂无项目登记'}
                        </em>
                      </li>
                    )
                  })}
                </ul>
                <p className="gp-settings-note">
                  盘位只挂到项目，不挂到阶段——一个批次的资产共用一个反馈盘，
                  按阶段拆只会让路径列表长到没法看。
                </p>
              </div>

              {calendar && (
                <div className="gp-rule-block">
                  <h3>{calendar.name}</h3>
                  <p>
                    公司休息日：{calendar.holidays.join('、') || '无'}
                    <br />
                    特殊工作日：{calendar.extraWorkdays.join('、') || '无'}
                  </p>
                  <p className="gp-settings-note">
                    排期的所有顺延都按这份日历算——改休息日会影响已生成草案的计算结果。
                  </p>
                </div>
              )}
            </>
          )}

          {section === 'ops' && (
            <>
              <header className="gp-card-head">
                <h2>
                  数据与运维
                  <small>当前是演示环境，没有任何真实凭证</small>
                </h2>
              </header>
              <div className="gp-rule-block">
                <h3>数据存放</h3>
                <p>
                  当前数据存在浏览器 localStorage，通过 Repository 接口隔离。
                  换成内网 API 时接口要改成异步并补加载态，这是已知的迁移成本。
                </p>
                <p>
                  审计事件已记录 <strong>{demo.auditEvents.length}</strong> 条，
                  但尚无多用户与访问控制。
                </p>
              </div>
              <div className="gp-rule-block">
                <h3>当前数据规模</h3>
                <ul className="gp-scale-list">
                  {dataScale(demo).map((entry) => (
                    <li key={entry.label}>
                      <strong>{entry.count}</strong>
                      <span>{entry.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="gp-rule-block">
                <h3>已知限制</h3>
                <ul className="gp-limit-list">
                  {KNOWN_LIMITS.map((entry) => (
                    <li key={entry.item}>
                      <strong>{entry.item}</strong>
                      <span>{entry.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="gp-rule-block">
                <h3>恢复示例数据</h3>
                <p>把所有页面恢复到初始的演示状态，用于反复走验收脚本。</p>
                <button type="button" className="gp-btn gp-btn-primary" onClick={store.resetDemo}>
                  恢复示例数据
                </button>
              </div>

              <div className="gp-rule-block">
                <h3>清空业务数据</h3>
                <p>
                  把演示用的项目、报价、候选、反馈、修订、结项、路径、通知和审计全部清掉，
                  换成录自己的真实业务。清空<strong>会保留</strong>制作组、工作日历和成员——
                  界面上还没有创建它们的入口，一起清掉工作台就没法用了。
                </p>
                <p className="gp-clear-warn">
                  数据存在这台浏览器的 localStorage 里，<strong>清空不可撤销</strong>，
                  也没有导出备份。需要留底的话先自己截图或导出。
                </p>
                {confirmClear ? (
                  <div className="gp-detail-actions">
                    <button type="button" className="gp-btn" onClick={() => setConfirmClear(false)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="gp-btn gp-btn-danger"
                      onClick={() => {
                        store.clearBusinessData()
                        setConfirmClear(false)
                      }}
                    >
                      确认清空 {dataScale(demo).reduce((sum, entry) => sum + entry.count, 0)} 条业务数据
                    </button>
                  </div>
                ) : (
                  <button type="button" className="gp-btn" onClick={() => setConfirmClear(true)}>
                    清空业务数据…
                  </button>
                )}
              </div>
              <div className="gp-key-danger">
                当前是演示环境，没有任何真实凭证，也<strong>不要拿真实客户或公司数据测试</strong>。
                Key 一旦填入即视为生产配置，请由管理员在正式内网环境操作。
              </div>
            </>
          )}
        </section>

        <aside className="gp-card gp-settings-side" aria-label="安全边界">
          <div className="gp-detail-kicker">密钥与调用边界</div>
          <h2 className="gp-detail-title">三条不让步的约束</h2>
          <dl className="gp-boundary-list">
            <div>
              <dt>Key 保管位置</dt>
              <dd>内网服务端密钥库</dd>
            </div>
            <div>
              <dt>前端持有</dt>
              <dd>仅后 4 位，用于识别</dd>
            </div>
            <div>
              <dt>调用发起方</dt>
              <dd>内网服务端网关</dd>
            </div>
            <div>
              <dt>浏览器直连外网</dt>
              <dd>否</dd>
            </div>
            <div>
              <dt>写入日志</dt>
              <dd>否（含错误日志）</dd>
            </div>
            <div>
              <dt>写入导出文件</dt>
              <dd>否</dd>
            </div>
            <div>
              <dt>可读取 Key 的角色</dt>
              <dd>无（只写不读）</dd>
            </div>
          </dl>
          <p className="gp-settings-note">
            这几条不是文案：<code>LlmProvider</code> 类型上根本没有能装完整 Key 的字段，
            有测试保存一个真 Key 之后在整个 state 里搜，搜不到才算过。
          </p>

          <div className="gp-detail-actions gp-quote-actions">
            <button type="button" className="gp-btn" onClick={() => onNavigate('inbox')}>
              去候选收件箱
            </button>
            <button type="button" className="gp-btn" onClick={() => onNavigate('analytics')}>
              去智能分析
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
