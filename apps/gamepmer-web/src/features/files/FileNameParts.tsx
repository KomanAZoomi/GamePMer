import type { FileNameParse } from '../../domain/model'

interface FileNamePartsProps {
  fileName: string
  parse: FileNameParse
}

/**
 * 把文件名按 `资产名_阶段名_YYYYMMDD_rNN` 分色标出来。
 *
 * 这样哪一段没解析出来一眼就能看到——比在旁边写一句「解析失败」有用得多。
 * 解析不出时原样显示，**不高亮、不省略、不改写**。
 */
export function FileNameParts({ fileName, parse }: FileNamePartsProps) {
  if (!parse.assetId || !parse.stageCode) {
    return <span className="gp-fname is-raw">{fileName}</span>
  }

  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  const segments = base.split('_')

  // 段位与解析结果一一对应：0 资产、1 阶段、2 日期、3 版本
  const classOf = (index: number) =>
    index === 0 ? 'asset' : index === 1 ? 'stage' : index === 2 ? 'date' : index === 3 ? 'rev' : 'plain'

  return (
    <span className="gp-fname">
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`}>
          {index > 0 && '_'}
          <span className={`gp-seg is-${classOf(index)}`}>{segment}</span>
        </span>
      ))}
      {ext}
      {!parse.revision && <span className="gp-seg is-missing">缺版本</span>}
    </span>
  )
}
