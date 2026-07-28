import { useState } from 'react'
import type { NotificationDraft } from '../../domain/model'

interface NotificationListProps {
  notifications: NotificationDraft[]
  onMarkSent: (id: string, via: string) => void
  onUnmark: (id: string) => void
}

const CHANNELS = ['公司邮件系统（Outlook）', '企业微信', '飞书', '当面/电话确认']

/**
 * 通知草稿列表。
 *
 * 工作台不发信，这里也绝不能出现「已发送」这种会被读成系统投递成功的说法。
 * 真实发送在 Outlook 或企微里完成，PM 回来把它标记为已发出——
 * 记录的是人工声明，措辞必须让人一眼看出这个区别。
 */
export function NotificationList({ notifications, onMarkSent, onUnmark }: NotificationListProps) {
  const [via, setVia] = useState(CHANNELS[0])
  const [copied, setCopied] = useState<string | undefined>()

  const pending = notifications.filter((item) => item.status === 'draft').length
  const marked = notifications.length - pending

  const copy = async (item: NotificationDraft) => {
    const text = `${item.subject}\n\n收件人：${item.recipientName}\n\n${item.body}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(item.id)
      window.setTimeout(() => setCopied(undefined), 2000)
    } catch {
      setCopied(undefined)
    }
  }

  return (
    <section className="gp-notifications" aria-label="通知草稿">
      <h3>
        通知草稿 · {pending} 封待发出 / {marked} 封已标记发出
      </h3>
      <p className="gp-notifications-lead">
        工作台<strong>不发送邮件</strong>，也不接管你的邮箱。请复制正文到 Outlook 或企业微信里发出，
        再回来标记——标记记录的是你的确认，不是系统投递回执。
      </p>

      {notifications.map((item) => (
        <article key={item.id} className="gp-notification">
          <header>
            <strong>{item.subject}</strong>
            <span className={`gp-pill ${item.status === 'draft' ? 'is-flag' : 'is-plan'}`}>
              {item.status === 'draft' ? '待发出' : '已标记发出'}
            </span>
          </header>
          <p className="gp-notification-to">
            收件人：{item.recipientName}（{item.recipientRole}）
          </p>
          <pre className="gp-notification-body">{item.body}</pre>

          {item.status === 'draft' ? (
            <div className="gp-notification-actions">
              <button type="button" className="gp-btn" onClick={() => copy(item)}>
                {copied === item.id ? '已复制到剪贴板' : '复制正文'}
              </button>
              <label className="gp-notification-via">
                <span className="gp-visually-hidden">发送渠道</span>
                <select
                  className="gp-input"
                  aria-label={`${item.recipientRole} 通知的发送渠道`}
                  value={via}
                  onChange={(event) => setVia(event.target.value)}
                >
                  {CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="gp-btn" onClick={() => onMarkSent(item.id, via)}>
                我已发出，标记为已发送
              </button>
            </div>
          ) : (
            <div className="gp-notification-actions">
              <p className="gp-notification-sent">
                {item.markedSentBy} 于 {item.markedSentAt?.slice(0, 16).replace('T', ' ')} 声明已通过
                {item.markedSentVia}发出
              </p>
              <button type="button" className="gp-btn" onClick={() => onUnmark(item.id)}>
                标错了，撤回标记
              </button>
            </div>
          )}

          {item.status === 'draft' && (
            <p className="gp-notification-note">
              标记之后关联的排期修订就不能再撤销——团队已经收到新排期，撤销也收不回来。
            </p>
          )}
        </article>
      ))}
    </section>
  )
}
