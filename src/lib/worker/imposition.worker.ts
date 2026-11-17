/**
 * 排版 Worker：pdf-lib 全内存操作放后台线程，避免阻塞 UI。
 * 输入字节经 transferable 传递（零拷贝），结果 ArrayBuffer 回传时同样转移所有权。
 * 支持两种输出：合并为一个 PDF，或各章单独输出（split = true）。
 */
import type { ChapterSpec, SheetSettings } from '../pdf/merge'
import type { CropFrac } from '../pdf/layout'
import { buildOutput } from '../pdf/merge'

export interface ProcessRequest {
  chapters: Array<{
    id: string
    name: string
    bytes: ArrayBuffer
    /** 版面序列：源页索引（-1 = 空白槽位） */
    sequence: number[]
    pageRotations?: Record<number, number>
    /** 裁白边（源页索引 -> 裁剪框比例） */
    pageCrops?: Record<number, CropFrac>
  }>
  settings: SheetSettings
  /** true = 各章单独输出；false = 合并为一个 PDF */
  split: boolean
  /** 与输出一一对应的文件名 */
  fileNames: string[]
}

export interface OutputPayload {
  fileName: string
  bytes: ArrayBuffer
  pageCount: number
  sheetCount: number
  chapterStarts: Array<{ name: string; startPage: number }>
  /** 补的空白页（1-based） */
  padPages: number[]
}

export type WorkerOutMessage =
  | { type: 'progress'; chapterIndex: number; current: number; total: number }
  | { type: 'done'; outputs: OutputPayload[] }
  | { type: 'error'; message: string }

self.addEventListener('message', async (event: MessageEvent<ProcessRequest>) => {
  const post = self.postMessage.bind(self) as (
    message: WorkerOutMessage,
    transfer?: Transferable[],
  ) => void
  try {
    const { chapters, settings, split, fileNames } = event.data
    const specs: ChapterSpec[] = chapters.map((c) => ({
      id: c.id,
      name: c.name,
      bytes: new Uint8Array(c.bytes),
      sequence: c.sequence,
      pageRotations: c.pageRotations,
      pageCrops: c.pageCrops,
    }))

    const results: Array<{
      fileName: string
      bytes: Uint8Array
      pageCount: number
      sheetCount: number
      chapterStarts: Array<{ name: string; startPage: number }>
      padPages: number[]
    }> = []
    if (split) {
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i]!
        const r = await buildOutput([spec], settings, (current, total) => {
          post({ type: 'progress', chapterIndex: i, current, total })
        })
        results.push({
          fileName: fileNames[i] ?? `${spec.name}.pdf`,
          bytes: r.bytes,
          pageCount: r.pageCount,
          sheetCount: r.sheetCount,
          chapterStarts: r.chapterStarts,
          padPages: r.padPages,
        })
      }
    } else {
      const r = await buildOutput(specs, settings, (chapterIndex, current, total) => {
        post({ type: 'progress', chapterIndex, current, total })
      })
      results.push({
        fileName: fileNames[0] ?? 'output.pdf',
        bytes: r.bytes,
        pageCount: r.pageCount,
        sheetCount: r.sheetCount,
        chapterStarts: r.chapterStarts,
        padPages: r.padPages,
      })
    }

    const outputs: OutputPayload[] = results.map((r) => {
      const b = r.bytes
      // save() 返回的 Uint8Array 可能引用更大的底层缓冲，切片后再转移
      const out = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
      return { fileName: r.fileName, bytes: out, pageCount: r.pageCount, sheetCount: r.sheetCount, chapterStarts: r.chapterStarts, padPages: r.padPages }
    })
    post({ type: 'done', outputs }, outputs.map((o) => o.bytes))
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
