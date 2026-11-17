/**
 * 文件内页面网格 = ①页面处理区：
 * 检测空白页、页码范围提取、单页旋转、点选删除/拖拽排序，页码自动递补。
 */
import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { Eraser, Redo2, Scissors, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { detectBlankPages, detectContentCrops } from '@/lib/pdfjs'
import { useStudio } from '@/store'
import { pageOrderOf } from '@/store'
import type { PdfFileRecord } from '@/store'
import { PageThumb } from './PageThumb'
import { PageViewerDialog } from './PageViewerDialog'

export function PageGrid({ record }: { record: PdfFileRecord }) {
  const reorderPages = useStudio((s) => s.reorderPages)
  const rotatePage = useStudio((s) => s.rotatePage)
  const applyPageRange = useStudio((s) => s.applyPageRange)
  const markPagesDeleted = useStudio((s) => s.markPagesDeleted)
  const setPageCrops = useStudio((s) => s.setPageCrops)
  const clearPageCrops = useStudio((s) => s.clearPageCrops)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const order = pageOrderOf(record)
  const deleted = new Set(record.deletedPages)
  const keptCount = record.pageCount - record.deletedPages.length

  const [scanning, setScanning] = useState<{ current: number; total: number } | null>(null)
  const [trimming, setTrimming] = useState<{ current: number; total: number } | null>(null)
  const [rangeText, setRangeText] = useState('')
  const [viewerPos, setViewerPos] = useState<number | null>(null)
  const hasCrops = Object.keys(record.pageCrops ?? {}).length > 0

  const trimMargins = async () => {
    if (trimming) return
    if (hasCrops) {
      clearPageCrops(record.id)
      toast.info('已清除裁白边')
      return
    }
    setTrimming({ current: 0, total: record.pageCount })
    try {
      const bytes = new Uint8Array(await record.file.arrayBuffer())
      const crops = await detectContentCrops(bytes, record.pageCount, (current, total) =>
        setTrimming({ current, total }),
      )
      const count = Object.keys(crops).length
      if (count === 0) {
        toast.info('各页边距已紧凑，无需裁白边')
      } else {
        setPageCrops(record.id, crops)
        toast.success(`已为 ${count} 页设置裁白边（排版预览可见效果）`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '裁白边检测失败')
    } finally {
      setTrimming(null)
    }
  }

  const scanBlank = async () => {
    if (scanning) return
    setScanning({ current: 0, total: record.pageCount })
    try {
      const bytes = new Uint8Array(await record.file.arrayBuffer())
      const blank = await detectBlankPages(bytes, record.pageCount, (current, total) =>
        setScanning({ current, total }),
      )
      if (blank.length === 0) {
        toast.info('未发现空白页')
      } else {
        const total = markPagesDeleted(record.id, blank)
        toast.success(`发现并标记 ${blank.length} 页空白（共删 ${total} 页，可点击恢复）`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '空白页检测失败')
    } finally {
      setScanning(null)
    }
  }

  const applyRange = () => {
    if (applyPageRange(record.id, rangeText)) {
      const kept = record.pageCount - record.deletedPages.length
      toast.success(`已应用页码范围（保留 ${kept} 页）`)
    } else {
      toast.error('页码范围格式：如 1-20, 25, 30-40（需在页数范围内）')
    }
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = active.data.current?.sortable?.index
    const to = over.data.current?.sortable?.index
    if (typeof from === 'number' && typeof to === 'number' && from !== to) {
      reorderPages(record.id, from, to)
    }
  }

  let counter = 0
  return (
    <div className="space-y-2 border-t bg-muted/20 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={scanning !== null}
          onClick={() => void scanBlank()}
        >
          <Eraser className="mr-1 h-3.5 w-3.5" />
          {scanning ? `检测中 ${scanning.current}/${scanning.total}` : '检测空白页'}
        </Button>
        <Input
          value={rangeText}
          onChange={(e) => setRangeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyRange()
          }}
          placeholder="页码范围 1-20, 25"
          className="h-7 w-44 text-xs"
        />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={applyRange}>
          <Redo2 className="mr-1 h-3.5 w-3.5" />
          应用范围
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={trimming !== null || scanning !== null}
          onClick={() => void trimMargins()}
        >
          <Scissors className="mr-1 h-3.5 w-3.5" />
          {trimming ? `裁边中 ${trimming.current}/${trimming.total}` : hasCrops ? '清除裁边' : '裁白边'}
        </Button>
        {hasCrops && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              clearPageCrops(record.id)
              toast.info('已清除裁白边')
            }}
          >
            <Undo2 className="mr-1 h-3.5 w-3.5" />
            撤销
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          将排版 <b className="text-foreground tabular-nums">{keptCount}</b> / {record.pageCount} 页
          {record.deletedPages.length > 0 && (
            <span className="text-destructive"> · 已删 {record.deletedPages.length}</span>
          )}
          {Object.keys(record.pageRotations ?? {}).length > 0 && (
            <span> · 已旋转 {Object.keys(record.pageRotations ?? {}).length} 页</span>
          )}
          {hasCrops && <span> · 已裁边 {hasCrops ? Object.keys(record.pageCrops ?? {}).length : 0} 页</span>}
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 overflow-y-auto rounded-md border bg-background p-2">
            {order.map((originalIndex, orderPos) => {
              const isDeleted = deleted.has(originalIndex)
              const display = isDeleted ? null : ++counter
              return (
                <PageThumb
                  key={originalIndex}
                  record={record}
                  pageIndex={originalIndex}
                  displayNumber={display}
                  rotated={record.pageRotations?.[originalIndex] ?? 0}
                  onOpen={() => setViewerPos(orderPos)}
                  onRotate={() => rotatePage(record.id, originalIndex)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      {viewerPos !== null && (
        <PageViewerDialog
          record={record}
          pos={viewerPos}
          onPos={setViewerPos}
          onClose={() => setViewerPos(null)}
        />
      )}
    </div>
  )
}
