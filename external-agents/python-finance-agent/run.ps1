# PowerShell runner for Python Finance Agent on Windows
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# Check virtual environment or python
if (Test-Path "$ScriptDir\venv\Scripts\python.exe") {
    $PythonCmd = "$ScriptDir\venv\Scripts\python.exe"
} else {
    $PythonCmd = "python"
}

Write-Host ">>> Khởi chạy Python Finance Agent..." -ForegroundColor Green
$serverJob = Start-Job -ScriptBlock {
    param($py, $dir)
    Set-Location $dir
    & $py src/server.py
} -ArgumentList $PythonCmd, $ScriptDir

Start-Sleep -Seconds 2

Write-Host ">>> Gửi yêu cầu đăng ký Hot-plugging tới Gateway..." -ForegroundColor Cyan
& $PythonCmd src/register.py

Receive-Job $serverJob
Wait-Job $serverJob
