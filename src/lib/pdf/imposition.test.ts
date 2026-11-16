import { describe, expect, it } from 'vitest'
import type { Rect } from './layout'
import { placePage } from './imposition'

/**
 * 用独立的正向变换模拟验证锚点表：
 * drawPage 算子链 translate(x,y) → rotate(θ 逆时针) → scale(k)，
 * 把内容四角映射到输出坐标，断言渲染盒恰好等于目标居中矩形。
 */
function simulateBox(
  rawW: number,
  rawH: number,
  x: number,
  y: number,
  thetaDeg: number,
  k: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const rad = (thetaDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const corners: Array<[number, number]> = [
    [0, 0],
    [rawW, 0],
    [0, rawH],
    [rawW, rawH],
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [px, py] of corners) {
    const sx = px * k
    const sy = py * k
    const rx = sx * cos - sy * sin // 逆时针旋转
    const ry = sx * sin + sy * cos
    minX = Math.min(minX, x + rx)
    maxX = Math.max(maxX, x + rx)
    minY = Math.min(minY, y + ry)
    maxY = Math.max(maxY, y + ry)
  }
  return { minX, maxX, minY, maxY }
}

const RECT: Rect = { x: 100, y: 50, width: 300, height: 400 }

/** 验证渲染盒与目标居中矩形重合（等比 + 居中 + 不超出格子） */
function expectPlacedCorrectly(rawW: number, rawH: number, rotation: number, autoRotate: boolean) {
  const { options, placed } = placePage(rawW, rawH, rotation, RECT, autoRotate)
  const box = simulateBox(rawW, rawH, options.x, options.y, options.rotate, options.xScale)

  // 等比：scale 对 x/y 一致
  expect(options.yScale).toBeCloseTo(options.xScale)

  // 渲染盒尺寸 = placed 尺寸（旋转组合的自洽性）
  expect(box.maxX - box.minX).toBeCloseTo(placed.width, 6)
  expect(box.maxY - box.minY).toBeCloseTo(placed.height, 6)

  // 渲染盒 = 目标格子内的居中矩形
  const left = RECT.x + (RECT.width - placed.width) / 2
  const bottom = RECT.y + (RECT.height - placed.height) / 2
  expect(box.minX).toBeCloseTo(left, 6)
  expect(box.maxX).toBeCloseTo(left + placed.width, 6)
  expect(box.minY).toBeCloseTo(bottom, 6)
  expect(box.maxY).toBeCloseTo(bottom + placed.height, 6)

  // 内容不变形（xScale=yScale 已断言），最终视觉纵横比要么是原比例、要么是 90° 旋转后的倒数
  const visW = rotation % 180 === 0 ? rawW : rawH
  const visH = rotation % 180 === 0 ? rawH : rawW
  const visAspect = visW / visH
  const placedAspect = placed.width / placed.height
  const valid = [visAspect, 1 / visAspect]
  const nearest = valid.reduce((a, b) => (Math.abs(b - placedAspect) < Math.abs(a - placedAspect) ? b : a))
  expect(placedAspect).toBeCloseTo(nearest, 6)
}

describe('placePage /Rotate 补偿', () => {
  it.each([0, 90, 180, 270])('rotation=%i × autoRotate=±', (rotation) => {
    expectPlacedCorrectly(400, 600, rotation, false)
    expectPlacedCorrectly(400, 600, rotation, true)
    expectPlacedCorrectly(960, 540, rotation, false)
    expectPlacedCorrectly(960, 540, rotation, true)
  })

  it('/Rotate 90 不自动旋转：总角度 270（顺时针烘焙 90°），宽高按视觉尺寸适配', () => {
    const { options, placed } = placePage(400, 600, 90, RECT, false)
    expect(options.rotate).toBe(270)
    // 视觉 600×400，适配 300×400 格子
    expect(options.xScale).toBeCloseTo(0.5)
    expect(placed).toEqual({ width: 300, height: 200 })
  })

  it('/Rotate 90 + 自动旋转 90°：角度相互抵消为 0', () => {
    const { options } = placePage(400, 600, 90, RECT, true)
    expect(options.rotate).toBe(0)
  })

  it('/Rotate 270 + 自动旋转 90°：总角度 180', () => {
    const { options } = placePage(400, 600, 270, RECT, true)
    expect(options.rotate).toBe(180)
  })
})
