/**
 * 页面放大预览对话框（①页面处理）：
 * 左右切换浏览导入页，可直接删除/恢复；键盘 ←/→ 翻页、Delete 删除。
 * 删除/恢复与缩略图网格共用同一状态，实时联动。
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Redo2, Trash2, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getPdfDoc, isRenderCancelled } from '@/lib/pdfjs'
import { cn } from '@/lib/utils'
import { pageOrderOf, useStudio } from '@/store'
import type { PdfFileRecord } from '@/store'

interface PageViewerDialogProps {
  record: PdfFileRecord
  /** 在展示顺序中的位置（含已删除页） */
  pos: number
  onPos: (pos: number) => void
  onClose: () => void
}

export function PageViewerDialog({ record, pos, onPos, onClose }: PageViewerDialogProps) {
  const order = pageOrderOf(record)
  const safePos = Math.min(Math.max(pos, 0), order.length - 1)
  const pageIndex = order[safePos] ?? 0
  const deleted = record.deletedPages.includes(pageIndex)
  const rotated = record.pageRotations?.[pageIndex] ?? 0
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [err, setErr] = useState<string | null>(null)

  const togglePageDeleted = useStudio((s) => s.togglePageDeleted)
  const rotatePage = useStudio((s) => s.rotatePage)

  // 递补页码：此前（含自身）保留页计数
  const deletedSet = new Set(record.deletedPages)
  let displayNumber: number | null = null
  if (!deleted) {
    let c = 0
    for (let i = 0; i <= safePos && i < order.length; i++) {
      if (!deletedSet.has(order[i]!)) c++
    }
    displayNumber = c
  }

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void (async () => {
      try {
        const doc = await getPdfDoc(record.id, async () => new Uint8Array(await record.file.arrayBuffer()))
        if (cancelled) return
        const page = await doc.getPage(pageIndex + 1)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const availW = Math.max(300, window.innerWidth * 0.9 - 64)
        const availH = Math.max(240, window.innerHeight * 0.72 - 150)
        const scale = Math.min(availW / base.width, availH / base.height)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: scale * dpr })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(base.width * scale)}px`
        canvas.style.height = 'auto'
        const renderTask = page.render({ canvas, viewport })
        task = renderTask
        await renderTask.promise
      } catch (e) {
        if (!cancelled && !isRenderCancelled(e)) setErr(String(e))
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pageIndex, record.id, record.file])

  // 键盘：←/→ 翻页，Delete/Backspace 删除或恢复
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && safePos < order.length - 1) onPos(safePos + 1)
      else if (e.key === 'ArrowLeft' && safePos > 0) onPos(safePos - 1)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        togglePageDeleted(record.id, pageIndex)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, safePos, order.length, pageIndex, record.id, togglePageDeleted, onPos])

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[min(94vw,1280px)]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            页面预览 · 原始第 {pageIndex + 1} 页
            {deleted ? (
              <Badge variant="destructive">已删除</Badge>
            ) : (
              <Badge variant="secondary">排版序号 {displayNumber}</Badge>
            )}
            {rotated > 0 && (
              <Badge variant="outline" className="gap-1">
                <Redo2 className="h-3 w-3" />
                已旋转 {rotated}°
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            ← / → 切换页面，Delete 键删除或恢复；删除只作标记，页码自动递补
          </DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            'flex max-h-[68vh] justify-center overflow-hidden rounded-md bg-muted/60 p-2',
            deleted && 'opacity-45 saturate-0',
          )}
        >
          <canvas ref={canvasRef} className="h-auto shadow-md" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePos <= 0}
            onClick={() => onPos(safePos - 1)}
          >
            <ChevronLeft className="h-4 w-4" />上一页
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            第 {safePos + 1} / {order.length} 页
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant={deleted ? 'outline' : 'destructive'}
              size="sm"
              onClick={() => togglePageDeleted(record.id, pageIndex)}
            >
              {deleted ? (
                <>
                  <Undo2 className="mr-1 h-4 w-4" />恢复此页
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 h-4 w-4" />删除此页
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              title={`旋转 90°（当前 ${rotated}°）`}
              onClick={() => rotatePage(record.id, pageIndex)}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePos >= order.length - 1}
              onClick={() => onPos(safePos + 1)}
            >
              下一页<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </DialogContent>
    </Dialog>
  )
}
