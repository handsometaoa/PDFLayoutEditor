/**
 * 双面打印指引（精简版）：卡片内一行核心提醒，
 * 详细步骤、Windows/macOS 通用路径与品牌官方说明书入口收进弹窗。
 */
import { useState } from 'react'
import { BookOpen, ExternalLink, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const BRAND_LINKS: Array<{ brand: string; desc: string; url: string }> = [
  { brand: '惠普 HP', desc: '支持中心（搜索「双面打印」并选择机型）', url: 'https://support.hp.com/cn-zh' },
  { brand: '佳能 Canon', desc: '下载与支持（按型号查说明书）', url: 'https://www.canon.com.cn/supports/index.html' },
  { brand: '爱普生 Epson', desc: '官网「服务与支持」入口', url: 'https://www.epson.com.cn/' },
  { brand: '兄弟 Brother', desc: '官方支持站（选择机型看说明书）', url: 'https://support.brother.com/' },
  { brand: '联想 Lenovo', desc: '联想服务（搜索机型与双面打印）', url: 'https://support.lenovo.com.cn/' },
  { brand: '奔图 Pantum', desc: '官网服务支持入口', url: 'https://www.pantum.cn/' },
]

export function PrintGuide() {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />双面打印指引
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          生成结果已按双面打印就绪。打印时选「
          <b className="text-foreground">短边翻转</b>」+「
          <b className="text-foreground">实际大小 100%</b>」即可。
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
          <BookOpen className="mr-1 h-4 w-4" />
          详细说明与各品牌官方手册
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">双面打印详细说明</DialogTitle>
              <DialogDescription>
                排版已完成，只需在打印对话框里选对两项设置；不同品牌入口见下方官方链接。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
                <li>
                  小册子模式：双面打印后<b className="text-foreground">逐张对折</b>
                  ，按页序叠放并沿折线装订即为成册
                </li>
              </ol>
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Windows 通用路径</p>
                <p>
                  打印对话框（Ctrl+P）→「打印机属性 / 更多设置」→
                  找到「双面打印 / Duplex」→ 选择
                  <b className="text-foreground">「短边翻转」</b>
                  （部分驱动叫「双面打印，手动短边」）→ 打印。
                </p>
                <p className="mt-1.5">
                  macOS：打印对话框展开「更多选项」→ 勾选「双面打印」→
                  翻页方式选「<b className="text-foreground">短边</b>」。
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">各品牌官方说明书 / 支持页</p>
                {BRAND_LINKS.map((item) => (
                  <a
                    key={item.brand}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{item.brand}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                提示：进入官方支持页后，搜索「双面打印 / 说明书」并选择你的具体型号，即可查看该机型的图文步骤。
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
