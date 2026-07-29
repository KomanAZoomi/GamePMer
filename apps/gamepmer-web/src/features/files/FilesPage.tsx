import { useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import { BATCH_CODE_EXAMPLE, BATCH_CODE_RULE, parseBatchCode } from '../../domain/batchCode'
import { CLOSEOUT_STATUS_LABEL } from '../../domain/closeout'
import {
  IT_OWNED_KINDS,
  PATH_KIND_LABEL,
  PATH_KIND_ORDER,
  missingKinds,
  pathIssues,
  pathOf,
  pathsOf,
  suggestPath,
} from '../../domain/projectPaths'
import type { PathKind } from '../../domain/model'
import type { WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { BatchCodeChip } from './BatchCodeChip'

interface FilesPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

/** 每种盘位放什么，写在表里当常驻说明——新同事不用问。 */
const KIND_HINT: Record<PathKind, string> = {
  feedback: '这个批次的客户反馈、批注图与原始附件；内部按日期分子目录',
  production: '制作过程文件与源文件',
  delivery: '每次提交客户的交付件',
  final: '总监整理的最终包：交付件 + 源文件 + 贴图 + LOD 清单',
  archive: 'IT 剪切备份的目标目录，由 IT 建立与维护',
  reference: '客户给的设定、参考图与规范文档',
}

export function FilesPage({ workspace, store, onNavigate }: FilesPageProps) {
  const { demo, today, selectedPathProject } = workspace
  const [editing, setEditing] = useState<PathKind | undefined>()
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState<string | undefined>()

  // 已建项的项目 + 只在报价里出现、还没建项但已经要占盘的批次
  const quoteOnly = demo.quoteCases
    .map((entry) => entry.projectCode)
    .filter((code) => !demo.projects.some((project) => project.code === code))
  const codes = [...new Set([...demo.projects.map((project) => project.code), ...quoteOnly])]

  const projectCode =
    selectedPathProject && codes.includes(selectedPathProject) ? selectedPathProject : codes[0]

  if (!projectCode) {
    return (
      <div className="gp-placeholder">
        <div className="gp-card gp-placeholder-card">
          <h1>文件与归档</h1>
          <p>当前没有项目。恢复示例数据后可登记各批次的盘位路径。</p>
        </div>
      </div>
    )
  }

  const project = demo.projects.find((entry) => entry.code === projectCode)
  const parse = parseBatchCode(projectCode)
  const registered = pathsOf(demo, projectCode)
  const missing = missingKinds(demo, projectCode)
  const closeout = demo.closeoutCases.find((entry) => entry.projectCode === projectCode)

  const startEdit = (kind: PathKind) => {
    const existing = pathOf(demo, projectCode, kind)
    setEditing(kind)
    setDraft(existing?.path ?? '')
    setNote(existing?.note ?? '')
    setCopied(undefined)
  }

  const cancelEdit = () => {
    setEditing(undefined)
    setDraft('')
    setNote('')
  }

  const copy = async (path: string, kind: PathKind) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(kind)
      window.setTimeout(() => setCopied(undefined), 2000)
    } catch {
      setCopied(undefined)
    }
  }

  const draftIssues = editing ? pathIssues(draft) : []

  return (
    <div className="gp-files">
      <header className="gp-page-head">
        <div>
          <h1>文件与归档</h1>
          <p>
            按批次登记盘位路径 · {today} · {codes.length} 个批次 · 已登记 {demo.projectPaths.length}{' '}
            条路径
          </p>
        </div>
        <div className="gp-chip-row">
          <button type="button" className="gp-chip" onClick={() => onNavigate('closeout')}>
            去结项中心
          </button>
        </div>
      </header>

      <p className="gp-files-boundary">
        路径<strong>只挂在批次上，不挂到阶段</strong>——一个批次几十个资产，逐个登记这张表就没法看了。
        批次内部你怎么按日期分子目录，工作台不管。 编号规范是 <code>{BATCH_CODE_RULE}</code>，例如{' '}
        <code>{BATCH_CODE_EXAMPLE}</code>。 工作台<strong>不复制、不移动、不删除</strong>
        任何真实文件，这里存的只是一串路径字符串。
      </p>

      <div className="gp-files-body">
        <aside className="gp-card gp-batch-list" aria-label="批次">
          <header className="gp-card-head">
            <h2>
              批次
              <small>已建项 + 已报价待建项</small>
            </h2>
            <span className="gp-count">{codes.length}</span>
          </header>
          <ul className="gp-batch-items">
            {codes.map((code) => {
              const done = pathsOf(demo, code).length
              const known = demo.projects.find((entry) => entry.code === code)
              return (
                <li key={code}>
                  <button
                    type="button"
                    className={`gp-batch${code === projectCode ? ' is-active' : ''}`}
                    onClick={() => {
                      store.selectPathProject(code)
                      cancelEdit()
                    }}
                  >
                    <BatchCodeChip code={code} />
                    <span className="gp-batch-name">{known?.name ?? '尚未建项（报价中）'}</span>
                    <span className="gp-batch-stat">
                      已登记 {done} / {PATH_KIND_ORDER.length} 个盘位
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="gp-card gp-path-table-card" aria-label="路径登记">
          <header className="gp-card-head">
            <h2>
              {projectCode}
              <small>
                {project ? `${project.client} · ${project.name}` : '尚未建项，先把盘占好'} · 已登记{' '}
                {registered.length} / {PATH_KIND_ORDER.length}
              </small>
            </h2>
            {missing.length > 0 && <span className="gp-count is-warn">还差 {missing.length} 个</span>}
          </header>

          <div className="gp-path-scroll">
            <table className="gp-path-table" aria-label="盘位路径">
              <thead>
                <tr>
                  <th>盘位</th>
                  <th>路径</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {PATH_KIND_ORDER.map((kind) => {
                  const entry = pathOf(demo, projectCode, kind)
                  const isEditing = editing === kind
                  const itOwned = IT_OWNED_KINDS.includes(kind)
                  return (
                    <tr key={kind} className={entry ? undefined : 'is-empty'}>
                      <td className="gp-path-kind">
                        <strong>
                          {PATH_KIND_LABEL[kind]}
                          {itOwned && <em className="gp-it-tag">IT 管辖</em>}
                        </strong>
                        <span>{KIND_HINT[kind]}</span>
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="gp-path-editor">
                            <input
                              className={`gp-input${draftIssues.length > 0 ? ' is-invalid' : ''}`}
                              aria-label={`${PATH_KIND_LABEL[kind]} 路径`}
                              value={draft}
                              placeholder={suggestPath(projectCode, kind)}
                              onChange={(event) => setDraft(event.target.value)}
                            />
                            <input
                              className="gp-input"
                              aria-label={`${PATH_KIND_LABEL[kind]} 备注`}
                              value={note}
                              placeholder="备注（可空，会进审计）"
                              onChange={(event) => setNote(event.target.value)}
                            />
                            {draftIssues.length > 0 && (
                              <ul className="gp-path-issues">
                                {draftIssues.map((issue) => (
                                  <li key={issue}>{issue}</li>
                                ))}
                              </ul>
                            )}
                            <button
                              type="button"
                              className="gp-linkish"
                              onClick={() => setDraft(suggestPath(projectCode, kind))}
                            >
                              按约定填入 {suggestPath(projectCode, kind)}
                            </button>
                          </div>
                        ) : entry ? (
                          <>
                            <span className="gp-path gp-path-value">{entry.path}</span>
                            {entry.note && <span className="gp-path-note">{entry.note}</span>}
                            <span className="gp-path-meta">
                              {entry.updatedAt.slice(0, 10)} 由 {entry.updatedBy} 登记
                            </span>
                          </>
                        ) : (
                          <span className="gp-path-empty">还没登记</span>
                        )}
                      </td>
                      <td className="gp-path-actions">
                        {isEditing ? (
                          <>
                            <button type="button" className="gp-btn gp-btn-sm" onClick={cancelEdit}>
                              取消
                            </button>
                            <button
                              type="button"
                              className="gp-btn gp-btn-sm gp-btn-primary"
                              disabled={draftIssues.length > 0}
                              title={draftIssues.length > 0 ? draftIssues.join('；') : undefined}
                              onClick={() => {
                                store.saveProjectPath({ projectCode, kind, path: draft, note })
                                cancelEdit()
                              }}
                            >
                              保存
                            </button>
                          </>
                        ) : entry ? (
                          <>
                            <button
                              type="button"
                              className="gp-btn gp-btn-sm"
                              onClick={() => copy(entry.path, kind)}
                            >
                              {copied === kind ? '已复制' : '复制路径'}
                            </button>
                            <button
                              type="button"
                              className="gp-btn gp-btn-sm"
                              onClick={() => startEdit(kind)}
                            >
                              修改
                            </button>
                            <button
                              type="button"
                              className="gp-btn gp-btn-sm"
                              onClick={() => store.removeProjectPath(entry.id)}
                            >
                              删除登记
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="gp-btn gp-btn-sm gp-btn-primary"
                            onClick={() => startEdit(kind)}
                          >
                            登记路径
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="gp-jump-note">
            <strong>关于一键跳转：</strong>
            浏览器出于安全限制，不允许网页直接打开 <code>{'\\\\服务器\\共享'}</code> 这类本机路径——
            这是浏览器的规矩，不是没做完。所以这里给的是<strong>一键复制</strong>： 点「复制路径」
            后到资源管理器地址栏粘贴即可。 如果要做成真正点一下就打开，需要 IT
            在每台机器上注册一个自定义协议（例如 <code>gamepmer://open?path=…</code>
            ），这要等内网部署时由 IT 统一分发，工作台这边装不了。 删除登记删的也只是这条索引，
            <strong>盘上的文件不受任何影响</strong>。
          </p>
        </section>

        <aside className="gp-card gp-batch-detail" aria-label="批次详情">
          <div className="gp-detail-kicker">批次编号解析</div>
          <h2 className="gp-batch-title">{projectCode}</h2>

          <div className="gp-parse-box">
            <dl>
              <div>
                <dt>客户代号</dt>
                <dd className={parse.clientCode ? undefined : 'is-missing'}>
                  {parse.clientCode ?? '未识别'}
                </dd>
              </div>
              <div>
                <dt>项目代号</dt>
                <dd className={parse.projectCode ? undefined : 'is-missing'}>
                  {parse.projectCode ?? '未识别'}
                </dd>
              </div>
              <div>
                <dt>类型</dt>
                <dd className={parse.discipline ? undefined : 'is-missing'}>
                  {parse.discipline ?? '未识别'}
                </dd>
              </div>
              <div>
                <dt>批次号</dt>
                <dd className={parse.batchNo ? undefined : 'is-missing'}>
                  {parse.batchNo ?? '未识别'}
                </dd>
              </div>
            </dl>
            {parse.problems.length > 0 && (
              <ul className="gp-path-issues">
                {parse.problems.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>

          {missing.length > 0 ? (
            <div className="gp-block-box">
              <h3>还差 {missing.length} 个盘位没登记</h3>
              <ul>
                {missing.map((kind) => (
                  <li key={kind}>{PATH_KIND_LABEL[kind]}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="gp-block-box is-ok">
              <h3>盘位齐全</h3>
              <p>六个盘位都登记了，结项时的最终包与归档路径可以直接取用。</p>
            </div>
          )}

          {closeout && (
            <div className="gp-evidence">
              <h3>结项状态</h3>
              <p className="gp-inspector-text">
                {CLOSEOUT_STATUS_LABEL[closeout.status]}
                <br />
                最终包与归档路径由结项中心直接读这张登记表，不另存一套。
              </p>
              <button type="button" className="gp-linkish" onClick={() => onNavigate('closeout')}>
                去结项中心处理 →
              </button>
            </div>
          )}

          {project && (
            <div className="gp-evidence">
              <h3>批次内容</h3>
              <p className="gp-inspector-text">
                {project.assets.length} 个资产 ·{' '}
                {project.assets.reduce((sum, asset) => sum + asset.stages.length, 0)} 个阶段
                <br />
                路径不细分到资产和阶段——一个批次的东西都在同一个盘里。
              </p>
              <button type="button" className="gp-linkish" onClick={() => onNavigate('projects')}>
                在甘特上查看 →
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
