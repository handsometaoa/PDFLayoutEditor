/**
 * 纯几何计算：网格切分、页面适配、纸张方向选择。
 * 不依赖 pdf-lib，便于单元测试。
 *
 * 坐标系：PDF 用户空间，原点左下、Y 向上。
 * 「视觉尺寸」指应用了查看器 /Rotate 之后用户看到的页面尺寸。
 */

export type NupMode = 1 | 2 | 4
/** 版式：普通网格排版或小册子拼版（对折装订） */
export type LayoutMode = NupMode | 'booklet'
export type OrientationSetting = 'auto' | 'landscape' | 'portrait'
export type Orientation = 'landscape' | 'portrait'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export const A4_LANDSCAPE: Size = { width: 841.89, height: 595.28 }

/** 把任意角度规整为 0/90/180/270（就近取整，容忍非整数 /Rotate） */
export function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const r = (((Math.round(angle / 90) * 90) % 360) + 360) % 360
  return r as 0 | 90 | 180 | 270
}

/** 查看器显示的页面尺寸（/Rotate 90/270 时宽高互换） */
export function visualSize(rawWidth: number, rawHeight: number, rotation: number): Size {
  const r = normalizeRotation(rotation)
  return r % 180 === 0 ? { width: rawWidth, height: rawHeight } : { width: rawHeight, height: rawWidth }
}

/**
 * 按行优先 Z 序切分网格；小册子为 2 格横排、折线处零间距。
 * mode=4 恒为 2×2；mode=2 横向纸为左右 1×2、纵向纸为上下 2×1；
 * mode=1（单页）为 1×1 整页可用区域。
 */
export function gridCells(
  sheetWidth: number,
  sheetHeight: number,
  mode: LayoutMode,
  margin: number,
  gutter: number,
): Rect[] {
  const landscape = sheetWidth >= sheetHeight
  const cols = mode === 'booklet' ? 2 : mode === 4 ? 2 : mode === 2 ? (landscape ? 2 : 1) : 1
  const rows = mode === 'booklet' ? 1 : mode === 4 ? 2 : mode === 2 ? (landscape ? 1 : 2) : 1
  const g = mode === 'booklet' ? 0 : gutter // 小册子折线处不留缝
  const cellWidth = Math.max(1, (sheetWidth - 2 * margin - (cols - 1) * g) / cols)
  const cellHeight = Math.max(1, (sheetHeight - 2 * margin - (rows - 1) * g) / rows)
  const cells: Rect[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // row 0 是视觉顶部：PDF 坐标原点在左下，Y 向上，故从纸张顶部起算
      cells.push({
        x: margin + col * (cellWidth + g),
        y: sheetHeight - margin - cellHeight - row * (cellHeight + g),
        width: cellWidth,
        height: cellHeight,
      })
    }
  }
  return cells
}

export interface PageFit {
  scale: number
  /** 版面旋转：把页面旋转 90° 后放进格子（整体旋转排版） */
  rotate: 0 | 90
  placedWidth: number
  placedHeight: number
}

/** 把视觉尺寸 vw×vh 的页面等比适配进格子；autoRotate 时在 0°/90° 中取缩放更大者 */
export function fitPage(vw: number, vh: number, cell: Rect, autoRotate: boolean): PageFit {
  const s0 = Math.min(cell.width / vw, cell.height / vh)
  let fit: PageFit = { scale: s0, rotate: 0, placedWidth: vw * s0, placedHeight: vh * s0 }
  if (autoRotate) {
    const s90 = Math.min(cell.width / vh, cell.height / vw)
    if (s90 > s0 * 1.0001) {
      fit = { scale: s90, rotate: 90, placedWidth: vh * s90, placedHeight: vw * s90 }
    }
  }
  return fit
}

/** 一组页面在给定纸张方向下的最小缩放（worst-case，用于方向自动选择） */
export function minScaleFor(
  pageSizes: Size[],
  sheet: Size,
  mode: NupMode,
  margin: number,
  gutter: number,
  autoRotate: boolean,
): number {
  const cells = gridCells(sheet.width, sheet.height, mode, margin, gutter)
  let min = Infinity
  for (const p of pageSizes) {
    for (const cell of cells) {
      min = Math.min(min, fitPage(p.width, p.height, cell, autoRotate).scale)
    }
  }
  return min
}

/** 纸张方向选择：显式指定则直接用；auto 时取最小缩放更大的方向；
 * 缩放持平（4合1+自动旋转下两方向常等价）时按文档纵横比决胜 */
export function chooseOrientation(
  pageSizes: Size[],
  setting: OrientationSetting,
  landscapeSheet: Size,
  mode: NupMode,
  margin: number,
  gutter: number,
  autoRotate: boolean,
): Orientation {
  if (setting !== 'auto') return setting
  const landscape = minScaleFor(pageSizes, landscapeSheet, mode, margin, gutter, autoRotate)
  const portraitSheet: Size = { width: landscapeSheet.height, height: landscapeSheet.width }
  const portrait = minScaleFor(pageSizes, portraitSheet, mode, margin, gutter, autoRotate)
  if (portrait > landscape * 1.01) return 'portrait'
  if (landscape > portrait * 1.01) return 'landscape'
  // 持平：以页面平均纵横比决定（纵向文档 → 纵向纸，保持阅读方向）
  const meanAspect = pageSizes.reduce((s, p) => s + p.width / p.height, 0) / pageSizes.length
  return meanAspect < 1 ? 'portrait' : 'landscape'
}

/** 「跟随源页面比例」时按第一章首页视觉尺寸推导纸张（以宽者为横向边） */
export function sheetFromSourceSize(source: Size, orientation: Orientation): Size {
  const w = Math.max(source.width, source.height)
  const h = Math.min(source.width, source.height)
  return orientation === 'landscape' ? { width: w, height: h } : { width: h, height: w }
}

export interface SheetOptions {
  mode: LayoutMode
  orientation: OrientationSetting
  sheetSource: 'a4' | 'source'
  margin: number
  gutter: number
  autoRotate: boolean
}

/** 按设置推算输出纸张尺寸（方向自动时对全部有效页面取最优）——生成与即时预览共用 */
export function computeSheet(pageSizes: Size[], opts: SheetOptions, sourceFirstPage?: Size): Size {
  // 小册子的纸张形状与 2 格横排一致（对折后每半张为一页），
  // 且必须横向纸张（两页左右并排、竖向折线）——忽略方向设置
  const sheetMode: NupMode = opts.mode === 'booklet' ? 2 : opts.mode
  if (opts.mode === 'booklet') {
    let landscapeSheet = A4_LANDSCAPE
    if (opts.sheetSource === 'source' && sourceFirstPage) {
      landscapeSheet = sheetFromSourceSize(sourceFirstPage, 'landscape')
    }
    return landscapeSheet
  }
  let landscapeSheet = A4_LANDSCAPE
  if (opts.sheetSource === 'source' && sourceFirstPage) {
    landscapeSheet = sheetFromSourceSize(sourceFirstPage, 'landscape')
  }
  const orientation = chooseOrientation(
    pageSizes,
    opts.orientation,
    landscapeSheet,
    sheetMode,
    opts.margin,
    opts.gutter,
    opts.autoRotate,
  )
  return orientation === 'landscape'
    ? landscapeSheet
    : { width: landscapeSheet.height, height: landscapeSheet.width }
}

export interface CropFrac {
  /** 裁剪框比例位置（相对原始页宽高，0-1，PDF 坐标 y 向上） */
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 裁剪后的视觉尺寸（原始尺寸 × 裁剪比例，再按总旋转角交换宽高） */
export function croppedVisualSize(
  raw: Size,
  baseRotation: number,
  frac: CropFrac | undefined,
  extraRotation: number,
): Size {
  const x0 = frac?.x0 ?? 0
  const y0 = frac?.y0 ?? 0
  const x1 = frac?.x1 ?? 1
  const y1 = frac?.y1 ?? 1
  return visualSize(raw.width * (x1 - x0), raw.height * (y1 - y0), baseRotation + extraRotation)
}

/**
 * 小册子页序：返回逻辑页号（1-based）数组，按「正面左、正面右、背面左、背面右」
 * 的物理槽位排列；页数补足至 4 的倍数，超出实际页数的槽位为 -1（空白）。
 * 折叠后即为 1,2,3… 的阅读顺序。
 */
export function bookletPageOrder(count: number): number[] {
  const padded = Math.ceil(count / 4) * 4
  const slots: number[] = []
  for (let s = 0; s < padded / 4; s++) {
    slots.push(padded - 2 * s) // 正面左
    slots.push(2 * s + 1) // 正面右
    slots.push(2 * s + 2) // 背面左
    slots.push(padded - 2 * s - 1) // 背面右
  }
  return slots.map((p) => (p >= 1 && p <= count ? p : -1))
}
