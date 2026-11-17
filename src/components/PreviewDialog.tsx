/**
 * 成品预览对话框：pdf.js 逐页渲染生成结果，标注章节起始页。
 * 支持多个输出文件（不合并模式）切换；画布放大至接近全屏。
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getPdfDoc, isRenderCancelled } from '@/lib/pdfjs'
import { cn } from '@/lib/utils'
import type { OutputResult } from '@/store'

interface PreviewDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  outputs: OutputResult[]
  index: number
  onIndexChange: (i: number) => void
}

export function PreviewDialog({ open, onOpenChange, outputs, index, onIndexChange }: PreviewDialogProps) {
  const result = outputs[index]
  const [pageNum, setPageNum] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [avail, setAvail] = useState(0)

  useEffect(() => {
    if (open) setPageNum(1)
  }, [open, index])

  // 键盘翻页：← / →（对话框打开时）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && result && pageNum < result.pageCount) {
        setPageNum((p) => Math.min(result.pageCount, p + 1))
      } else if (e.key === 'ArrowLeft' && pageNum > 1) {
        setPageNum((p) => Math.max(1, p - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pageNum, result])

  // 对话框宽度随窗口变化时重新渲染画布（不依赖容器 ref：Base UI 内容异步挂载，
  // 打开瞬间 ref 可能为 null）
  useEffect(() => {
    if (!open) return
    const onResize = () => setAvail(Math.min(window.innerWidth * 0.94, 1280) - 48)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open])

  useEffect(() => {
    if (!open || !result || avail <= 0) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void (async () => {
      try {
        const doc = await getPdfDoc(`preview:${result.url}`, async () => {
          const buf = await fetch(result.url).then((r) => r.arrayBuffer());
          return new Uint8Array(buf);
        });
        if (cancelled) return
        const page = await doc.getPage(Math.min(pageNum, result.pageCount))
        if (cancelled) return
        const container = containerRef.current
        const canvas = canvasRef.current
        if (!container || !canvas) return
        const base = page.getViewport({ scale: 1 })
        // 整页包含式渲染：宽高同时受容器约束，避免页面被裁切导致比例感知错误
        const availW = Math.max(300, avail - 16)
        const availH = Math.max(240, window.innerHeight * 0.72 - 24)
        const scale = Math.min(availW / base.width, availH / base.height)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: scale * dpr })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(base.width * scale)}px`
        canvas.style.height = 'auto'
        const renderTask = page.render({ canvas, viewport })
        task = renderTask
        await renderTask.promise
      } catch (err) {
        if (!cancelled && !isRenderCancelled(err)) console.warn('预览渲染失败', err)
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [open, pageNum, result, avail])

  const isPadPage = result?.padPages?.includes(pageNum) ?? false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[min(94vw,1280px)]">
        <DialogHeader>
          <DialogTitle className="text-base">成品预览</DialogTitle>
        </DialogHeader>
        {result && result.chapterStarts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {result.chapterStarts.map((c, i) => {
              const next = result.chapterStarts[i + 1]?.startPage ?? result.pageCount + 1
              const active = pageNum >= c.startPage && pageNum < next
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setPageNum(c.startPage)}
                  title={`跳到第 ${c.startPage} 页`}
                  className={cn(
                    'h-7 max-w-[240px] truncate rounded-full border px-3 text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary/10 font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {c.name} · P{c.startPage}
                </button>
              )
            })}
            {isPadPage && <Badge variant="outline">本章末尾补页（空白）</Badge>}
          </div>
        )}
        {outputs.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {outputs.map((o, i) => (
              <Button
                key={o.url}
                variant={i === index ? 'default' : 'outline'}
                size="sm"
                className={cn('h-7 max-w-[260px] px-2 text-xs', i !== index && 'text-muted-foreground')}
                title={o.fileName}
                onClick={() => onIndexChange(i)}
              >
                <span className="truncate">{o.fileName}</span>
              </Button>
            ))}
          </div>
        )}
        <div
          ref={containerRef}
          className="flex max-h-[72vh] justify-center overflow-y-auto rounded-md bg-muted/60 p-2"
        >
          <canvas ref={canvasRef} className="h-auto shadow-md" />
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={pageNum <= 1}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />上一页
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            第 {pageNum} / {result?.pageCount ?? 0} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!result || pageNum >= result.pageCount}
            onClick={() => setPageNum((p) => p + 1)}
          >
            下一页<ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
