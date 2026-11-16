/**
 * pdf.js 全局配置 + 文档缓存。
 * getDocument({data}) 会转移传入缓冲的所有权，因此必须传副本。
 * standard_fonts / cmaps 复制到 public/pdfjs/（离线可用），保证非嵌入字体文档渲染不缺字。
 * 注意 pdfjs-dist v6：字体/cmap 地址是 getDocument 参数（不再是 GlobalWorkerOptions），
 * 销毁须通过 loadingTask.destroy()。
 */
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const STANDARD_FONTS_URL = `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`
const CMAPS_URL = `${import.meta.env.BASE_URL}pdfjs/cmaps/`

export { pdfjsLib }
export type { PDFDocumentProxy }

const docCache = new Map<string, Promise<PDFDocumentProxy>>()
const taskMap = new Map<string, PDFDocumentLoadingTask>()

export function getPdfDoc(id: string, getData: () => Promise<Uint8Array>): Promise<PDFDocumentProxy> {
  let cached = docCache.get(id)
  if (!cached) {
    cached = (async () => {
      const data = await getData()
      const task = pdfjsLib.getDocument({
        data: new Uint8Array(data),
        standardFontDataUrl: STANDARD_FONTS_URL,
        cMapUrl: CMAPS_URL,
        cMapPacked: true,
      })
      taskMap.set(id, task)
      return task.promise
    })()
    docCache.set(id, cached)
    cached.catch(() => {
      docCache.delete(id)
      taskMap.delete(id)
    })
  }
  return cached
}

export async function destroyPdfDoc(id: string): Promise<void> {
  docCache.delete(id)
  const task = taskMap.get(id)
  taskMap.delete(id)
  try {
    await task?.destroy()
  } catch {
    // 文档已失败或销毁，忽略
  }
}

export function isRenderCancelled(err: unknown): boolean {
  return err instanceof Error && err.name === 'RenderingCancelledException'
}
