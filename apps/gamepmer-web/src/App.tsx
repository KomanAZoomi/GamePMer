import './App.css'

const timelineDays = ['7/17', '7/18', '7/21', '7/22', '7/23', '7/24', '7/25']

function App() {
  return (
    <main className="workspace-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">GAMEPMER / INTERNAL DEMO</p>
          <h1>制作工作台</h1>
        </div>
        <div className="header-actions" aria-label="工作台操作">
          <span className="sync-state">本地演示数据</span>
          <button type="button" className="quiet-button">导入反馈</button>
          <button type="button" className="primary-button">新增项目</button>
        </div>
      </header>

      <section className="workspace-grid" aria-label="排期工作台">
        <aside className="project-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">项目与资产</p>
              <h2>当前制作</h2>
            </div>
            <button type="button" className="icon-button" aria-label="展开项目筛选">⌄</button>
          </div>
          <nav aria-label="项目列表">
            <button type="button" className="project-card is-active">
              <span className="project-type">3D</span>
              <span className="project-name">P-3D-024</span>
              <span className="project-meta">MECH-01 · 制作中</span>
            </button>
            <button type="button" className="asset-row is-active">MECH-01 / 机甲单位</button>
            <button type="button" className="asset-row">MECH-02 / 载具</button>
            <button type="button" className="project-card">
              <span className="project-type">2D</span>
              <span className="project-name">P-2D-018</span>
              <span className="project-meta">角色概念 · 制作中</span>
            </button>
            <button type="button" className="project-card">
              <span className="project-type">3D</span>
              <span className="project-name">P-3D-031</span>
              <span className="project-meta">场景道具 · 待启动</span>
            </button>
          </nav>
          <div className="panel-summary">
            <strong>3</strong><span>个项目正在跟进</span>
          </div>
        </aside>

        <section className="schedule-panel" aria-label="MECH-01 排期">
          <div className="schedule-heading">
            <div>
              <p className="eyebrow">P-3D-024 / MECH-01</p>
              <h2>机甲单位 · PBR 流程</h2>
            </div>
            <div className="schedule-legend" aria-label="排期图例">
              <span><i className="legend-bar complete" />已完成</span>
              <span><i className="legend-bar active" />进行中</span>
              <span><i className="legend-bar draft" />重排草案</span>
            </div>
          </div>
          <div className="gantt" role="table" aria-label="PBR 阶段甘特图">
            <div className="gantt-row gantt-header" role="row">
              <div role="columnheader">制作节点</div>
              <div className="timeline-labels" role="columnheader">{timelineDays.map((day) => <span key={day}>{day}</span>)}</div>
            </div>
            {[
              ['中模', '已验收', 'bar-complete', 0, 2],
              ['高模', '反馈中', 'bar-active', 2, 2],
              ['低模', '待开始', 'bar-planned', 4, 2],
              ['烘焙', '待开始', 'bar-planned', 5, 1],
              ['贴图', '待开始', 'bar-planned', 5, 2],
              ['LOD', '待开始', 'bar-planned', 6, 1],
            ].map(([name, status, barClass, start, span]) => (
              <div className="gantt-row" role="row" key={name}>
                <div className="stage-cell" role="cell"><strong>{name}</strong><span>{status}</span></div>
                <div className="timeline" role="cell">
                  <div className={`schedule-bar ${barClass}`} style={{ gridColumn: `${Number(start) + 1} / span ${span}` }}>{name === '高模' ? '高模调整中' : ''}</div>
                </div>
              </div>
            ))}
          </div>
          <footer className="schedule-footer">
            <span>当前基线：2026.07.17 — 2026.07.25</span>
            <span className="risk-chip">1 条客户反馈待处理</span>
          </footer>
        </section>

        <aside className="feedback-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">客户反馈</p>
              <h2>F-017</h2>
            </div>
            <span className="feedback-status">待处理</span>
          </div>
          <p className="feedback-quote">“高模肩甲比例需要调整，预计返修 2 个工作日。”</p>
          <dl className="feedback-meta">
            <div><dt>来源</dt><dd>手动录入</dd></div>
            <div><dt>关联节点</dt><dd>高模</dd></div>
            <div><dt>影响</dt><dd>后续 4 个节点</dd></div>
          </dl>
          <div className="impact-card">
            <p className="eyebrow">影响预览</p>
            <strong>将生成重排草案</strong>
            <span>系统只提出建议，不会修改已确认的基线。</span>
          </div>
          <button type="button" className="primary-button full-width">查看影响并生成草案</button>
          <button type="button" className="quiet-button full-width">暂不处理</button>
        </aside>
      </section>
    </main>
  )
}

export default App
