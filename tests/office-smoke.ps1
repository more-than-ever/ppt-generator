param([string]$ProgId = 'PowerPoint.Application')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$file = Join-Path $root 'artifacts\真实字体与Office验收.pptx'
$expected = Get-Content -LiteralPath (Join-Path $root 'artifacts\office-expected.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$output = Join-Path $root ('artifacts\office-' + $ProgId.Split('.')[0])
[void][System.IO.Directory]::CreateDirectory($output)
$app = $null
$deck = $null
$ownedEmptySession = $false
try {
    $app = New-Object -ComObject $ProgId
    $ownedEmptySession = $app.Presentations.Count -eq 0
    # 只读打开测试样例，不保存或关闭用户已有文稿。
    $deck = $app.Presentations.Open($file, -1, 0, 0)
    if ($deck.Slides.Count -ne $expected.Count) { throw 'Office打开后的页数不一致' }
    $results = @()
    for ($i = 1; $i -le $deck.Slides.Count; $i++) {
        $slide = $deck.Slides.Item($i)
        $texts = @()
        $images = 0
        foreach ($shape in $slide.Shapes) {
            if ($shape.Type -eq 13) { $images++ }
            if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                $texts += $shape.TextFrame.TextRange.Text
            }
        }
        if (($texts -join "`n") -cne ($expected[$i - 1].texts -join "`n")) { throw "第${i}页可编辑文字与场景不一致" }
        if ($images -ne $expected[$i - 1].images) { throw "第${i}页图片数量不一致" }
        $slide.Export((Join-Path $output "slide-$i.png"), 'PNG', 1600, 900)
        $results += @{ page = $i; textBoxes = $texts.Count; images = $images; title = $expected[$i - 1].name }
    }
    @{ requestedProgId = $ProgId; applicationPath = $app.Path; application = $app.Name; version = $app.Version; slides = $results; status = '已实际打开并渲染，待查看图片确认显示效果' } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding UTF8
    Write-Output "Office已实际打开并导出 $($deck.Slides.Count) 页：$output"
} finally {
    if ($null -ne $deck) { $deck.Close(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($deck) }
    if ($null -ne $app) {
        if ($ownedEmptySession -and $app.Presentations.Count -eq 0) { $app.Quit() }
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
    }
}
