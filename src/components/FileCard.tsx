/**
 * 章节文件卡片：拖拽排序、展开页面管理、删除文件。
 */
import { useSortable } from '@dnd-kit/sortable'
import { ChevronDown, GripVertical, Loader2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatBytes, useStudio } from '@/store'
import type { PdfFileRecord } from '@/store'
import { PageGrid } from './PageGrid'

interface FileCardProps {
  record: PdfFileRecord
  index: number
  onRemove: (id: string) => void
}

export function FileCard({ record, index, onRemove }: FileCardProps) {
  const toggleExpand = useStudio((s) => s.toggleExpand)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: record.id,
  })
  const kept = record.pageCount - record.deletedPages.length
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
    : undefined

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn('overflow-visible', isDragging && 'z-10 opacity-80 shadow-lg')}
    >
      <div className="flex items-center gap-1.5 p-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 cursor-grab touch-none text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={record.name}>{record.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {record.status === 'loading' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> 解析中…
              </>
            )}
            {record.status === 'ready' && (
              <span>{record.pageCount} 页 · {formatBytes(record.size)}</span>
            )}
            {record.status === 'error' && record.errorKind === 'encrypted' && (
              <span className="font-medium text-destructive">已加密（含密码/权限保护），无法处理</span>
            )}
            {record.status === 'error' && record.errorKind === 'invalid' && (
              <span className="font-medium text-destructive">文件无法解析</span>
            )}
          </div>
        </div>
        {record.status === 'ready' && (
          <>
            {record.deletedPages.length > 0 && (
              <Badge variant="destructive" className="shrink-0">删 {record.deletedPages.length}</Badge>
            )}
            <Badge variant="outline" className="shrink-0 tabular-nums">{kept} 页</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => toggleExpand(record.id)}
              title={record.expanded ? '收起页面' : '展开页面管理'}
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', record.expanded && 'rotate-180')} />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(record.id)}
          title="移除文件"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {record.expanded && record.status === 'ready' && <PageGrid record={record} />}
    </Card>
  )
}
