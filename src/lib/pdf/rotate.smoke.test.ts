/**
 * /Rotate 补偿冒烟测试（核心风险点回归）：
 * 造一个 4 页合成 PDF（/Rotate = 0/90/180/270，含页首蓝条 + 页码文字），
 * 用 buildOutput 完整走 4合1 排版，输出 source/imposed/imposed-autoRotate 三份 PDF
 * 到 .smoke/ 目录，供人工渲染对照——每格内容方向必须与查看器显示方向一致。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { A4_LANDSCAPE } from './layout'
import { buildOutput } from './merge'

const OUT_DIR = path.resolve(process.cwd(), '.smoke')

async function makeSynthetic(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const rotations = [0, 90, 180, 270]
  // 每页不同颜色的条与页码，用于渲染仲裁格子归属
  const colors = [rgb(0.2, 0.4, 0.85), rgb(0.1, 0.65, 0.3), rgb(0.55, 0.2, 0.75), rgb(0.9, 0.5, 0.1)]
  for (let i = 0; i < rotations.length; i++) {
    const R = rotations[i]!
    const color = colors[i]!
    const page = doc.addPage([400, 600]) // 纵向内容空间
    page.drawRectangle({ x: 0, y: 0, width: 400, height: 600, color: rgb(1, 1, 1) })
    page.drawRectangle({ x: 8, y: 8, width: 384, height: 584, borderColor: rgb(0.85, 0.2, 0.2), borderWidth: 3 })
    // 内容空间顶部的条 = 页首标记；查看器显示时随 /Rotate 旋转
    page.drawRectangle({ x: 40, y: 552, width: 320, height: 26, color })
    page.drawText('TOP-LEFT', { x: 40, y: 520, size: 26, font, color: rgb(0.1, 0.1, 0.1) })
    page.drawText(`P${i + 1} R${R}`, { x: 105, y: 270, size: 58, font, color })
    page.setRotation(degrees(R))
  }
  return doc.save()
}

describe('/Rotate 补偿冒烟', () => {
  it('生成合成源与 4合1 排版样张', async () => {
    await mkdir(OUT_DIR, { recursive: true })
    const source = await makeSynthetic()
    await writeFile(path.join(OUT_DIR, 'source.pdf'), source)

    const settings = {
      mode: 4 as const,
      sheetWidth: A4_LANDSCAPE.width,
      sheetHeight: A4_LANDSCAPE.height,
      margin: 14,
      gutter: 8,
      autoRotate: false,
      padOdd: false,
      pageNumbers: false,
      watermarkText: '',
    }
    const imposed = await buildOutput(
      [{ id: 's', name: 'source', bytes: source, keptPages: [0, 1, 2, 3] }],
      settings,
      () => {},
    )
    await writeFile(path.join(OUT_DIR, 'imposed.pdf'), imposed.bytes)
    expect(imposed.pageCount).toBe(1)

    const imposedAuto = await buildOutput(
      [{ id: 's', name: 'source', bytes: source, keptPages: [0, 1, 2, 3] }],
      { ...settings, autoRotate: true },
      () => {},
    )
    await writeFile(path.join(OUT_DIR, 'imposed-auto.pdf'), imposedAuto.bytes)
  })
})
