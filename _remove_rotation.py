import pathlib

# 1) merge.ts
p = pathlib.Path('src/lib/pdf/merge.ts')
s = p.read_text(encoding='utf-8')
old = "      const totalRotation = srcPage.getRotation().angle + (pageRotations?.[slot] ?? 0)\n      const { options, box } = placePage(rawWidth, rawHeight, totalRotation, cells[k]!, autoRotate)"
new = "      const totalRotation = srcPage.getRotation().angle\n      const { options, box } = placePage(rawWidth, rawHeight, totalRotation, cells[k]!, autoRotate)"
assert old in s, "merge totalRotation"
s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
print('merge ok')

# 2) worker
p = pathlib.Path('src/lib/worker/imposition.worker.ts')
s = p.read_text(encoding='utf-8')
old = "      pageRotations: c.pageRotations,\n"
assert old in s, "worker pageRotations"
s = s.replace(old, "")
p.write_text(s, encoding='utf-8')
print('worker ok')

# 3) GenerateSection
p = pathlib.Path('src/components/GenerateSection.tsx')
s = p.read_text(encoding='utf-8')
old = "          pageRotations: f.pageRotations,\n"
assert old in s, "generate pageRotations"
s = s.replace(old, "")
p.write_text(s, encoding='utf-8')
print('generate ok')

# 4) PageViewerDialog
p = pathlib.Path('src/components/PageViewerDialog.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace("import { ChevronLeft, ChevronRight, Redo2, Trash2, Undo2 } from 'lucide-react'",
              "import { ChevronLeft, ChevronRight, Trash2, Undo2 } from 'lucide-react'")
s = s.replace("  const rotated = record.pageRotations?.[pageIndex] ?? 0\n", "")
s = s.replace("  const rotatePage = useStudio((s) => s.rotatePage)\n", "")
s = s.replace("""            {rotated > 0 && (
              <Badge variant="outline" className="gap-1">
                <Redo2 className="h-3 w-3" />
                已旋转 {rotated}°
              </Badge>
            )}
""", "")
s = s.replace("""            <Button
              variant="outline"
              size="sm"
              title={`旋转 90°（当前 ${rotated}°）`}
              onClick={() => rotatePage(record.id, pageIndex)}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
""", "")
p.write_text(s, encoding='utf-8')
print('viewer ok')
