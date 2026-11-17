/**
 * pdf.js 全局配置 + 文档缓存。
 * getDocument({data}) 会转移传入缓冲的所有权，因此必须传副本。
 * standard_fonts / cmaps 复制到 public/pdfjs/（离线可用），保证非嵌入字体文档渲染不缺字。
 * 注意 pdfjs-dist v6：字体/cmap 地址是 getDocument 参数（不再是 GlobalWorkerOptions），
 * 销毁须通过 loadingTask.destroy()。
 */
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import type { CropFrac } from './pdf/layout'
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

/**
 * 裁白边检测：以 rotation=0 渲染（像素直接映射原始用户空间，无需旋转逆映射），
 * 逐页计算非白内容包围盒，返回裁剪框比例。空白页与几乎无需裁剪的页跳过。
 */
export async function detectContentCrops(
  bytes: Uint8Array,
  pageCount: number,
  onProgress?: (current: number, total: number) => void,
): Promise<Record<number, CropFrac>> {
  const crops: Record<number, CropFrac> = {}
  const task = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONTS_URL,
    cMapUrl: CMAPS_URL,
    cMapPacked: true,
  })
  try {
    const doc = await task.promise
    for (let i = 0; i < pageCount; i++) {
      const page = await doc.getPage(i + 1)
      const base = page.getViewport({ scale: 1, rotation: 0 })
      const viewport = page.getViewport({ scale: 64 / base.width, rotation: 0 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      document.body.appendChild(canvas)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) continue
      await page.render({ canvas, viewport }).promise
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const W = canvas.width
      const H = canvas.height
      let minX = W
      let minY = H
      let maxX = -1
      let maxY = -1
      let nonWhite = 0
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = (y * W + x) * 4
          if (data[p]! < 245 || data[p + 1]! < 245 || data[p + 2]! < 245) {
            nonWhite++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      canvas.remove()
      onProgress?.(i + 1, pageCount)
      if (nonWhite / (W * H) < 0.005) continue // 空白页：不裁
      // 内容四周留少量余量，避免贴边裁切
      const padX = Math.max(3, Math.round(W * 0.015))
      const padY = Math.max(3, Math.round(H * 0.015))
      minX = Math.max(0, minX - padX)
      minY = Math.max(0, minY - padY)
      maxX = Math.min(W - 1, maxX + padX)
      maxY = Math.min(H - 1, maxY + padY)
      // 剩余面积仍接近整页（边距本来就紧）则跳过
      if (((maxX - minX + 1) * (maxY - minY + 1)) / (W * H) > 0.985) continue
      // 像素坐标(y 向下) -> PDF 坐标(y 向上)比例
      crops[i] = {
        x0: minX / W,
        x1: (maxX + 1) / W,
        y0: (H - 1 - maxY) / H,
        y1: (H - minY) / H,
      }
    }
  } finally {
    task.destroy()
  }
  return crops
}
