/**
 * PDF 加载与元信息提取（主线程上传时用）。
 * 加密 PDF：pdf-lib 无解密能力（ignoreEncryption 只会产出乱码），
 * 必须捕获 EncryptedPDFError 并明确报错。
 */
import { EncryptedPDFError, PDFDocument } from 'pdf-lib'
import type { Size } from './layout'
import { visualSize } from './layout'

export type LoadFailureKind = 'encrypted' | 'invalid'

export class PdfLoadError extends Error {
  kind: LoadFailureKind
  constructor(kind: LoadFailureKind, message: string) {
    super(message)
    this.name = 'PdfLoadError'
    this.kind = kind
  }
}

export interface PdfMeta {
  pageCount: number
  /** 每页视觉尺寸（已应用 /Rotate） */
  pages: Size[]
}

export async function loadPdfMeta(bytes: Uint8Array): Promise<PdfMeta> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes)
  } catch (err) {
    if (err instanceof EncryptedPDFError) {
      throw new PdfLoadError('encrypted', 'PDF 已加密（含密码或权限保护），无法处理')
    }
    throw new PdfLoadError('invalid', '无法解析该 PDF 文件')
  }
  const pages = doc.getPages().map((p) => {
    const box = p.getCropBox() // { x, y, width, height }（未旋转原始空间）
    return visualSize(box.width, box.height, p.getRotation().angle)
  })
  return { pageCount: doc.getPageCount(), pages }
}
