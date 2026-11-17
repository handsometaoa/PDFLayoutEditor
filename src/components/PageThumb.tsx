/**
 * 单页缩略图 = ①页面处理操作单元：
 * 点击打开放大预览（可删除/恢复），拖拽排序，↻ 旋转。
 * 徽标显示删除后自动递补的新页码，tooltip 显示原始页号。
 */
import { useSortable } from '@dnd-kit/sortable'
import { Redo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { pageVisualSize } from '@/store'
import type { PdfFileRecord } from '@/store'
import { PageCanvas } from './PageCanvas'

interface PageThumbProps {
  record: PdfFileRecord
  pageIndex: number
  /** 删除后递补的显示页码；null 表示该页已被删除 */
  displayNumber: number | null
  /** 用户附加旋转角度（顺时针，90 的倍数） */
  rotated: number
  onOpen: () => void
  onRotate: () => void
}

export function PageThumb({ record, pageIndex, displayNumber, rotated, onOpen, onRotate }: PageThumbProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pageIndex,
  })
  // 展示纵横比含用户附加旋转（最终成品即此方向）
  const visual = pageVisualSize(record, pageIndex)
  const aspect = visual.height > 0 ? `${visual.width} / ${visual.height}` : '3 / 4'
  const deleted = displayNumber === null
  const style =
    transform && (transform.x !== 0 || transform.y !== 0)
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
      : undefined

  return (
    <div ref={setNodeRef} style={style} className={cn('relative', isDragging && 'z-10 opacity-80')}>
      <button
        type="button"
        onClick={onOpen}
        title={
          deleted
            ? `原始第 ${pageIndex + 1} 页（已删除）— 点击放大预览/恢复`
            : `原始第 ${pageIndex + 1} 页 — 点击放大预览（拖动排序，↻ 旋转）`
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
      {!deleted && (
        <button
          type="button"
          title={`旋转 90°（当前 ${rotated}°）`}
          onClick={(e) => {
            e.stopPropagation()
            onRotate()
          }}
          className={cn(
            'absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full border bg-white/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground',
            rotated > 0 && 'border-primary/50 text-primary',
          )}
        >
          <Redo2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
