$ErrorActionPreference = 'Stop'
$riftGuideDoc = Join-Path $PSScriptRoot '리프트어시_고정도메인_운영안내_2026-10-21.docx'
$riftGuidePdf = Join-Path $PSScriptRoot 'word-render.pdf'
$riftGuideWord = $null
$riftGuideOpened = $null
try {
    $riftGuideWord = New-Object -ComObject Word.Application
    $riftGuideWord.Visible = $false
    $riftGuideWord.DisplayAlerts = 0
    $riftGuideOpened = $riftGuideWord.Documents.Open($riftGuideDoc, $false, $true, $false)
    $riftGuideOpened.Fields.Update() | Out-Null
    $riftGuideOpened.ExportAsFixedFormat($riftGuidePdf, 17)
    Write-Output 'Guide exported for layout review.'
} finally {
    if ($null -ne $riftGuideOpened) {
        $riftGuideOpened.Close(0)
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($riftGuideOpened) | Out-Null
    }
    if ($null -ne $riftGuideWord) {
        $riftGuideWord.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($riftGuideWord) | Out-Null
    }
}
