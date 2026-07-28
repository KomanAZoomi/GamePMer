/**
 * 批次编号。
 *
 * 公司的项目编号规则是 `客户代号_项目代号_2D|3D_批次号`，例如 `NST_A_3D_B24`：
 *
 * - `NST` 客户代号，2~4 位字母
 * - `A`   项目代号，1~2 位字母或数字
 * - `3D`  2D 还是 3D
 * - `B24` 批次号，B 加 2~3 位数字
 *
 * 盘上的目录就按这个编号建，一个批次的所有资产共用一个反馈盘目录。
 * 批次内部再怎么按日期分子目录是制作侧自己的事，工作台不管也不建模。
 *
 * 这个解析器同时给候选收件箱（从消息里认项目）和文件与归档（登记路径）用——
 * 两处必须是同一份规则，否则识别得出的编号在另一边可能不合法。
 */

export const BATCH_CODE_RULE = '客户代号_项目代号_2D|3D_批次号'
export const BATCH_CODE_EXAMPLE = 'NST_A_3D_B24'

/** 用于在自由文本里捞编号；不带首尾锚点。 */
export const BATCH_CODE_PATTERN = /[A-Z]{2,4}_[A-Z0-9]{1,2}_(?:2D|3D)_B\d{2,3}/

const SEGMENT_RULES = [
  { key: 'clientCode', label: '客户代号', pattern: /^[A-Z]{2,4}$/, hint: '2~4 位大写字母' },
  { key: 'projectCode', label: '项目代号', pattern: /^[A-Z0-9]{1,2}$/, hint: '1~2 位字母或数字' },
  { key: 'discipline', label: '类型', pattern: /^(?:2D|3D)$/, hint: '只能是 2D 或 3D' },
  { key: 'batchNo', label: '批次号', pattern: /^B\d{2,3}$/, hint: 'B 加 2~3 位数字' },
] as const

export interface BatchCodeParse {
  clientCode?: string
  projectCode?: string
  discipline?: '2D' | '3D'
  batchNo?: string
  valid: boolean
  /** 逐段说清哪一段不合法，而不是笼统一句「格式错误」 */
  problems: string[]
}

export function parseBatchCode(code: string): BatchCodeParse {
  const segments = code.trim().split('_')
  const problems: string[] = []

  if (segments.length !== 4) {
    problems.push(
      `编号要有四段（${BATCH_CODE_RULE}），当前是 ${segments.length} 段。例：${BATCH_CODE_EXAMPLE}`,
    )
    return { valid: false, problems }
  }

  const parsed: BatchCodeParse = { valid: false, problems }
  SEGMENT_RULES.forEach((rule, index) => {
    const value = segments[index]
    if (!rule.pattern.test(value)) {
      problems.push(`第 ${index + 1} 段「${rule.label}」应为${rule.hint}，当前是「${value}」`)
      return
    }
    if (rule.key === 'discipline') parsed.discipline = value as '2D' | '3D'
    else if (rule.key === 'clientCode') parsed.clientCode = value
    else if (rule.key === 'projectCode') parsed.projectCode = value
    else parsed.batchNo = value
  })

  parsed.valid = problems.length === 0
  return parsed
}

/** 从一段自由文本里找出批次编号。找不到就是 undefined——不猜。 */
export function findBatchCode(text: string): string | undefined {
  return text.match(BATCH_CODE_PATTERN)?.[0]
}
