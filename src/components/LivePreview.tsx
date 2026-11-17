/**
 * 即时排版预览：用与生成完全相同的几何计算（computeSheet/gridCells/fitPage）
 * 在 DOM 中按当前设置实时摆出第一张成品的样子（真实页面缩略图）。
 * 设置变化时几何即时重排；画布按页面缓存，不随设置重渲染。
 */
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageCanvas } from '@/components/PageCanvas'
import { bookletPageOrder, computeSheet, fitPage, gridCells } from '@/lib/pdf/layout'
import { cn } from '@/lib/utils'
import { keptPageIndices, pageVisualSize, useStudio } from '@/store'

function watermarkFontSize(sheet: { width: number; height: number }, text: string, cssScale: number): number {
  const diag = Math.hypot(sheet.width, sheet.height)
  return Math.min((diag * 0.42) / Math.max(1, text.length), Math.min(sheet.width, sheet.height) * 0.6) * cssScale
}

export function LivePreview() {
  const files = useStudio((s) => s.files)
  const settings = useStudio((s) => s.settings)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const readyFiles = files.filter((f) => f.status === 'ready' && f.pageCount - f.deletedPages.length > 0)
  const first = readyFiles[0]
  const kept = first ? keptPageIndices(first) : []
  const effectiveSizes = readyFiles.flatMap((f) => keptPageIndices(f).map((i) => pageVisualSize(f, i)))
  const sourceFirst = first && kept[0] !== undefined ? pageVisualSize(first, kept[0]) : undefined
  const sheet = computeSheet(effectiveSizes, settings, sourceFirst)
  const cells = gridCells(sheet.width, sheet.height, settings.mode, settings.margin, settings.gutter)
  // 版面序列：小册子按折叠页序重排（-1 = 空白槽位）
  const sequence =
    settings.mode === 'booklet'
      ? bookletPageOrder(kept.length).map((p) => (p >= 1 && p <= kept.length ? kept[p - 1]! : -1))
      : kept
  const previewSlots = sequence.slice(0, cells.length)
  const cssScale = width > 0 ? width / sheet.width : 0
  const watermarkText =
    settings.watermarkEnabled && settings.watermarkText.trim() ? settings.watermarkText.trim() : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">排版预览</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-md border bg-white"
          style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }}
        >
          {width > 0 &&
            cells.map((cell, k) => {
              const top = (sheet.height - cell.y - cell.height) * cssScale // PDF y 向上 -> CSS y 向下
              const left = cell.x * cssScale
              const pageIndex = previewSlots[k]
              const page = pageIndex !== undefined && first ? pageVisualSize(first, pageIndex) : undefined
              const fit =
                page && pageIndex !== undefined && pageIndex >= 0 && first
                  ? fitPage(page.width, page.height, cell, settings.autoRotate)
                  : null
              const isBlank = pageIndex === undefined || pageIndex < 0
              return (
                <div
                  key={k}
                  className={cn(
                    'absolute border border-dashed border-muted-foreground/25',
                    isBlank && 'bg-muted/40',
                  )}
                  style={{
                    left,
                    top,
                    width: cell.width * cssScale,
                    height: cell.height * cssScale,
                  }}
                >
                  {fit && page && first && pageIndex !== undefined && pageIndex >= 0 && (
                    <div
                      className="absolute"
                      style={{
                        width: fit.placedWidth * cssScale,
                        height: fit.placedHeight * cssScale,
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div
                        className="relative"
                        style={{
                          width: page.width * fit.scale * cssScale,
                          height: page.height * fit.scale * cssScale,
                          transform: fit.rotate === 90 ? 'rotate(-90deg)' : undefined,
                          transformOrigin: 'center',
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          marginLeft: (-page.width * fit.scale * cssScale) / 2,
                          marginTop: (-page.height * fit.scale * cssScale) / 2,
                        }}
                      >
                        <PageCanvas
                          record={first}
                          pageIndex={pageIndex}
                          targetWidth={Math.min(240, Math.round(fit.placedWidth * cssScale * 1.5))}
                        />
                      </div>
                      {settings.pageNumbers && (
                        <span
                          className="absolute bottom-0.5 right-1 tabular-nums text-muted-foreground"
                          style={{ fontSize: Math.max(8, Math.min(12, cell.width * 0.025 * cssScale)) }}
                        >
                          {k + 1}
                        </span>
                      )}
                    </div>
                  )}
                  {isBlank && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/60">
                      空白
                    </span>
                  )}
                </div>
              )
            })}
          {settings.mode === 'booklet' && width > 0 && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/40"
              style={{ left: `${cssScale * (sheet.width / 2)}px` }}
            >
              <span className="absolute left-1 top-1 text-[10px] text-muted-foreground/70">对折线</span>
            </div>
          )}
          {watermarkText && width > 0 && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 select-none font-bold text-muted-foreground/50"
              style={{
                fontSize: watermarkFontSize(sheet, watermarkText, cssScale),
                transform: 'translate(-50%, -50%) rotate(-45deg)',
                whiteSpace: 'nowrap',
              }}
            >
              {watermarkText}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          即时反映当前设置{first ? ' · 以第一章为例' : ' · 添加文件后显示页面'}
          {` · 纸张 ${Math.round(sheet.width)}×${Math.round(sheet.height)} pt（比例 ${(sheet.width / sheet.height).toFixed(2)}:1）`}
        </p>
      </CardContent>
    </Card>
  )
}
