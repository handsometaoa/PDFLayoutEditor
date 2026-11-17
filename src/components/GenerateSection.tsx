/**
 * 生成区：调用 Worker 完成排版（合并或各章单独），展示进度与结果（预览/下载）。
 */
import { Download, Eye, FileOutput, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { bookletPageOrder, computeSheet } from '@/lib/pdf/layout'
import { runImposition } from '@/lib/workerClient'
import type { ImpositionOutput } from '@/lib/workerClient'
import type { ProcessRequest } from '@/lib/worker/imposition.worker'
import { keptPageIndices, keptVisualSizes, useStudio } from '@/store'
import type { OutputResult, PdfFileRecord } from '@/store'

function chapterLabel(record: PdfFileRecord): string {
  return record.name.replace(/\.pdf$/i, '')
}

interface GenerateSectionProps {
  onPreview: (outputs: OutputResult[], index: number) => void
}

export function GenerateSection({ onPreview }: GenerateSectionProps) {
  const files = useStudio((s) => s.files)
  const settings = useStudio((s) => s.settings)
  const task = useStudio((s) => s.task)
  const patchTask = useStudio((s) => s.patchTask)
  const clearResult = useStudio((s) => s.clearResult)

  const readyFiles = files.filter((f) => f.status === 'ready' && f.pageCount - f.deletedPages.length > 0)
  const estimateFor = (kept: number) =>
    settings.mode === 'booklet'
      ? { pages: Math.ceil(kept / 4) * 2, paper: Math.ceil(kept / 4) }
      : { pages: Math.ceil(kept / settings.mode), paper: Math.ceil(kept / settings.mode) }
  const totalPages = readyFiles.reduce((sum, f) => sum + estimateFor(f.pageCount - f.deletedPages.length).pages, 0)
  const totalPaper = readyFiles.reduce((sum, f) => sum + estimateFor(f.pageCount - f.deletedPages.length).paper, 0)
  const effectivePadOdd = settings.padOdd && settings.printMode === 'duplex' && settings.mode !== 'booklet'
  const processing = task.status === 'processing'
  const pct = task.progressTotal > 0 ? Math.round((task.progressCurrent / task.progressTotal) * 100) : 0

  async function generate() {
    if (readyFiles.length === 0) {
      toast.error('请先添加 PDF 文件')
      return
    }
    clearResult()
    try {
      const split = settings.outputMode === 'split'
      const effectiveSizes = readyFiles.flatMap((f) => keptVisualSizes(f))
      const firstKept = keptPageIndices(readyFiles[0]!)[0]
      const sourceFirst =
        firstKept !== undefined ? readyFiles[0]!.pages[firstKept] : undefined
      const sheet = computeSheet(effectiveSizes, settings, sourceFirst)

      patchTask({ status: 'processing', progressCurrent: 0, progressTotal: 0, progressChapter: '' })
      const sequenceFor = (f: PdfFileRecord): number[] => {
        const kept = keptPageIndices(f)
        if (settings.mode === 'booklet') {
          return bookletPageOrder(kept.length).map((p) =>
            p >= 1 && p <= kept.length ? kept[p - 1]! : -1,
          )
        }
        return kept
      }
      const chapters: ProcessRequest['chapters'] = []
      for (const f of readyFiles) {
        chapters.push({
          id: f.id,
          name: chapterLabel(f),
          bytes: await f.file.arrayBuffer(),
          sequence: sequenceFor(f),
          pageRotations: f.pageRotations,
        })
      }
      const suffix = settings.mode === 1 ? '单页' : settings.mode === 'booklet' ? '小册子' : `${settings.mode}合1`
      const fileNames = split
        ? chapters.map((c) => `${c.name}_${suffix}.pdf`)
        : [
            chapters.length === 1
              ? `${chapters[0]!.name}_${suffix}.pdf`
              : `合并_${chapters.length}章_${suffix}.pdf`,
          ]

      const result = await runImposition(
        {
          chapters,
          settings: {
            mode: settings.mode,
            sheetWidth: sheet.width,
            sheetHeight: sheet.height,
            margin: settings.margin,
            gutter: settings.gutter,
            autoRotate: settings.autoRotate,
            padOdd: effectivePadOdd,
            pageNumbers: settings.pageNumbers,
            watermarkText: settings.watermarkEnabled ? settings.watermarkText : '',
          },
          split,
          fileNames,
        },
        (chapterIndex, current, total) => {
          patchTask({
            progressCurrent: current,
            progressTotal: total,
            progressChapter: chapters[chapterIndex]?.name ?? '',
          })
        },
      )

      const outputs: OutputResult[] = result.outputs.map((o: ImpositionOutput) => ({
        fileName: o.fileName,
        url: URL.createObjectURL(new Blob([o.bytes], { type: 'application/pdf' })),
        pageCount: o.pageCount,
        sheetCount: o.sheetCount,
        sizeMB: Math.round((o.bytes.length / 1e6) * 10) / 10,
        chapterStarts: o.chapterStarts,
        padPages: o.padPages,
      }))
      patchTask({ status: 'done', result: { outputs } })
      const totalOut = outputs.reduce((s, o) => s + o.pageCount, 0)
      toast.success(
        split
          ? `已生成 ${outputs.length} 个文件（共 ${totalOut} 页）`
          : `已生成 ${totalOut} 页（双面 ${outputs[0]!.sheetCount} 张纸）`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      patchTask({ status: 'error', errorMessage: message })
      toast.error(message)
    }
  }

  const outputs = task.result?.outputs

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileOutput className="h-4 w-4" />生成
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {readyFiles.length > 0
            ? `${readyFiles.length} 个章节 · 约 ${totalPages} 页成品 · 双面约 ${totalPaper} 张纸${settings.outputMode === 'split' ? ' · 各章单独输出' : ''}`
            : '添加文件后即可生成'}
        </p>
        {processing && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {task.progressChapter} {task.progressCurrent}/{task.progressTotal}
            </p>
          </div>
        )}
        <Button
          className="w-full"
          disabled={readyFiles.length === 0 || processing}
          onClick={() => void generate()}
        >
          {processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {processing ? '生成中…' : '生成 PDF'}
        </Button>
        {task.status === 'done' && outputs && outputs.length > 0 && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            {outputs.map((o, i) => (
              <div key={o.url} className={outputs.length > 1 ? 'space-y-1.5 border-b pb-2 last:border-b-0 last:pb-0' : 'space-y-1.5'}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium" title={o.fileName}>{o.fileName}</span>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {o.pageCount} 页 / {o.sheetCount} 张纸 · {o.sizeMB} MB
                  </Badge>
                </div>
                {outputs.length === 1 && o.chapterStarts.length > 1 && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    章节起始：
                    {o.chapterStarts.map((c) => `${c.name}→P${c.startPage}`).join('；')}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onPreview(outputs, i)}
                  >
                    <Eye className="mr-1 h-4 w-4" />预览
                  </Button>
                  <a href={o.url} download={o.fileName} className="flex-1">
                    <Button size="sm" className="w-full">
                      <Download className="mr-1 h-4 w-4" />下载
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
