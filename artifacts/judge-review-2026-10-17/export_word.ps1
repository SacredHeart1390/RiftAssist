$ErrorActionPreference = 'Stop'
$riftDocPath = Join-Path $PSScriptRoot 'Riftbound_Judge_Review_21_KO.docx'
$riftPdfPath = Join-Path $PSScriptRoot 'research\word-render.pdf'
$riftWordApp = $null
$riftWordDoc = $null
try {
    $riftWordApp = New-Object -ComObject Word.Application
    $riftWordApp.Visible = $false
    $riftWordApp.DisplayAlerts = 0
    $riftWordDoc = $riftWordApp.Documents.Open($riftDocPath, $false, $true, $false)
    $riftWordDoc.Fields.Update() | Out-Null
    $riftWordDoc.ExportAsFixedFormat($riftPdfPath, 17)
    Write-Output 'Word export completed.'
} finally {
    if ($null -ne $riftWordDoc) {
        $riftWordDoc.Close(0)
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($riftWordDoc) | Out-Null
    }
    if ($null -ne $riftWordApp) {
        $riftWordApp.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($riftWordApp) | Out-Null
    }
}
