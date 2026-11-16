/**
 * 排版设置（分类卡片）：
 * 「版面布局」排版模式/纸张方向/输出纸张/边距间距/自动旋转；
 * 「打印设置」打印方式、奇数章补空白页（仅双面显示）；
 * 「输出内容」输出方式、页面序号、水印。
 */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useStudio } from '@/store'

interface SegmentedProps<T extends string | number> {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}

function Segmented<T extends string | number>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex gap-1 rounded-lg border p-1">
      {options.map((option) => (
        <Button
          key={String(option.value)}
          type="button"
          variant={value === option.value ? 'default' : 'ghost'}
          size="sm"
          className="h-7 flex-1 px-2"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} aria-label={label} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function CategoryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">{children}</CardContent>
    </Card>
  )
}

export function SettingsPanel() {
  const settings = useStudio((s) => s.settings)
  const setSettings = useStudio((s) => s.setSettings)
  const duplex = settings.printMode === 'duplex'

  return (
    <div className="space-y-4">
      <CategoryCard title="版面布局">
        <Row label="排版模式" hint="每张纸放置的页面数">
          <Segmented
            value={settings.mode}
            onChange={(v) => setSettings({ mode: v })}
            options={[
              { value: 1, label: '单页' },
              { value: 2, label: '2合1' },
              { value: 4, label: '4合1' },
            ]}
          />
        </Row>
        <Row label="纸张方向" hint="整体旋转排版">
          <Segmented
            value={settings.orientation}
            onChange={(v) => setSettings({ orientation: v })}
            options={[
              { value: 'auto', label: '自动' },
              { value: 'landscape', label: '横向' },
              { value: 'portrait', label: '纵向' },
            ]}
          />
        </Row>
        <Row label="输出纸张" hint={settings.sheetSource === 'a4' ? '标准 A4' : '按第一章首页比例'}>
          <Segmented
            value={settings.sheetSource}
            onChange={(v) => setSettings({ sheetSource: v })}
            options={[
              { value: 'a4', label: 'A4' },
              { value: 'source', label: '跟随源比例' },
            ]}
          />
        </Row>
        <Row label="页面边距" hint={`${settings.margin} pt`}>
          <Slider
            min={0}
            max={60}
            step={2}
            value={[settings.margin]}
            onValueChange={(v) => {
              const next = Array.isArray(v) ? v[0] : v
              if (typeof next === 'number') setSettings({ margin: next })
            }}
          />
        </Row>
        {settings.mode !== 1 && (
          <Row label="格子间距" hint={`${settings.gutter} pt`}>
            <Slider
              min={0}
              max={40}
              step={2}
              value={[settings.gutter]}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v
                if (typeof next === 'number') setSettings({ gutter: next })
              }}
            />
          </Row>
        )}
        <SwitchRow
          label="自动旋转页面"
          hint="页面旋转 90° 以最大化填充格子"
          checked={settings.autoRotate}
          onCheckedChange={(v) => setSettings({ autoRotate: v })}
        />
      </CategoryCard>

      <CategoryCard title="打印设置">
        <Row label="打印方式" hint="双面打印时每章从纸张正面开始">
          <Segmented
            value={settings.printMode}
            onChange={(v) => setSettings({ printMode: v })}
            options={[
              { value: 'duplex', label: '双面' },
              { value: 'simplex', label: '单面' },
            ]}
          />
        </Row>
        {duplex && (
          <SwitchRow
            label="奇数章补空白页"
            hint="每章从纸张正面开始，一张纸不混两章"
            checked={settings.padOdd}
            onCheckedChange={(v) => setSettings({ padOdd: v })}
          />
        )}
      </CategoryCard>

      <CategoryCard title="输出内容">
        <Row
          label="输出方式"
          hint={settings.outputMode === 'merge' ? '所有章节合成一个 PDF' : '每章单独输出一个 PDF'}
        >
          <Segmented
            value={settings.outputMode}
            onChange={(v) => setSettings({ outputMode: v })}
            options={[
              { value: 'merge', label: '合并' },
              { value: 'split', label: '不合并' },
            ]}
          />
        </Row>
        <SwitchRow
          label="页面序号"
          hint="每格右下角标注章节内页码"
          checked={settings.pageNumbers}
          onCheckedChange={(v) => setSettings({ pageNumbers: v })}
        />
        <SwitchRow
          label="水印"
          hint="整页斜向半透明文字水印"
          checked={settings.watermarkEnabled}
          onCheckedChange={(v) => setSettings({ watermarkEnabled: v })}
        />
        {settings.watermarkEnabled && (
          <Input
            value={settings.watermarkText}
            placeholder="水印文字，例：仅供个人学习"
            onChange={(e) => setSettings({ watermarkText: e.target.value })}
          />
        )}
      </CategoryCard>
    </div>
  )
}
