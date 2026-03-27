$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$datasetDir = Join-Path $repoRoot 'dataset'
$outDir = Join-Path $repoRoot 'chipiq/public/integrated-data'

if (!(Test-Path $datasetDir)) {
  throw "Dataset folder not found: $datasetDir"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Copy-Item (Join-Path $datasetDir 'dataset_summary.json') (Join-Path $outDir 'dataset_summary.json') -Force

$reg = Import-Csv (Join-Path $datasetDir 'regression_results.csv')
$rtl = Import-Csv (Join-Path $datasetDir 'rtl_commits.csv')
$cov = Import-Csv (Join-Path $datasetDir 'coverage_data.csv')
$bugs = Import-Csv (Join-Path $datasetDir 'bug_reports_inferred_from_commits.csv')

$reg | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'regression_results.json')
$rtl | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'rtl_commits.json')
$cov | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'coverage_data.json')
$bugs | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'bug_reports_inferred.json')

$moduleNames = @('Uart8Receiver','Uart8Transmitter','BaudRateGenerator','Uart8')
$moduleRows = foreach ($m in $moduleNames) {
  $covCount = ($cov | Where-Object { $_.module -eq $m } | Measure-Object).Count
  $fixCount = ($bugs | Where-Object { $_.title -match '(?i)fix|bug|error' } | Measure-Object).Count
  $risk = [Math]::Min(95, 35 + ($covCount * 6) + ($fixCount * 2))
  $coverage = [Math]::Max(60, [Math]::Min(98, 96 - ($covCount * 2)))
  $openBugs = [Math]::Max(0, [Math]::Min(20, [Math]::Floor($risk / 12)))
  $status = if ($risk -ge 80) { 'CRITICAL' } elseif ($risk -ge 65) { 'HIGH' } elseif ($risk -ge 45) { 'MEDIUM' } else { 'LOW' }

  [PSCustomObject]@{
    name = $m
    riskScore = $risk
    coverage = $coverage
    openBugs = $openBugs
    status = $status
  }
}
$moduleRows | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'module_summary.json')

$trend = $bugs |
  Group-Object { (Get-Date $_.created_at).ToString('yyyy-MM') } |
  Sort-Object Name |
  ForEach-Object {
    [PSCustomObject]@{
      month = $_.Name
      bugs = [int]$_.Count
    }
  }
$trend | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'bug_trend_monthly.json')

Write-Output 'Integrated data refreshed.'