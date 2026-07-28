import { CLOSEOUT_GATE_ORDER, gateState, type GateState } from '../../domain/closeout'
import type { CloseoutCase, CloseoutGateCode, DemoState } from '../../domain/model'

interface GateTrackProps {
  state: DemoState
  item: CloseoutCase
  selected: CloseoutGateCode
  onSelect: (code: CloseoutGateCode) => void
}

const STATE_LABEL: Record<GateState, string> = {
  done: '已完成',
  current: '当前门槛',
  blocked: '前置未完成',
}

/**
 * 结项门禁链。
 *
 * 串行画法是刻意的：五个格子从左到右，被挡住的那几个用虚线加淡化，
 * 让「这一步做不了是因为前面没做完」一眼可见，而不是点下去才报错。
 */
export function GateTrack({ state, item, selected, onSelect }: GateTrackProps) {
  return (
    <div className="gp-gate-area">
      <div className="gp-gate-head">
        <span>结项门禁链</span>
        <span>串行，不能跳步——少一份证据，出账时就说不清</span>
      </div>
      <ol className="gp-gate-track">
        {CLOSEOUT_GATE_ORDER.map((code, index) => {
          const gate = item.gates.find((entry) => entry.code === code)!
          const status = gateState(state, item.id, code)
          return (
            <li key={code} className={`is-${status}${code === selected ? ' is-selected' : ''}`}>
              <button type="button" onClick={() => onSelect(code)}>
                <span className="gp-gate-no">{String(index + 1).padStart(2, '0')}</span>
                <strong>{gate.title}</strong>
                <span className="gp-gate-desc">{gate.description}</span>
                <span className="gp-gate-state">
                  {status === 'done' && gate.completedBy
                    ? `已完成 · ${gate.completedBy}`
                    : STATE_LABEL[status]}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
