import { describe, expect, it } from 'vitest'
import type { Rect, Size } from './layout'
import { A4_LANDSCAPE, bookletPageOrder, chooseOrientation, fitPage, gridCells, normalizeRotation, visualSize } from './layout'

describe('normalizeRotation', () => {
  it('规整任意角度', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(90)).toBe(90)
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(180)).toBe(180)
    expect(normalizeRotation(270)).toBe(270)
  })
})

describe('visualSize', () => {
  it('90/270 时宽高互换', () => {
    expect(visualSize(400, 600, 0)).toEqual({ width: 400, height: 600 })
    expect(visualSize(400, 600, 90)).toEqual({ width: 600, height: 400 })
    expect(visualSize(400, 600, 180)).toEqual({ width: 400, height: 600 })
    expect(visualSize(400, 600, 270)).toEqual({ width: 600, height: 400 })
  })
})

describe('gridCells', () => {
  it('4合1 横向纸：2×2，Z 序（左上→右上→左下→右下）', () => {
    const cells = gridCells(842, 595, 4, 14, 8)
    expect(cells).toHaveLength(4)
    const cw = (842 - 28 - 8) / 2
    const ch = (595 - 28 - 8) / 2
    expect(cells[0]).toMatchObject({ x: 14, y: 14 + ch + 8 }) // row 0 = 视觉顶部
    expect(cells[1]).toMatchObject({ x: 14 + cw + 8, y: 14 + ch + 8 })
    expect(cells[2]).toMatchObject({ x: 14, y: 14 })
    expect(cells[3]).toMatchObject({ x: 14 + cw + 8, y: 14 })
    for (const c of cells) {
      expect(c.width).toBeCloseTo(cw)
      expect(c.height).toBeCloseTo(ch)
    }
  })

  it('2合1 横向纸：左右排列', () => {
    const cells = gridCells(842, 595, 2, 14, 8)
    expect(cells).toHaveLength(2)
    expect(cells[0]!.y).toBeCloseTo(cells[1]!.y)
    expect(cells[0]!.x).toBeLessThan(cells[1]!.x)
  })

  it('2合1 纵向纸：上下排列（第一格在视觉上方）', () => {
    const cells = gridCells(595, 842, 2, 14, 8)
    expect(cells).toHaveLength(2)
    expect(cells[0]!.x).toBeCloseTo(cells[1]!.x)
    expect(cells[0]!.y).toBeGreaterThan(cells[1]!.y)
  })

  it('单页模式：整页可用区域为单格', () => {
    const cells = gridCells(842, 595, 1, 14, 8)
    expect(cells).toHaveLength(1)
    expect(cells[0]!.width).toBeCloseTo(842 - 28)
    expect(cells[0]!.height).toBeCloseTo(595 - 28)
    expect(cells[0]!.x).toBeCloseTo(14)
    expect(cells[0]!.y).toBeCloseTo(14)
  })

  it('小册子：2 格横排且折线处零间距', () => {
    const cells = gridCells(842, 595, 'booklet', 14, 8)
    expect(cells).toHaveLength(2)
    expect(cells[0]!.width).toBeCloseTo((842 - 28) / 2)
    expect(cells[1]!.x).toBeCloseTo(cells[0]!.x + cells[0]!.width) // 折线无缝
  })
})

describe('fitPage', () => {
  it('不旋转时等比缩小并适配', () => {
    const cell: Rect = { x: 0, y: 0, width: 200, height: 400 }
    const fit = fitPage(400, 600, cell, false)
    expect(fit.rotate).toBe(0)
    expect(fit.scale).toBeCloseTo(0.5)
    expect(fit.placedWidth).toBeCloseTo(200)
    expect(fit.placedHeight).toBeCloseTo(300)
  })

  it('autoRotate：竖页进横格取 90°', () => {
    const cell: Rect = { x: 0, y: 0, width: 400, height: 200 }
    const noRot = fitPage(400, 600, cell, false) // 竖页 400×600
    const rot = fitPage(400, 600, cell, true)
    expect(noRot.scale).toBeCloseTo(200 / 600)
    expect(rot.rotate).toBe(90)
    expect(rot.scale).toBeCloseTo(0.5)
    expect(rot.placedWidth).toBeCloseTo(300) // vh*s90 = 600*0.5
    expect(rot.placedHeight).toBeCloseTo(200) // vw*s90 = 400*0.5
  })

  it('autoRotate：缩放相同时保持 0°', () => {
    const cell: Rect = { x: 0, y: 0, width: 300, height: 300 }
    expect(fitPage(300, 300, cell, true).rotate).toBe(0)
  })
})

describe('chooseOrientation', () => {
  it('纵向文档 4合1 自动选纵向纸（缩放更大）', () => {
    const doc: Size[] = [{ width: 595, height: 842 }]
    const o = chooseOrientation(doc, 'auto', A4_LANDSCAPE, 4, 14, 8, true)
    expect(o).toBe('portrait')
  })

  it('16:9 幻灯片 4合1 自动选横向纸', () => {
    const slides: Size[] = [{ width: 960, height: 540 }]
    const o = chooseOrientation(slides, 'auto', A4_LANDSCAPE, 4, 14, 8, true)
    expect(o).toBe('landscape')
  })

  it('显式指定方向时直接采用', () => {
    const doc: Size[] = [{ width: 595, height: 842 }]
    expect(chooseOrientation(doc, 'landscape', A4_LANDSCAPE, 4, 14, 8, true)).toBe('landscape')
  })
})

describe('bookletPageOrder', () => {
  it('8 页（2 张纸）：折叠后阅读顺序为 1-8', () => {
    expect(bookletPageOrder(8)).toEqual([8, 1, 2, 7, 6, 3, 4, 5])
  })

  it('10 页自动补足至 12，超出槽位为 -1（空白）', () => {
    expect(bookletPageOrder(10)).toEqual([-1, 1, 2, -1, 10, 3, 4, 9, 8, 5, 6, 7])
  })

  it('槽位数恒为 4 的倍数', () => {
    for (const n of [1, 3, 5, 7, 9, 13, 17]) {
      expect(bookletPageOrder(n).length % 4).toBe(0)
    }
  })
})
