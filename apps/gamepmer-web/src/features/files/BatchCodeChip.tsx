import { parseBatchCode } from '../../domain/batchCode'

/**
 * 批次编号分段显示。
 *
 * `NST_A_3D_B24` 拆成客户 / 项目 / 类型 / 批次四段分色——
 * 编号本身就带信息，摊开来比一串下划线好读。解析不出就原样显示，不高亮。
 */
export function BatchCodeChip({ code }: { code: string }) {
  const parse = parseBatchCode(code)
  if (!parse.valid) return <span className="gp-batch-code is-raw">{code}</span>

  return (
    <span className="gp-batch-code">
      <span className="gp-seg is-client">{parse.clientCode}</span>_
      <span className="gp-seg is-project">{parse.projectCode}</span>_
      <span className="gp-seg is-discipline">{parse.discipline}</span>_
      <span className="gp-seg is-batch">{parse.batchNo}</span>
    </span>
  )
}
