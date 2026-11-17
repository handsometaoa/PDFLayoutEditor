import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { FileList } from '@/components/FileList'
import { GenerateSection } from '@/components/GenerateSection'
import { LivePreview } from '@/components/LivePreview'
import { PreviewDialog } from '@/components/PreviewDialog'
import { SettingsPanel } from '@/components/SettingsPanel'
import { UploadZone } from '@/components/UploadZone'
import type { OutputResult } from '@/store'
import { useStudio } from '@/store'

export default function App() {
  const files = useStudio((s) => s.files)
  const addFiles = useStudio((s) => s.addFiles)
  const [preview, setPreview] = useState<{ outputs: OutputResult[]; index: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // 全窗口拖拽：把 PDF 拖到页面任意位置即可添加
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth += 1
      setDragging(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const pdfs = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.name.toLowerCase().endsWith('.pdf'),
      )
      if (pdfs.length > 0) addFiles(pdfs)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Printer className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold leading-tight">PDF 打印排版工作台</h1>
            <p className="text-xs text-muted-foreground">
              单页 / 2合1 / 4合1 · 页面排序与删除 · 合并 / 分章输出 · 页码水印
            </p>
          </div>
          <Badge variant="secondary">本地处理 · 文件不出浏览器</Badge>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl items-start gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <UploadZone />
          {files.length > 0 ? (
            <FileList />
          ) : (
            <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              尚未添加文件。添加后可拖拽排序章节、点开文件拖动/删除页面。
            </div>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-4">
          <LivePreview />
          <SettingsPanel />
          <GenerateSection
            onPreview={(outputs, index) => setPreview({ outputs, index })}
          />
        </aside>
      </main>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10">
          <div className="rounded-xl border-2 border-dashed border-primary bg-background/95 px-8 py-6 text-sm font-medium shadow-lg">
            松开鼠标即可添加 PDF 文件
          </div>
        </div>
      )}
      <PreviewDialog
        open={preview !== null}
        onOpenChange={(v) => {
          if (!v) setPreview(null)
        }}
        outputs={preview?.outputs ?? []}
        index={preview?.index ?? 0}
        onIndexChange={(i) => setPreview((p) => (p ? { ...p, index: i } : p))}
      />
    </div>
  )
}
