/**
 * 双面打印指引：排版层保证的规则 + 需要用户在打印对话框手选的设置。
 */
import { Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PrintGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />双面打印指引
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            双面打印请选「<b className="text-foreground">短边翻转</b> / 短边装订」——
            横向页面选「长边翻转」会导致背面颠倒
          </li>
          <li>
            缩放选「<b className="text-foreground">实际大小 100%</b>」，
            不要再选「每张多页」（排版已完成）
          </li>
          <li>纸张方向保持「自动」或横向</li>
          <li>奇数章补的空白页都落在纸张背面，不浪费正面</li>
        </ol>
      </CardContent>
    </Card>
  )
}
