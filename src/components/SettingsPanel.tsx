/**
 * 打印设置（渐进式披露）：
 * 核心仅两项决策——排版模式、打印方式（双面/单面）；
 * 其余进阶项（方向、纸张、边距间距、旋转、输出方式、页码、水印）
 * 收进默认折叠的「高级选项」。
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useStudio } from '@/store'

interface SegmentedOption<T> {
  value: T
  label: string
  disabled?: boolean
  title?: string
}

interface SegmentedProps<T extends string | number> {
  value: T
  options: Array<SegmentedOption<T>>
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
          disabled={option.disabled}
          title={option.title}
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

export function SettingsPanel() {
  const settings = useStudio((s) => s.settings)
  const setSettings = useStudio((s) => s.setSettings)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">打印设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 核心决策 */}
        <Row
          label="排版模式"
          hint={settings.mode === 'booklet' ? '对折装订，自动补空白至 4 的倍数' : '每张纸放置的页面数'}
        >
          <Segmented
            value={settings.mode}
            onChange={(v) => setSettings({ mode: v, ...(v === 'booklet' ? { printMode: 'duplex' as const } : {}) })}
            options={[
              { value: 1, label: '单页' },
              { value: 2, label: '2合1' },
              { value: 4, label: '4合1' },
              { value: 'booklet', label: '小册子' },
            ]}
          />
        </Row>
        <Row
          label="打印方式"
          hint={settings.mode === 'booklet' ? '小册子需双面打印后逐张对折装订' : '双面时每章自动从纸张正面开始，一张纸不混两章'}
        >
          <Segmented
            value={settings.printMode}
            onChange={(v) => setSettings({ printMode: v })}
            options={[
              { value: 'duplex', label: '双面' },
              { value: 'simplex', label: '单面', disabled: settings.mode === 'booklet', title: '小册子必须双面打印' },
            ]}
          />
        </Row>

        {/* 高级选项（默认折叠） */}
        <div className="border-t pt-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            <span>高级选项</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>
          {advancedOpen && (
            <div className="mt-2 space-y-4">
              {settings.mode !== 'booklet' && (
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
              )}
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
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
