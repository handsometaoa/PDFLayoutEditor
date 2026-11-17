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
  /** 用户附加旋转（源页索引 -> 额外顺时针角度，90 的倍数） */
  pageRotations?: Record<number, number>
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
  /** 单页旋转：每次顺时针 +90°（0 → 90 → 180 → 270 → 0） */
  rotatePage: (fileId: string, pageIndex: number) => void
  /** 应用页码范围：重设保留页（清空原删除标记）；返回是否成功 */
  applyPageRange: (fileId: string, text: string) => boolean
  /** 批量标记删除（空白页检测结果），返回合并后的删除总数 */
  markPagesDeleted: (fileId: string, pageIndices: number[]) => number
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

/** 某页的视觉尺寸（含用户附加旋转） */
export function pageVisualSize(record: PdfFileRecord, pageIndex: number): Size {
  const base = record.pages[pageIndex] ?? { width: 595.28, height: 841.89 }
  const extra = record.pageRotations?.[pageIndex] ?? 0
  if (extra % 180 === 90) return { width: base.height, height: base.width }
  return base
}

/** 保留页的视觉尺寸序列（供纸张方向计算与即时预览） */
export function keptVisualSizes(record: PdfFileRecord): Size[] {
  return keptPageIndices(record).map((i) => pageVisualSize(record, i))
}

/** 解析页码范围文本（如 "1-20, 25"）为保留页索引；格式非法返回 null */
export function parsePageRange(text: string, pageCount: number): number[] | null {
  const kept = new Set<number>()
  for (const part of text.trim().split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) return null
    let a = Number(m[1])
    let b = m[2] ? Number(m[2]) : a
    if (a > b) [a, b] = [b, a]
    if (a < 1 || b > pageCount) return null
    for (let i = a; i <= b; i++) kept.add(i - 1)
  }
  return kept.size === 0 ? null : [...kept].sort((x, y) => x - y)
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

export const useStudio = create<StudioState>()((set, get) => ({
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

  rotatePage: (fileId, pageIndex) =>
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== fileId) return f
        const rot = { ...(f.pageRotations ?? {}) }
        rot[pageIndex] = ((rot[pageIndex] ?? 0) + 90) % 360
        return { ...f, pageRotations: rot }
      }),
    })),

  applyPageRange: (fileId, text) => {
    const record = get().files.find((f) => f.id === fileId)
    if (!record) return false
    const kept = parsePageRange(text, record.pageCount)
    if (!kept) return false
    const keptSet = new Set(kept)
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId
          ? {
              ...f,
              deletedPages: Array.from({ length: f.pageCount }, (_, i) => i).filter(
                (i) => !keptSet.has(i),
              ),
            }
          : f,
      ),
    }))
    return true
  },

  markPagesDeleted: (fileId, pageIndices) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId
          ? { ...f, deletedPages: [...new Set([...f.deletedPages, ...pageIndices])].sort((a, b) => a - b) }
          : f,
      ),
    }))
    return get().files.find((f) => f.id === fileId)?.deletedPages.length ?? 0
  },

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

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}
