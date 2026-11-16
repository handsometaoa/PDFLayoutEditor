/**
 * 拖拽/选择上传区。
 */
import { useRef, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store'

export function UploadZone() {
  const addFiles = useStudio((s) => s.addFiles)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const pick = (list: FileList | null) => {
    if (!list) return
    const pdfs = Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return
    addFiles(pdfs)
  }

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
        dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        pick(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
      <FilePlus2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="mb-2 text-sm font-medium">拖拽 PDF 文件到这里，或</p>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        选择文件
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        支持多选 · 文件顺序即章节顺序 · 全程本地处理，文件不会上传
      </p>
    </div>
  )
}
