import { useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import {
  CLOSEOUT_STATUS_LABEL,
  gateState,
} from '../../domain/closeout'
import {
  DRIVE_KIND_LABEL,
  FILE_STATUS_LABEL,
  NAMING_RULE,
  allStages,
  driveOf,
  driveSummary,
  indexMetrics,
  stageLabel,
  suggestStage,
} from '../../domain/fileIndex'
import type { FileIndexEntry, StageCode } from '../../domain/model'
import type { FileTab, WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { FileNameParts } from './FileNameParts'

interface FilesPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

const TABS: Array<{ key: FileTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待关联' },
  { key: 'handled', label: '已处理' },
]

const STAGE_NAME: Record<StageCode, string> = {
  '2D_SKETCH': '草图',
  '2D_DETAIL_50': '细化 50%',
  '2D_FINAL': '完成稿',
  '3D_MID': '中模',
  '3D_HIGH': '高模',
  '3D_LOW': '低模',
  '3D_BAKE': '烘焙',
  '3D_TEXTURE': '贴图',
  '3D_LOD': 'LOD',
}

function statusPill(status: FileIndexEntry['status']): string {
  switch (status) {
    case 'auto':
    case 'linked':
      return 'is-plan'
    case 'needs-review':
      return 'is-feedback'
    case 'unresolved':
      return 'is-risk'
    case 'ignored':
      return 'is-plain'
  }
}

export function FilesPage({ workspace, store, onNavigate }: FilesPageProps) {
  const { demo, today, fileTab, fileDriveId, selectedFileId } = workspace
  const [stagePick, setStagePick] = useState('')
  const [ignoreReason, setIgnoreReason] = useState('')

  const metrics = useMemo(() => indexMetrics(demo), [demo])
  const drives = useMemo(() => driveSummary(demo), [demo])

  const listed = useMemo(() => {
    const byNewest = [...demo.fileIndex].sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt))
    const scoped = fileDriveId ? byNewest.filter((entry) => entry.driveId === fileDriveId) : byNewest
    if (fileTab === 'pending') {
      return scoped.filter((entry) => entry.status === 'needs-review' || entry.status === 'unresolved')
    }
    if (fileTab === 'handled') {
      return scoped.filter(
        (entry) => entry.status === 'auto' || entry.status === 'linked' || entry.status === 'ignored',
      )
    }
    return scoped
  }, [demo.fileIndex, fileDriveId, fileTab])

  const selected =
    demo.fileIndex.find((entry) => entry.id === selectedFileId) ?? listed[0] ?? demo.fileIndex[0]

  if (!selected) {
    return (
      <div className="gp-placeholder">
        <div className="gp-card gp-placeholder-card">
          <h1>文件与归档</h1>
          <p>当前没有文件索引。恢复示例数据后可查看五个盘位的索引。</p>
        </div>
      </div>
    )
  }

  const drive = driveOf(demo, selected.driveId)
  const hint = suggestStage(demo, selected.parse)
  const stageOptions = allStages(demo)
  const pending = selected.status === 'needs-review' || selected.status === 'unresolved'
  const target = stagePick || hint?.stageId || ''

  const reset = () => {
    setStagePick('')
    setIgnoreReason('')
  }

  return (
    <div className="gp-files">
      <header className="gp-page-head">
        <div>
          <h1>文件与归档</h1>
          <p>
            盘位索引 · 命名解析 · 手工关联 · 归档回执 · {today} · 已索引 {metrics.total} 个文件 ·
            待关联 {metrics.needsReview + metrics.unresolved} 个
          </p>
        </div>
        <div className="gp-chip-row">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`gp-chip${tab.key === fileTab ? ' is-active' : ''}`}
              onClick={() => store.setFileTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <p className="gp-files-boundary">
        这一页只做<strong>索引</strong>：记录盘上有哪个文件、属于哪个资产的哪个阶段。
        工作台<strong>不复制、不移动、不删除、不改名</strong>任何真实文件——
        剪切备份由 IT 用自己的权限执行，IT 的正式邮件才是完成证据。
        命名规范是 <code>{NAMING_RULE}</code>；解析不出来的<strong>保留原文件名进待关联，绝不丢弃</strong>。
      </p>

      <div className="gp-metrics gp-metrics-5">
        <div className="gp-metric">
          <span>已索引文件</span>
          <b>{metrics.total}</b>
          <small>覆盖 {demo.drives.length} 个盘位</small>
        </div>
        <div className="gp-metric">
          <span>已关联</span>
          <b>{metrics.linked}</b>
          <small>自动 + 手工</small>
        </div>
        <div className="gp-metric is-warn">
          <span>待确认</span>
          <b>{metrics.needsReview}</b>
          <small>解析出来了，置信度不足</small>
        </div>
        <div className={`gp-metric${metrics.unresolved > 0 ? ' is-warn' : ''}`}>
          <span>无法解析</span>
          <b>{metrics.unresolved}</b>
          <small>保留原名，等手工关联</small>
        </div>
        <div className="gp-metric">
          <span>已忽略</span>
          <b>{metrics.ignored}</b>
          <small>不是删除，可退回</small>
        </div>
      </div>

      <div className="gp-files-body">
        <aside className="gp-card gp-drive-list" aria-label="盘位">
          <header className="gp-card-head">
            <h2>
              盘位
              <small>只登记路径，不接管权限</small>
            </h2>
            <span className="gp-count">{demo.drives.length}</span>
          </header>
          <ul className="gp-drive-items">
            <li>
              <button
                type="button"
                className={`gp-drive${fileDriveId ? '' : ' is-active'}`}
                onClick={() => store.setFileDrive(undefined)}
              >
                <strong>全部盘位</strong>
                <span className="gp-drive-stat">文件 {metrics.total}</span>
              </button>
            </li>
            {drives.map((row) => (
              <li key={row.drive.id}>
                <button
                  type="button"
                  className={`gp-drive${row.drive.id === fileDriveId ? ' is-active' : ''}${row.drive.kind === 'archive' ? ' is-it' : ''}`}
                  onClick={() => store.setFileDrive(row.drive.id)}
                >
                  <strong>{DRIVE_KIND_LABEL[row.drive.kind]}</strong>
                  <span className="gp-path">{row.drive.path}</span>
                  <span className="gp-drive-stat">
                    文件 {row.total}
                    {row.pending > 0 && <em> · 待关联 {row.pending}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="gp-card gp-file-table-card" aria-label="文件索引">
          <header className="gp-card-head">
            <h2>
              {fileDriveId ? DRIVE_KIND_LABEL[driveOf(demo, fileDriveId)!.kind] : '全部盘位'} · 文件索引
              <small>按发现时间倒序</small>
            </h2>
            <span className="gp-count">{listed.length}</span>
          </header>
          {listed.length === 0 ? (
            <p className="gp-empty">这个筛选下暂时没有文件。</p>
          ) : (
            <div className="gp-file-scroll">
              <table className="gp-file-table">
                <thead>
                  <tr>
                    {/* 四列在 1280 的中栏放不下，关联状态并进文件名格 */}
                    <th>文件名 / 路径 / 关联状态</th>
                    <th>解析结果</th>
                    <th>置信度</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((entry) => (
                    <tr
                      key={entry.id}
                      className={entry.id === selected.id ? 'is-active' : undefined}
                      onClick={() => {
                        store.selectFile(entry.id)
                        reset()
                      }}
                    >
                      <td>
                        <div className="gp-file-head">
                          <button
                            type="button"
                            className="gp-file-name"
                            onClick={() => {
                              store.selectFile(entry.id)
                              reset()
                            }}
                          >
                            <FileNameParts fileName={entry.fileName} parse={entry.parse} />
                          </button>
                          <span className={`gp-pill ${statusPill(entry.status)}`}>
                            {FILE_STATUS_LABEL[entry.status]}
                          </span>
                        </div>
                        <span className="gp-file-folder">
                          {driveOf(demo, entry.driveId)?.path}
                          {entry.folder}
                          <em> · {entry.discoveredAt.slice(5, 16).replace('T', ' ')} 发现</em>
                        </span>
                      </td>
                      <td className="gp-file-parse">
                        {entry.parse.assetId && entry.parse.stageCode ? (
                          <>
                            {entry.parse.assetId} / {STAGE_NAME[entry.parse.stageCode]}
                            {entry.parse.revision ? ` · ${entry.parse.revision}` : ' · 版本号缺失'}
                            {/* 格式对了不等于关联得上：库里查无此资产要说出来，
                                否则一个 98% 会让人以为这条没问题 */}
                            {!suggestStage(demo, entry.parse) && (
                              <b className="gp-file-unresolved"> · 库中无此资产</b>
                            )}
                          </>
                        ) : (
                          <b className="gp-file-unresolved">无法解析</b>
                        )}
                      </td>
                      <td className="gp-num">
                        {entry.parse.confidence === 0 ? (
                          '—'
                        ) : suggestStage(demo, entry.parse) ? (
                          `${Math.round(entry.parse.confidence * 100)}%`
                        ) : (
                          <span className="gp-file-unresolved">
                            格式 {Math.round(entry.parse.confidence * 100)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="gp-card gp-file-detail" aria-label="文件详情">
          <div className="gp-detail-kicker">
            {FILE_STATUS_LABEL[selected.status]} · {drive ? DRIVE_KIND_LABEL[drive.kind] : ''}
          </div>
          <h2 className="gp-file-title">{selected.fileName}</h2>
          <p className="gp-path gp-file-detail-folder">
            {drive?.path}
            {selected.folder}
          </p>

          <div className="gp-parse-box">
            <h3>解析结果</h3>
            <dl>
              <div>
                <dt>资产</dt>
                <dd className={selected.parse.assetId ? undefined : 'is-missing'}>
                  {selected.parse.assetId ?? '未识别'}
                </dd>
              </div>
              <div>
                <dt>阶段</dt>
                <dd className={selected.parse.stageCode ? undefined : 'is-missing'}>
                  {selected.parse.stageCode ? STAGE_NAME[selected.parse.stageCode] : '未识别'}
                </dd>
              </div>
              <div>
                <dt>文件日期</dt>
                <dd className={selected.parse.fileDate ? undefined : 'is-missing'}>
                  {selected.parse.fileDate ?? '未识别'}
                </dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd className={selected.parse.revision ? undefined : 'is-missing'}>
                  {selected.parse.revision ?? '未识别'}
                </dd>
              </div>
            </dl>
            {selected.parse.problem && <p className="gp-parse-problem">{selected.parse.problem}</p>}
          </div>

          {selected.aiHint && (
            <div className="gp-assistant">
              <h3>AI 助手判断</h3>
              <p>{selected.aiHint}</p>
              <p className="gp-assistant-note">
                建议未执行。关联由你来做——AI 猜错一次，证据链就断在这里。
              </p>
            </div>
          )}

          {selected.linkedStageId && (
            <div className="gp-block-box is-ok">
              <h3>已关联</h3>
              <p>
                {stageLabel(demo, selected.linkedStageId)}
                {selected.linkedBy && (
                  <>
                    <br />
                    {selected.linkedBy} 于 {selected.linkedAt?.slice(0, 16).replace('T', ' ')} 手工关联
                  </>
                )}
              </p>
            </div>
          )}

          {selected.status === 'ignored' && (
            <div className="gp-block-box">
              <h3>已忽略</h3>
              <p>{selected.ignoredReason}</p>
            </div>
          )}

          {pending && (
            <div className="gp-link-form">
              <h3>手工关联到阶段</h3>
              <label>
                <span>关联到</span>
                <select
                  className="gp-input"
                  aria-label="关联到阶段"
                  value={target}
                  onChange={(event) => setStagePick(event.target.value)}
                >
                  <option value="">请选择…</option>
                  {stageOptions.map((option) => (
                    <option key={option.stage.id} value={option.stage.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {hint && !stagePick && (
                <p className="gp-link-hint">
                  已按解析结果预选：{hint.rationale}
                </p>
              )}
              <label>
                <span>或者：判定为与正式流程无关</span>
                <input
                  className="gp-input"
                  aria-label="忽略原因"
                  placeholder="写清原因，会进审计"
                  value={ignoreReason}
                  onChange={(event) => setIgnoreReason(event.target.value)}
                />
              </label>
              <div className="gp-detail-actions gp-quote-actions">
                <button
                  type="button"
                  className="gp-btn"
                  disabled={!ignoreReason.trim()}
                  title={ignoreReason.trim() ? undefined : '先写清忽略原因'}
                  onClick={() => {
                    store.ignoreFile(selected.id, ignoreReason.trim())
                    reset()
                  }}
                >
                  标记为无关文件
                </button>
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  disabled={!target}
                  title={target ? undefined : '先选一个阶段'}
                  onClick={() => {
                    store.linkFile(selected.id, target)
                    reset()
                  }}
                >
                  {target ? '确认关联' : '确认关联（未选阶段）'}
                </button>
              </div>
              <p className="gp-link-note">
                关联只写索引里的对应关系。<strong>盘上的文件名一个字符都不会变</strong>——
                工作台不改名、不移动、不删除。
              </p>
            </div>
          )}

          {(selected.status === 'ignored' || selected.status === 'linked') && (
            <div className="gp-gate-reopen">
              <p>判错了可以退回待关联。忽略和关联都不是删除——原文件名一直留着。</p>
              <button type="button" className="gp-btn" onClick={() => store.restoreFile(selected.id)}>
                退回待关联
              </button>
            </div>
          )}
        </aside>
      </div>

      <section className="gp-card gp-archive-batches" aria-label="归档与备份">
        <header className="gp-card-head">
          <h2>
            归档与备份
            <small>直接读结项案件，不在这里另建一套数据</small>
          </h2>
          <span className="gp-count">{demo.closeoutCases.length}</span>
        </header>
        <div className="gp-archive-grid">
          {demo.closeoutCases.map((item) => {
            const backedUp = gateState(demo, item.id, 'it-backup') === 'done'
            return (
              <div
                key={item.id}
                className={`gp-archive-card${item.status === 'Archived' ? ' is-done' : backedUp ? ' is-done' : ' is-current'}`}
              >
                <strong>
                  {item.projectCode} · {item.client}
                </strong>
                {item.paths.map((path) => (
                  <div key={path.id} className="gp-archive-row">
                    <span>{path.label}</span>
                    <b className="gp-path">{path.path}</b>
                  </div>
                ))}
                <div className="gp-archive-row">
                  <span>状态</span>
                  <b>{CLOSEOUT_STATUS_LABEL[item.status]}</b>
                </div>
                <button type="button" className="gp-linkish" onClick={() => onNavigate('closeout')}>
                  去结项中心处理 →
                </button>
              </div>
            )
          })}
        </div>
        <p className="gp-archive-note">
          归档目标路径归 IT 管辖。工作台记录路径与回执，<strong>真实的剪切、备份和权限处理由 IT 执行</strong>——
          这不是没做完，是刻意不做：绕过 IT 权限等于绕过公司的保密流程。
        </p>
      </section>
    </div>
  )
}
