import { useRef, useState } from 'react'

import { importDemoBackup, serializeDemoBackup } from '../../data/demoBackup'
import type { DemoState } from '../../domain/model'
import { KNOWN_LIMITS, dataScale } from '../../domain/settings'
import type { WorkspaceStore } from '../workspace/workspaceStore'

interface DataOpsPanelProps {
  demo: DemoState
  store: WorkspaceStore
  now: string
}

function dateForFilename(now: string): string {
  return now.slice(0, 10)
}

export function DataOpsPanel({ demo, store, now }: DataOpsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmAcceptance, setConfirmAcceptance] = useState(false)
  const [pendingImport, setPendingImport] = useState<{ name: string; state: DemoState }>()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [confirmClear, setConfirmClear] = useState(false)

  const resetMessage = () => {
    setNotice(undefined)
    setError(undefined)
  }

  const loadScenario = () => {
    store.loadAcceptanceScenario()
    setConfirmAcceptance(false)
    setPendingImport(undefined)
    setError(undefined)
    setNotice('已载入完整验收场景：CO-004 → SKF_A_3D_B52 → F-018 → 归档。')
  }

  const exportData = () => {
    const blob = new Blob([serializeDemoBackup(demo, now)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gamepmer-demo-backup-${dateForFilename(now)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setError(undefined)
    setNotice('已生成当前浏览器 Demo 数据的 JSON 备份。')
  }

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const state = importDemoBackup(String(reader.result ?? ''))
        setPendingImport({ name: file.name, state })
        setError(undefined)
        setNotice(undefined)
      } catch (caught) {
        setPendingImport(undefined)
        setNotice(undefined)
        setError(caught instanceof Error ? caught.message : '无法读取该备份文件。')
      }
    }
    reader.onerror = () => {
      setPendingImport(undefined)
      setNotice(undefined)
      setError('无法读取该备份文件。')
    }
    reader.readAsText(file)
  }

  const replaceFromImport = () => {
    if (!pendingImport) return
    store.replaceDemo(pendingImport.state)
    setNotice(`已载入备份“${pendingImport.name}”。`)
    setError(undefined)
    setPendingImport(undefined)
  }

  const totalBusinessRecords = dataScale(demo).reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="gp-data-ops" aria-label="数据操作">
      <section className="gp-rule-block">
        <h3>加载可复现 Demo</h3>
        <p>
          基础示例适合浏览各模块；完整验收场景固定为一条从报价到归档的业务线，任何浏览器都可重复加载。
        </p>
        <div className="gp-detail-actions">
          <button
            type="button"
            className="gp-btn"
            onClick={() => {
              store.resetDemo()
              resetMessage()
              setNotice('已恢复基础示例数据。')
            }}
          >
            恢复示例数据
          </button>
          <button type="button" className="gp-btn gp-btn-primary" onClick={() => { resetMessage(); setConfirmAcceptance(true) }}>
            载入完整验收场景
          </button>
        </div>
        {confirmAcceptance && (
          <div className="gp-data-confirm" role="dialog" aria-label="确认载入完整验收场景">
            <p>将覆盖当前浏览器中的全部 Demo 数据。若要保留当前录入，请先导出 JSON 备份。</p>
            <div className="gp-detail-actions">
              <button type="button" className="gp-btn" onClick={() => setConfirmAcceptance(false)}>取消</button>
              <button type="button" className="gp-btn gp-btn-primary" onClick={loadScenario}>确认载入完整验收场景</button>
            </div>
          </div>
        )}
      </section>

      <section className="gp-rule-block">
        <h3>浏览器间迁移</h3>
        <p>当前数据只存在这台浏览器的 localStorage。切换浏览器、设备或地址前，请先导出；导入采用整体替换，不会合并项目。</p>
        <div className="gp-detail-actions">
          <button type="button" className="gp-btn" onClick={exportData}>导出当前数据</button>
          <button type="button" className="gp-btn" onClick={() => fileInputRef.current?.click()}>导入数据</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="导入 GamePMer JSON 备份"
            hidden
            onChange={handleImportFile}
          />
        </div>
        {pendingImport && (
          <div className="gp-data-confirm" role="dialog" aria-label="确认导入数据">
            <p>“{pendingImport.name}”已通过校验。导入后将整体覆盖当前数据：</p>
            <ul className="gp-scale-list">
              {dataScale(pendingImport.state).map((item) => <li key={item.label}><strong>{item.count}</strong><span>{item.label}</span></li>)}
            </ul>
            <div className="gp-detail-actions">
              <button type="button" className="gp-btn" onClick={() => setPendingImport(undefined)}>取消</button>
              <button type="button" className="gp-btn gp-btn-primary" onClick={replaceFromImport}>确认导入并替换数据</button>
            </div>
          </div>
        )}
      </section>

      <section className="gp-rule-block">
        <h3>当前数据规模与限制</h3>
        <ul className="gp-scale-list">
          {dataScale(demo).map((item) => <li key={item.label}><strong>{item.count}</strong><span>{item.label}</span></li>)}
        </ul>
        <ul className="gp-limit-list">
          {KNOWN_LIMITS.map((item) => <li key={item.item}><strong>{item.item}</strong><span>{item.detail}</span></li>)}
        </ul>
      </section>

      <section className="gp-rule-block">
        <h3>清空业务数据</h3>
        <p>清空项目、报价、候选、反馈、修订、结项、路径、通知和审计记录，但保留制作组、日历和成员配置。</p>
        {confirmClear ? (
          <div className="gp-detail-actions">
            <button type="button" className="gp-btn" onClick={() => setConfirmClear(false)}>取消</button>
            <button type="button" className="gp-btn gp-btn-danger" onClick={() => { store.clearBusinessData(); setConfirmClear(false); setNotice(`已清空 ${totalBusinessRecords} 条业务数据。`) }}>
              确认清空 {totalBusinessRecords} 条业务数据
            </button>
          </div>
        ) : <button type="button" className="gp-btn" onClick={() => { resetMessage(); setConfirmClear(true) }}>清空业务数据…</button>}
      </section>

      {error && <p className="gp-data-message is-error" role="alert">{error}</p>}
      {notice && <p className="gp-data-message" role="status">{notice}</p>}
      <p className="gp-key-danger">这是演示环境：尚无多用户与访问控制；不要拿真实客户或公司数据测试，不导入真实邮件原文、附件或 API Key；导出文件也应仅保存在公司内网批准的位置。</p>
    </div>
  )
}
