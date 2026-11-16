/**
 * 单页画布：pdf.js 懒渲染（IntersectionObserver 触发，滚出视野即取消）。
 * 供缩略图与即时排版预览复用；外层容器负责宽高比。
 */
import { useEffect, useRef, useState } from 'react'
import { getPdfDoc, isRenderCancelled } from '@/lib/pdfjs'
import { cn } from '@/lib/utils'
import type { PdfFileRecord } from '@/store'

interface PageCanvasProps {
  record: PdfFileRecord
  pageIndex: number
  targetWidth?: number
  className?: string
}

export function PageCanvas({ record, pageIndex, targetWidth = 150, className }: PageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void (async () => {
      try {
        const doc = await getPdfDoc(record.id, async () => new Uint8Array(await record.file.arrayBuffer()))
        if (cancelled) return
        const page = await doc.getPage(pageIndex + 1)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: (targetWidth * dpr) / base.width })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const renderTask = page.render({ canvas, viewport })
        task = renderTask
        await renderTask.promise
      } catch (err) {
        if (!cancelled && !isRenderCancelled(err)) {
          console.warn(`缩略图渲染失败（第 ${pageIndex + 1} 页）`, err)
        }
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, pageIndex, record.id, record.file, targetWidth])

  return (
    <div ref={wrapperRef} className={cn('relative h-full w-full', className)}>
      <canvas ref={canvasRef} className={cn('absolute inset-0 h-full w-full', !visible && 'invisible')} />
    </div>
  )
}
