/**
 * 合并输出构建（在 Web Worker 中执行）。
 * 规则：每章按序排入输出；padOdd 开启时奇数章末尾补 1 页空白，
 * 保证每章从纸张正面（奇数页）开始 —— 一张纸不出现两章内容。
 * 装饰：页面序号（每格右下角，章节内序号）、文字水印（OffscreenCanvas
 * 渲染成 PNG 后整页铺放，避免在 PDF 里嵌入中文字体）。
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFImage } from 'pdf-lib'
import type { NupMode, Rect, Size } from './layout'
import { gridCells } from './layout'
import { placePage } from './imposition'

export interface ChapterSpec {
  id: string
  name: string
  bytes: Uint8Array
  /** 保留的源页索引（0-based，按当前排序） */
  keptPages: number[]
}

export interface SheetSettings {
  mode: NupMode
  sheetWidth: number
  sheetHeight: number
  margin: number
  gutter: number
  autoRotate: boolean
  padOdd: boolean
  /** 每格右下角标注章节内页序号 */
  pageNumbers: boolean
  /** 水印文字（空串 = 无水印） */
  watermarkText: string
}

export interface ChapterStart {
  name: string
  /** 输出 PDF 中的起始页（1-based） */
  startPage: number
}

export interface BuildResult {
  bytes: Uint8Array
  pageCount: number
  /** 双面打印所需纸张数 */
  sheetCount: number
  chapterStarts: ChapterStart[]
}

export type ProgressFn = (chapterIndex: number, current: number, total: number) => void

interface Decorations {
  font?: PDFFont
  watermark?: PDFImage
}

/** 用 OffscreenCanvas 把水印文字渲染成带透明的 PNG（支持中文，走系统字体） */
async function renderWatermarkPng(text: string, sheetW: number, sheetH: number): Promise<Uint8Array | null> {
  try {
    const w = Math.max(600, Math.round(sheetW * 2))
    const h = Math.max(400, Math.round(sheetH * 2))
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const diag = Math.hypot(w, h)
    const fontSize = Math.min(
      Math.max(24, Math.round((diag * 0.42) / Math.max(1, text.length))),
      Math.round(Math.min(w, h) * 0.6),
    )
    ctx.translate(w / 2, h / 2)
    ctx.rotate(-Math.PI / 4)
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.fillStyle = 'rgba(130, 130, 130, 0.35)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null // 环境不支持 OffscreenCanvas 时静默跳过水印
  }
}

async function imposeChapter(
  out: PDFDocument,
  /** 已通过单次 copyPages 复制进输出文档的源页（资源只拷一份，见 buildOutput） */
  copiedPages: Array<import('pdf-lib').PDFPage>,
  cells: Rect[],
  sheet: Size,
  autoRotate: boolean,
  deco: Decorations,
  onProgress: ProgressFn,
  chapterIndex: number,
): Promise<void> {
  for (let start = 0; start < copiedPages.length; start += cells.length) {
    const sheetPage = out.addPage([sheet.width, sheet.height])
    for (let k = 0; k < cells.length && start + k < copiedPages.length; k++) {
      const srcPage = copiedPages[start + k]!
      const crop = srcPage.getCropBox() // { x, y, width, height }（未旋转原始空间）
      const rawWidth = crop.width
      const rawHeight = crop.height
      const boundingBox = {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height,
      }
      const embedded = await out.embedPage(srcPage, boundingBox)
      const { options, box } = placePage(rawWidth, rawHeight, srcPage.getRotation().angle, cells[k]!, autoRotate)
      sheetPage.drawPage(embedded, { ...options, rotate: degrees(options.rotate) })

      // 页面序号：内容盒右下角内侧，章节内序号（与缩略图徽标一致）
      if (deco.font) {
        const label = String(start + k + 1)
        const size = Math.min(Math.max(6, box.width * 0.025), 12)
        const textWidth = deco.font.widthOfTextAtSize(label, size)
        sheetPage.drawText(label, {
          x: box.left + box.width - textWidth - 4,
          y: box.bottom + 4,
          size,
          font: deco.font,
          color: rgb(0.45, 0.45, 0.45),
        })
      }
      onProgress(chapterIndex, start + k + 1, copiedPages.length)
    }
    // 水印整页铺放（透明度已烘焙进 PNG）
    if (deco.watermark) {
      sheetPage.drawImage(deco.watermark, {
        x: 0,
        y: 0,
        width: sheet.width,
        height: sheet.height,
      })
    }
  }
}

export async function buildOutput(
  chapters: ChapterSpec[],
  settings: SheetSettings,
  onProgress: ProgressFn,
): Promise<BuildResult> {
  const effective = chapters.filter((c) => c.keptPages.length > 0)
  if (effective.length === 0) {
    throw new Error('没有可打印的页面：所有页面均被删除')
  }
  const sheet: Size = { width: settings.sheetWidth, height: settings.sheetHeight }
  const cells = gridCells(sheet.width, sheet.height, settings.mode, settings.margin, settings.gutter)

  const out = await PDFDocument.create()
  const deco: Decorations = {}
  if (settings.pageNumbers) {
    deco.font = await out.embedFont(StandardFonts.Helvetica)
  }
  if (settings.watermarkText.trim()) {
    const png = await renderWatermarkPng(settings.watermarkText.trim(), sheet.width, sheet.height)
    if (png) deco.watermark = await out.embedPng(png)
  }

  const chapterStarts: ChapterStart[] = []

  for (let i = 0; i < effective.length; i++) {
    const chapter = effective[i]!
    const start0 = out.getPageCount()
    if (settings.padOdd && start0 % 2 !== 0) {
      // 编程错误防线：补页逻辑失效时应立即暴露
      throw new Error(`章节「${chapter.name}」未从奇数页开始（内部错误）`)
    }
    chapterStarts.push({ name: chapter.name, startPage: start0 + 1 })

    let src: PDFDocument
    try {
      src = await PDFDocument.load(chapter.bytes)
    } catch {
      throw new Error(`章节「${chapter.name}」无法解析（可能已加密）`)
    }
    // 关键优化：单次 copyPages 让 PDFObjectCopier 的缓存跨页共享字体/图片等资源，
    // 随后嵌入输出文档内的副本页 —— 否则每页 embedPage 都会深拷贝一份资源，
    // 输出体积会膨胀数倍（实测 82MB -> 预期 ~15MB）。
    const copiedPages = await out.copyPages(src, chapter.keptPages)
    await imposeChapter(
      out,
      copiedPages,
      cells,
      sheet,
      settings.autoRotate,
      deco,
      onProgress,
      i,
    )

    // 奇数章补空白页（含最后一章，使总页数为偶数）
    if (settings.padOdd && out.getPageCount() % 2 !== 0) {
      out.addPage([sheet.width, sheet.height])
    }
  }

  const bytes = await out.save({ useObjectStreams: false })
  const pageCount = out.getPageCount()
  return {
    bytes,
    pageCount,
    sheetCount: Math.ceil(pageCount / 2),
    chapterStarts,
  }
}
