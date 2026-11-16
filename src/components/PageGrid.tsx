/**
 * 文件内页面网格：展示全部页面（含已删除），点选删除/恢复、拖拽排序，页码自动递补。
 */
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
import { useStudio } from '@/store'
import { pageOrderOf } from '@/store'
import type { PdfFileRecord } from '@/store'
import { PageThumb } from './PageThumb'

export function PageGrid({ record }: { record: PdfFileRecord }) {
  const togglePageDeleted = useStudio((s) => s.togglePageDeleted)
  const reorderPages = useStudio((s) => s.reorderPages)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const order = pageOrderOf(record)
  const deleted = new Set(record.deletedPages)
  const keptCount = record.pageCount - record.deletedPages.length

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
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          将排版 <b className="text-foreground tabular-nums">{keptCount}</b> / {record.pageCount} 页 · 点击删除或恢复，拖动排序，页码自动递补
        </span>
        {record.deletedPages.length > 0 && (
          <span className="text-destructive">已删 {record.deletedPages.length} 页</span>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 overflow-y-auto rounded-md border bg-background p-2">
            {order.map((originalIndex) => {
              const isDeleted = deleted.has(originalIndex)
              const display = isDeleted ? null : ++counter
              return (
                <PageThumb
                  key={originalIndex}
                  record={record}
                  pageIndex={originalIndex}
                  displayNumber={display}
                  onToggle={() => togglePageDeleted(record.id, originalIndex)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
