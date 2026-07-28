import { useState } from 'react'
import type { SourceChannel } from '../../domain/model'
import type { IngestRequest } from '../workspace/workspaceStore'

interface ImportPanelProps {
  onImport: (request: IngestRequest) => void
  onClose: () => void
}

/**
 * 零审批导入面板。
 *
 * 这四条路径今天就能用，不等企业管理员批自建应用、也不等读全公司邮箱的授权。
 * 界面上必须把这件事讲清楚，否则同事会以为「没接邮箱 = 这个功能没做」。
 */
const CHANNELS: Array<{ key: SourceChannel; label: string; hint: string; placeholder: string }> = [
  {
    key: 'paste',
    label: '粘贴文本',
    hint: '把邮件正文或聊天记录整段贴进来',
    placeholder:
      '例：【NST_A_3D_B24】MECH-01 高模的肩甲比例请缩小，修改后重新提交评审。\n\n原文会原样保存为证据，识别错了改字段，不改原文。',
  },
  {
    key: 'screenshot',
    label: '截图文字',
    hint: '截图 OCR 后的文字，原图作为附件留底',
    placeholder: '把截图里认出来的文字贴进来。OCR 常把 0 认成 O，置信度会自动压低并要求你核对。',
  },
  {
    key: 'path',
    label: '文件路径',
    hint: '贴一条网络盘路径，按命名规范解析',
    placeholder: '例：\\\\NAS-ART\\Production\\NST_A_3D_B24\\MECH-02\\MECH-02_高模_20260727_r01.max',
  },
  {
    key: 'manual',
    label: '手工录入',
    hint: '什么都没有，自己写一条',
    placeholder: '直接描述这件事。识别不出项目和资产时，确认前需要你手工补全。',
  },
]

export function ImportPanel({ onImport, onClose }: ImportPanelProps) {
  const [channel, setChannel] = useState<SourceChannel>('paste')
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [from, setFrom] = useState('')

  const active = CHANNELS.find((entry) => entry.key === channel) ?? CHANNELS[0]
  const ready = text.trim().length > 0

  return (
    <section className="gp-card gp-import" aria-label="导入候选">
      <header className="gp-card-head">
        <h2>
          导入候选
          <small>下面四条路径都不需要企业管理员审批，今天就能用</small>
        </h2>
        <button type="button" className="gp-btn" onClick={onClose}>
          收起
        </button>
      </header>

      <div className="gp-import-body">
        <div className="gp-import-channels" role="radiogroup" aria-label="导入方式">
          {CHANNELS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="radio"
              aria-checked={entry.key === channel}
              className={`gp-import-channel${entry.key === channel ? ' is-active' : ''}`}
              onClick={() => setChannel(entry.key)}
            >
              <strong>{entry.label}</strong>
              <span>{entry.hint}</span>
            </button>
          ))}
        </div>

        <div className="gp-import-form">
          <div className="gp-import-meta">
            <label>
              <span>标题 / 邮件主题（可空）</span>
              <input
                className="gp-input"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="留空时取正文前 24 个字"
              />
            </label>
            <label>
              <span>来自（可空）</span>
              <input
                className="gp-input"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                placeholder="发件人、转发人或留空"
              />
            </label>
          </div>

          <label className="gp-import-text">
            <span>原文</span>
            <textarea
              className="gp-input gp-textarea"
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={active.placeholder}
            />
          </label>

          <div className="gp-import-foot">
            <p className="gp-import-note">
              导入<strong>只生成候选</strong>，不改动项目、排期、反馈或结项的任何一个字节。
              识别不出项目或资产时会留空并阻断确认——不编造一个看起来合理的项目号。
            </p>
            <button
              type="button"
              className="gp-btn gp-btn-primary"
              disabled={!ready}
              title={ready ? undefined : '先粘贴原文'}
              onClick={() => {
                onImport({
                  text,
                  channel,
                  subject: subject.trim() || undefined,
                  from: from.trim() || undefined,
                })
                setText('')
                setSubject('')
                setFrom('')
              }}
            >
              识别并生成候选
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
