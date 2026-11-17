/**
 * 主线程 Worker 客户端：封装请求/进度/结果的生命周期。
 */
import ImpositionWorker from './worker/imposition.worker?worker'
import type { ProcessRequest, WorkerOutMessage } from './worker/imposition.worker'

export interface ImpositionOutput {
  fileName: string
  bytes: Uint8Array<ArrayBuffer>
  pageCount: number
  sheetCount: number
  chapterStarts: Array<{ name: string; startPage: number }>
  /** 补的空白页（1-based） */
  padPages: number[]
}

export type ProgressCallback = (chapterIndex: number, current: number, total: number) => void

export function runImposition(
  request: ProcessRequest,
  onProgress: ProgressCallback,
): Promise<{ outputs: ImpositionOutput[] }> {
  return new Promise((resolve, reject) => {
    const worker = new ImpositionWorker()
    const cleanup = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        onProgress(msg.chapterIndex, msg.current, msg.total)
      } else if (msg.type === 'done') {
        cleanup()
        resolve({
          outputs: msg.outputs.map((o) => ({
            fileName: o.fileName,
            bytes: new Uint8Array(o.bytes),
            pageCount: o.pageCount,
            sheetCount: o.sheetCount,
            chapterStarts: o.chapterStarts,
            padPages: o.padPages,
          })),
        })
      } else {
        cleanup()
        reject(new Error(msg.message))
      }
    }
    worker.onerror = (event) => {
      cleanup()
      reject(new Error(event.message || '排版处理失败'))
    }
    worker.postMessage(request, request.chapters.map((c) => c.bytes))
  })
}
