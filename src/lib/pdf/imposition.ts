/**
 * N-up 排版核心：把源页面（含 /Rotate 查看器旋转）等比放入输出纸张的格子。
 *
 * pdf-lib 的 embedPage/drawPage 不感知 /Rotate（已知行为，见 Hopding/pdf-lib#524 等），
 * 需手动补偿。drawPage 的算子链为 translate(x,y) → rotate(θ 逆时针) → scale(k)，
 * 内容点 (px,py)∈[0,w]×[0,h] 映射为：
 *   θ=0  : (x + k·px,      y + k·py)
 *   θ=90 : (x − k·py,      y + k·px)     盒子 X∈[x−k·h, x]      Y∈[y, y+k·w]
 *   θ=180: (x − k·px,      y − k·py)     盒子 X∈[x−k·w, x]      Y∈[y−k·h, y]
 *   θ=270: (x + k·py,      y − k·px)     盒子 X∈[x, x+k·h]      Y∈[y−k·w, y]
 * 由此推出四种姿态的锚点（使渲染盒恰好落在 [left,left+pw]×[bottom,bottom+ph]）。
 *
 * 旋转合成：/Rotate R 为查看器顺时针旋转，drawPage 的角度逆时针为正，
 * 故「烘焙」R 需要 θ = (360 − R)；再加版面旋转 L（0/90）得总角度。
 */
import type { Rect, Size } from './layout'
import { fitPage, normalizeRotation, visualSize } from './layout'

export interface DrawPlacement {
  x: number
  y: number
  xScale: number
  yScale: number
  /** 总旋转角（度，逆时针为正），调用方需传给 pdf-lib 的 degrees() */
  rotate: 0 | 90 | 180 | 270
}

/** θ 对应的 drawPage 锚点，使渲染盒落在 [left,left+pw]×[bottom,bottom+ph] */
export function anchorForTheta(
  theta: 0 | 90 | 180 | 270,
  placedWidth: number,
  placedHeight: number,
  left: number,
  bottom: number,
): { x: number; y: number } {
  switch (theta) {
    case 90:
      return { x: left + placedWidth, y: bottom }
    case 180:
      return { x: left + placedWidth, y: bottom + placedHeight }
    case 270:
      return { x: left, y: bottom + placedHeight }
    default:
      return { x: left, y: bottom }
  }
}

export interface PlaceResult {
  options: DrawPlacement
  placed: Size
  /** 旋转后的内容盒（PDF 坐标，用于页码等标注定位） */
  box: { left: number; bottom: number; width: number; height: number }
}

/**
 * 计算把源页（原始内容尺寸 rawW×rawH、查看器旋转 R）放进 rect 的 drawPage 参数。
 * rawW/rawH 必须是未旋转的原始盒尺寸（MediaBox/CropBox），不是视觉尺寸。
 */
export function placePage(
  rawWidth: number,
  rawHeight: number,
  rotation: number,
  rect: Rect,
  autoRotate: boolean,
): PlaceResult {
  const r = normalizeRotation(rotation)
  const vis = visualSize(rawWidth, rawHeight, r)
  const fit = fitPage(vis.width, vis.height, rect, autoRotate)
  const theta = (((360 - r + fit.rotate) % 360) + 360) % 360 as 0 | 90 | 180 | 270
  const left = rect.x + (rect.width - fit.placedWidth) / 2
  const bottom = rect.y + (rect.height - fit.placedHeight) / 2
  const anchor = anchorForTheta(theta, fit.placedWidth, fit.placedHeight, left, bottom)
  return {
    placed: { width: fit.placedWidth, height: fit.placedHeight },
    box: { left, bottom, width: fit.placedWidth, height: fit.placedHeight },
    options: {
      x: anchor.x,
      y: anchor.y,
      xScale: fit.scale,
      yScale: fit.scale,
      rotate: theta,
    },
  }
}
