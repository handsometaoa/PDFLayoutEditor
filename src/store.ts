/**
 * 全局状态（zustand）。
 * File 对象与派生字节不进持久化序列化，仅保存引用；页面删除采用可逆的标记集合，
 * 页面顺序为可变的 order 数组（undefined = 自然顺序）。
 */
import { create } from 'zustand'
import type { ChapterStart } from './lib/pdf/merge'
import type { NupMode, OrientationSetting, Size } from './lib/pdf/layout'
import { PdfLoadError, loadPdfMeta } from './lib/pdf/load'
import { destroyPdfDoc } from './lib/pdfjs'

export interface PdfFileRecord {
  id: string
  name: string
  file: File
  size: number
  status: 'loading' | 'ready' | 'error'
  errorKind?: 'encrypted' | 'invalid'
  pageCount: number
  /** 每页视觉尺寸（已应用 /Rotate），索引与源页一致 */
  pages: Size[]
  /** 已删除页（源页索引，0-based，升序） */
  deletedPages: number[]
  /** 页面展示顺序（源页索引排列）；undefined = 自然顺序 */
  pageOrder?: number[]
  expanded: boolean
}

export interface OutputSettings {
  mode: NupMode
  orientation: OrientationSetting
  /** 输出纸张：固定 A4，或跟随第一章源页面比例 */
  sheetSource: 'a4' | 'source'
  /** 打印方式：双面（补空白页只在双面下可选）/ 单面 */
  printMode: 'duplex' | 'simplex'
  /** 章节合并：合并为一个 PDF / 各章单独输出 */
  outputMode: 'merge' | 'split'
  margin: number
  gutter: number
  autoRotate: boolean
  padOdd: boolean
  /** 每格右下角页面序号 */
  pageNumbers: boolean
  /** 水印 */
  watermarkEnabled: boolean
  watermarkText: string
}

export interface OutputResult {
  fileName: string
  url: string
  pageCount: number
  sheetCount: number
  /** 输出文件大小（MB） */
  sizeMB: number
  chapterStarts: ChapterStart[]
  /** 补的空白页（输出页码，1-based） */
  padPages: number[]
}

export interface TaskState {
  status: 'idle' | 'processing' | 'done' | 'error'
  progressCurrent: number
  progressTotal: number
  progressChapter: string
  errorMessage?: string
  result?: { outputs: OutputResult[] }
}

export const DEFAULT_SETTINGS: OutputSettings = {
  mode: 4,
  orientation: 'auto',
  sheetSource: 'a4',
  printMode: 'duplex',
  outputMode: 'merge',
  margin: 14,
  gutter: 8,
  autoRotate: true,
  padOdd: true,
  pageNumbers: true,
  watermarkEnabled: false,
  watermarkText: '',
}

interface StudioState {
  files: PdfFileRecord[]
  settings: OutputSettings
  task: TaskState
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  toggleExpand: (id: string) => void
  togglePageDeleted: (fileId: string, pageIndex: number) => void
  /** 页面拖拽排序：from/to 为展示顺序中的位置 */
  reorderPages: (fileId: string, from: number, to: number) => void
  moveFile: (fromIndex: number, toIndex: number) => void
  setSettings: (patch: Partial<OutputSettings>) => void
  patchTask: (patch: Partial<TaskState>) => void
  clearResult: () => void
}

/** 当前展示顺序（含已删除页） */
export function pageOrderOf(record: PdfFileRecord): number[] {
  if (record.pageOrder) return record.pageOrder
  return Array.from({ length: record.pageCount }, (_, i) => i)
}

/** 保留页索引（源页索引，0-based，按当前排序，删除页自动剔除） */
export function keptPageIndices(record: PdfFileRecord): number[] {
  const deleted = new Set(record.deletedPages)
  return pageOrderOf(record).filter((i) => !deleted.has(i))
}

let uid = 0
function nextId(): string {
  uid += 1
  return `pdf-${Date.now().toString(36)}-${uid}`
}

/** 设置持久化：重开页面保留上次选择 */
const SETTINGS_KEY = 'pdf-print-studio:settings'

function loadSettings(): OutputSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<OutputSettings>) }
  } catch {
    // 损坏或不可用时回退默认值
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: OutputSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 存储不可用时忽略
  }
}

async function loadMetaIntoStore(id: string, file: File) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const meta = await loadPdfMeta(bytes)
    useStudio.setState((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status: 'ready', pageCount: meta.pageCount, pages: meta.pages } : f,
      ),
    }))
  } catch (err) {
    const kind = err instanceof PdfLoadError ? err.kind : 'invalid'
    useStudio.setState((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status: 'error', errorKind: kind } : f,
      ),
    }))
  }
}

export const useStudio = create<StudioState>((set) => ({
  files: [],
  settings: loadSettings(),
  task: { status: 'idle', progressCurrent: 0, progressTotal: 0, progressChapter: '' },

  addFiles: (incoming) => {
    const records: PdfFileRecord[] = incoming.map((file) => ({
      id: nextId(),
      name: file.name,
      file,
      size: file.size,
      status: 'loading',
      pageCount: 0,
      pages: [],
      deletedPages: [],
      expanded: false,
    }))
    set((state) => ({ files: [...state.files, ...records] }))
    for (const record of records) {
      void loadMetaIntoStore(record.id, record.file)
    }
  },

  removeFile: (id) => {
    void destroyPdfDoc(id)
    set((state) => ({ files: state.files.filter((f) => f.id !== id) }))
  },

  toggleExpand: (id) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, expanded: !f.expanded } : f)),
    })),

  togglePageDeleted: (fileId, pageIndex) =>
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== fileId) return f
        const has = f.deletedPages.includes(pageIndex)
        return {
          ...f,
          deletedPages: has
            ? f.deletedPages.filter((i) => i !== pageIndex)
            : [...f.deletedPages, pageIndex].sort((a, b) => a - b),
        }
      }),
    })),

  reorderPages: (fileId, from, to) =>
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== fileId) return f
        const order = [...pageOrderOf(f)]
        const [moved] = order.splice(from, 1)
        if (moved !== undefined) order.splice(to, 0, moved)
        return { ...f, pageOrder: order }
      }),
    })),

  moveFile: (fromIndex, toIndex) =>
    set((state) => {
      const files = [...state.files]
      const [moved] = files.splice(fromIndex, 1)
      if (moved) files.splice(toIndex, 0, moved)
      return { files }
    }),

  setSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch }
      saveSettings(settings)
      return { settings }
    }),

  patchTask: (patch) => set((state) => ({ task: { ...state.task, ...patch } })),

  clearResult: () =>
    set((state) => {
      if (state.task.result) {
        for (const output of state.task.result.outputs) URL.revokeObjectURL(output.url)
      }
      return { task: { status: 'idle', progressCurrent: 0, progressTotal: 0, progressChapter: '' } }
    }),
}))

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}
