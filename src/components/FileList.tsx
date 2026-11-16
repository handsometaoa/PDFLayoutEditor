/**
 * 章节文件列表：DndContext 拖拽排序，顺序即合并顺序。
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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useStudio } from '@/store'
import { FileCard } from './FileCard'

export function FileList() {
  const files = useStudio((s) => s.files)
  const moveFile = useStudio((s) => s.moveFile)
  const removeFile = useStudio((s) => s.removeFile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = files.findIndex((f) => f.id === active.id)
    const to = files.findIndex((f) => f.id === over.id)
    if (from >= 0 && to >= 0) moveFile(from, to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {files.map((record, index) => (
            <FileCard key={record.id} record={record} index={index} onRemove={removeFile} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
