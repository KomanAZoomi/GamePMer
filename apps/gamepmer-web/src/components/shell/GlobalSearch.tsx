import { useEffect, useId, useMemo, useRef, useState } from 'react'

import {
  SEARCHABLE_KINDS,
  SEARCH_KIND_LABEL,
  SEARCH_MIN_LENGTH,
  searchAll,
  type SearchHit,
} from '../../domain/search'
import type { DemoState } from '../../domain/model'

/**
 * 顶栏全局搜索。
 *
 * 原来这里是个空壳输入框——能打字、什么都不接。改成真的能搜、能跳。
 *
 * 键盘优先：`↑` `↓` 选，`Enter` 打开，`Esc` 关掉。
 * 鼠标用户点结果也走同一条路径，不做两套逻辑。
 */

interface GlobalSearchProps {
  demo: DemoState
  onOpen: (hit: SearchHit) => void
}

export function GlobalSearch({ demo, onOpen }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const hits = useMemo(() => searchAll(demo, query), [demo, query])
  const typed = query.trim().length
  const tooShort = typed > 0 && typed < SEARCH_MIN_LENGTH
  const noMatch = typed >= SEARCH_MIN_LENGTH && hits.length === 0

  useEffect(() => setActive(0), [query])

  // 点到别处就收起来——面板压着页面内容不放很烦人
  useEffect(() => {
    if (!open) return
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentPointerDown)
    return () => document.removeEventListener('mousedown', onDocumentPointerDown)
  }, [open])

  function choose(hit: SearchHit) {
    onOpen(hit)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Chromium 对 `type="search"` 的默认行为是「Esc 直接清空输入框」。
      // 面板开着时先只收面板——一次 Esc 同时关面板又清空，人会以为自己打的字丢了。
      // 面板已经关了就放行，第二次 Esc 照旧清空。
      if (open) event.preventDefault()
      setOpen(false)
      return
    }
    if (hits.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(hits[active])
    }
  }

  const expanded = open && typed > 0

  return (
    <div className="gp-search" ref={boxRef}>
      <label className="gp-visually-hidden" htmlFor={`${listId}-input`}>
        全局搜索
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-expanded={expanded}
        aria-controls={`${listId}-list`}
        aria-activedescendant={expanded && hits[active] ? `${listId}-${hits[active].id}` : undefined}
        placeholder="搜索项目、资产、阶段、反馈、报价、路径…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {expanded && (
        <div className="gp-search-panel" id={`${listId}-list`} role="listbox" aria-label="搜索结果">
          {tooShort && <p className="gp-search-note">再多打一个字——单个字符会把几乎所有记录都命中。</p>}

          {noMatch && (
            <p className="gp-search-note">
              没有匹配的记录。搜索覆盖
              {SEARCHABLE_KINDS.map((entry) => entry.label).join(' / ')}
              ，按编号、名称、客户原文和路径匹配；<b>不按人名检索</b>。
            </p>
          )}

          {hits.map((hit, index) => (
            <button
              key={hit.id}
              id={`${listId}-${hit.id}`}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`gp-search-hit${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(hit)}
            >
              <span className={`gp-search-kind is-${hit.kind}`}>{SEARCH_KIND_LABEL[hit.kind]}</span>
              <span className="gp-search-text">
                <strong>{hit.title}</strong>
                <em>{hit.subtitle}</em>
              </span>
              <span className="gp-search-matched">命中 {hit.matchedOn}</span>
            </button>
          ))}

          {hits.length > 0 && (
            <p className="gp-search-note gp-search-foot">
              <kbd>↑</kbd> <kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭
            </p>
          )}
        </div>
      )}
    </div>
  )
}
