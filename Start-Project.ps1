param([string]$PythonExecutable)
$ErrorActionPreference = 'Stop'
$projectOutputs = $PSScriptRoot
$projectWorkspace = Split-Path -Parent $projectOutputs
if (!$PythonExecutable) {
  $bundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
  $PythonExecutable = if (Test-Path -LiteralPath $bundledPython) { $bundledPython } else { 'python' }
}
$env:AI_PYTHON = $PythonExecutable
$aiPackages = Join-Path $projectWorkspace 'work\ai-packages'
if (Test-Path -LiteralPath $aiPackages) { $env:PYTHONPATH = $aiPackages }
Push-Location (Join-Path $projectOutputs 'smart-village-backend')
try { npm.cmd run local } finally { Pop-Location }
