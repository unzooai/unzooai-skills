# 把 HTML 放进 Windows 剪贴板（CF_HTML 格式），供 Unzoo 的 trusted paste 粘成富文本。
# 用法（必须 STA 线程，所以走 Windows PowerShell 5.1）：
#   powershell.exe -STA -ExecutionPolicy Bypass -File scripts/set_html_clipboard.ps1 -HtmlFile <文件> [-TextFile <纯文本兜底>]
# 背景：Unzoo 的 /api/v1/clipboard/write 只写 text/plain（html 字段被忽略），
# 但 /api/v1/clipboard/paste 是真 trusted paste——只要剪贴板里有 CF_HTML，粘进去就带格式。
param(
  [Parameter(Mandatory = $true)][string]$HtmlFile,
  [string]$TextFile
)

# 2026-09-28：输出统一 UTF-8，报错也 catch 住原样打出来——定时任务里报 GBK 让 Python 解码崩掉、原因丢失过。
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
trap { "err: $($_.Exception.GetType().Name): $($_.Exception.Message)"; exit 1 }
Add-Type -AssemblyName System.Windows.Forms

$html = Get-Content -Raw -Encoding UTF8 $HtmlFile
$text = if ($TextFile -and (Test-Path $TextFile)) { Get-Content -Raw -Encoding UTF8 $TextFile } else { ($html -replace '<[^>]+>', '') }

# CF_HTML 的头部要写 4 个**字节**偏移，且偏移本身占位固定（10 位十进制），所以分两步算
$header = @"
Version:0.9
StartHTML:{0:D10}
EndHTML:{1:D10}
StartFragment:{2:D10}
EndFragment:{3:D10}
"@
$pre = "<html><head><meta charset=`"utf-8`"></head><body><!--StartFragment-->"
$post = "<!--EndFragment--></body></html>"
$tpl = ($header -f 0, 0, 0, 0)
$enc = [System.Text.Encoding]::UTF8
$hdrLen = $enc.GetByteCount($tpl)
$startHtml = $hdrLen
$startFrag = $hdrLen + $enc.GetByteCount($pre)
$endFrag = $startFrag + $enc.GetByteCount($html)
$endHtml = $endFrag + $enc.GetByteCount($post)
$cf = ($header -f $startHtml, $endHtml, $startFrag, $endFrag) + $pre + $html + $post

$data = New-Object System.Windows.Forms.DataObject
# ⚠️不能 SetData(..., $cf) 传字符串：.NET 会按 ANSI 编码写 CF_HTML，中文直接乱码。
# CF_HTML 规定是 UTF-8，所以必须自己把 UTF-8 字节塞进 MemoryStream 再交给剪贴板。
$bytes = $enc.GetBytes($cf)
$ms = New-Object System.IO.MemoryStream
$ms.Write($bytes, 0, $bytes.Length)
$data.SetData("HTML Format", $ms)
$data.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $text)
# ⚠️2026-09-21：两参数的 SetDataObject 在剪贴板被别的进程占用时会**静默失败**（写完读回是空）。
# 用带重试的四参数重载：copy=true, retryTimes=10, retryDelay=150ms。
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 150)
# ⚠️2026-09-21：这一下 flush 是异步的，进程退太快剪贴板会是空的（知乎那次 paste 事件里 types=[]）。
# 必须留时间让 OLE 把数据交出去，并读回确认一次再退出。
[System.Windows.Forms.Application]::DoEvents()
Start-Sleep -Milliseconds 500
$check = [System.Windows.Forms.Clipboard]::GetDataObject()
$fmts = if ($check) { $check.GetFormats() -join ',' } else { '(空)' }

"ok html_bytes=$($enc.GetByteCount($html)) text_chars=$($text.Length) cf_bytes=$($enc.GetByteCount($cf)) formats=$fmts"
