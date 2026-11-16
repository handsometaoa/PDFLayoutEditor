/**
 * 单页缩略图：可拖拽排序（dnd-kit 网格），点击切换删除/恢复。
 * 徽标显示删除后自动递补的新页码，tooltip 显示原始页号。
 */
import { useSortable } from '@dnd-kit/sortable'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PdfFileRecord } from '@/store'
import { PageCanvas } from './PageCanvas'

interface PageThumbProps {
  record: PdfFileRecord
  pageIndex: number
  /** 删除后递补的显示页码；null 表示该页已被删除 */
  displayNumber: number | null
  onToggle: () => void
}

export function PageThumb({ record, pageIndex, displayNumber, onToggle }: PageThumbProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pageIndex,
  })
  const size = record.pages[pageIndex]
  const aspect = size && size.height > 0 ? `${size.width} / ${size.height}` : '3 / 4'
  const deleted = displayNumber === null
  const style =
    transform && (transform.x !== 0 || transform.y !== 0)
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
      : undefined

  return (
    <div ref={setNodeRef} style={style} className={cn('relative', isDragging && 'z-10 opacity-80')}>
      <button
        type="button"
        onClick={onToggle}
        title={
          deleted
            ? `原始第 ${pageIndex + 1} 页（已删除）— 点击恢复`
            : `原始第 ${pageIndex + 1} 页 — 点击删除（拖动可排序）`
        }
        {...attributes}
        {...listeners}
        className={cn(
          'block w-full cursor-grab touch-none overflow-hidden rounded-md border transition-all hover:ring-2 hover:ring-primary/60 focus-visible:outline-none',
          deleted && 'opacity-45 saturate-0',
        )}
      >
        <div className="relative w-full bg-white" style={{ aspectRatio: aspect }}>
          <PageCanvas record={record} pageIndex={pageIndex} targetWidth={150} />
        </div>
      </button>
      <div className="pointer-events-none absolute left-1 top-1">
        {deleted ? (
          <Badge variant="destructive" className="text-[10px]">已删除</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] tabular-nums">{displayNumber}</Badge>
        )}
      </div>
    </div>
  )
}
