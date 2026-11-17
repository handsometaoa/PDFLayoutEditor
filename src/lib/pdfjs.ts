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

/**
 * 检测疑似空白页：低分辨率渲染后统计非白像素占比。
 * 阈值保守（< 0.5%），宁可漏检也不误删——被标记的页随时可恢复。
 */
/**
 * 检测疑似空白页：低分辨率渲染后统计非白像素占比。
 * 使用独立文档实例（不与缩略图共享），避免同页并发渲染冲突。
 * 阈值保守（< 0.5%），宁可漏检也不误删——被标记的页随时可恢复。
 */
export async function detectBlankPages(
  bytes: Uint8Array,
  pageCount: number,
  onProgress?: (current: number, total: number) => void,
): Promise<number[]> {
  const blank: number[] = [];
  const task = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONTS_URL,
    cMapUrl: CMAPS_URL,
    cMapPacked: true,
  });
  try {
    const doc = await task.promise;
    for (let i = 0; i < pageCount; i++) {
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 64 / base.width });
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      canvas.style.position = 'fixed'
      canvas.style.opacity = '0'
      document.body.appendChild(canvas) // v6 渲染需要已挂载的 canvas
      await page.render({ canvas, viewport }).promise
      const ctx = canvas.getContext('2d')!
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let nonWhite = 0
      for (let p = 0; p < data.length; p += 4) {
        if (data[p]! < 245 || data[p + 1]! < 245 || data[p + 2]! < 245) nonWhite++
      }
      canvas.remove()
      if (nonWhite / (canvas.width * canvas.height) < 0.005) blank.push(i)
      onProgress?.(i + 1, pageCount)
    }
  } finally {
    task.destroy();
  }
  return blank
}
