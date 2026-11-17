/**
 * 拖拽/选择上传区。
 */
import { useRef } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStudio } from '@/store'

/**
 * 上传入口：拖放由 App 的窗口级监听统一处理（避免双处理器重复添加），
 * 这里只提供点击选择与视觉提示。
 */
export function UploadZone() {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = e.target.files
          if (list && list.length > 0) {
            useStudio.getState().addFiles(Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.pdf')))
          }
          e.target.value = ''
        }}
      />
      <FilePlus2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="mb-2 text-sm font-medium">拖拽 PDF 文件到页面任意位置，或</p>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        选择文件
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        支持多选 · 文件顺序即章节顺序 · 全程本地处理，文件不会上传
      </p>
    </div>
  )
}
