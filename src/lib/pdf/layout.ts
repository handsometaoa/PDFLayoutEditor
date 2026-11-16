/**
 * 纯几何计算：网格切分、页面适配、纸张方向选择。
 * 不依赖 pdf-lib，便于单元测试。
 *
 * 坐标系：PDF 用户空间，原点左下、Y 向上。
 * 「视觉尺寸」指应用了查看器 /Rotate 之后用户看到的页面尺寸。
 */

export type NupMode = 1 | 2 | 4
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
 * 按行优先 Z 序（左上→右上→左下→右下）切分网格。
 * mode=4 恒为 2×2；mode=2 横向纸为左右 1×2、纵向纸为上下 2×1；
 * mode=1（单页）为 1×1 整页可用区域。
 */
export function gridCells(
  sheetWidth: number,
  sheetHeight: number,
  mode: NupMode,
  margin: number,
  gutter: number,
): Rect[] {
  const landscape = sheetWidth >= sheetHeight
  const cols = mode === 4 ? 2 : mode === 2 ? (landscape ? 2 : 1) : 1
  const rows = mode === 4 ? 2 : mode === 2 ? (landscape ? 1 : 2) : 1
  const cellWidth = Math.max(1, (sheetWidth - 2 * margin - (cols - 1) * gutter) / cols)
  const cellHeight = Math.max(1, (sheetHeight - 2 * margin - (rows - 1) * gutter) / rows)
  const cells: Rect[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // row 0 是视觉顶部：PDF 坐标原点在左下，Y 向上，故从纸张顶部起算
      cells.push({
        x: margin + col * (cellWidth + gutter),
        y: sheetHeight - margin - cellHeight - row * (cellHeight + gutter),
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
  mode: NupMode
  orientation: OrientationSetting
  sheetSource: 'a4' | 'source'
  margin: number
  gutter: number
  autoRotate: boolean
}

/** 按设置推算输出纸张尺寸（方向自动时对全部有效页面取最优）——生成与即时预览共用 */
export function computeSheet(pageSizes: Size[], opts: SheetOptions, sourceFirstPage?: Size): Size {
  let landscapeSheet = A4_LANDSCAPE
  if (opts.sheetSource === 'source' && sourceFirstPage) {
    landscapeSheet = sheetFromSourceSize(sourceFirstPage, 'landscape')
  }
  const orientation = chooseOrientation(
    pageSizes,
    opts.orientation,
    landscapeSheet,
    opts.mode,
    opts.margin,
    opts.gutter,
    opts.autoRotate,
  )
  return orientation === 'landscape'
    ? landscapeSheet
    : { width: landscapeSheet.height, height: landscapeSheet.width }
}
