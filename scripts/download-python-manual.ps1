# Manual Python Download Script for Windows
# This script can be used if the automated download fails due to network issues
# 
# Usage: powershell -ExecutionPolicy Bypass -File scripts/download-python-manual.ps1

$ErrorActionPreference = "Stop"

Write-Host "================================================================================`n" -ForegroundColor Green
Write-Host "Manual Python Download Script for AIDocMaster" -ForegroundColor Green
Write-Host "================================================================================`n" -ForegroundColor Green

$pythonVersion = "3.11.9"
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
$destination = "python-embed.zip"
$workingDir = Get-Location

Write-Host "[INFO] Python Version: $pythonVersion" -ForegroundColor Cyan
Write-Host "[INFO] Download URL: $pythonUrl" -ForegroundColor Cyan
Write-Host "[INFO] Destination: $destination" -ForegroundColor Cyan
Write-Host "[INFO] Working Directory: $workingDir`n" -ForegroundColor Cyan

# Check if file already exists
if (Test-Path $destination) {
    Write-Host "[WARN] File already exists: $destination" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/n)"
    if ($overwrite -ne "y") {
        Write-Host "[INFO] Download cancelled by user" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $destination -Force
    Write-Host "[INFO] Existing file removed`n" -ForegroundColor Cyan
}

Write-Host "[INFO] Starting download..." -ForegroundColor Cyan
Write-Host "[INFO] This may take several minutes depending on your connection speed`n" -ForegroundColor Cyan

try {
    # Configure TLS for secure connection
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    # Download with progress
    $webClient = New-Object System.Net.WebClient
    
    # Register event handler for progress
    Register-ObjectEvent -InputObject $webClient -EventName DownloadProgressChanged -SourceIdentifier WebClient.DownloadProgressChanged -Action {
        $percent = $EventArgs.ProgressPercentage
        $received = $EventArgs.BytesReceived / 1MB
        $total = $EventArgs.TotalBytesToReceive / 1MB
        Write-Progress -Activity "Downloading Python" -Status "$percent% Complete" -PercentComplete $percent -CurrentOperation "$([math]::Round($received, 2)) MB / $([math]::Round($total, 2)) MB"
    } | Out-Null
    
    # Start download
    $downloadTask = $webClient.DownloadFileTaskAsync($pythonUrl, $destination)
    
    # Wait for download to complete
    while (-not $downloadTask.IsCompleted) {
        Start-Sleep -Milliseconds 100
    }
    
    # Cleanup event handler
    Unregister-Event -SourceIdentifier WebClient.DownloadProgressChanged -ErrorAction SilentlyContinue
    $webClient.Dispose()
    
    # Check if download was successful
    if ($downloadTask.IsFaulted) {
        throw $downloadTask.Exception
    }
    
    Write-Host "`n[SUCCESS] Download completed successfully!" -ForegroundColor Green
    
    # Get file size
    $fileSize = (Get-Item $destination).Length / 1MB
    Write-Host "[SUCCESS] File size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Green
    Write-Host "[SUCCESS] File saved to: $destination`n" -ForegroundColor Green
    
    Write-Host "================================================================================`n" -ForegroundColor Green
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  Run: npm run build:desktop" -ForegroundColor Cyan
    Write-Host "  The build process will detect the downloaded file and continue.`n" -ForegroundColor Cyan
    Write-Host "================================================================================`n" -ForegroundColor Green
    
    exit 0
    
} catch {
    Write-Host "`n[ERROR] Download failed: $_" -ForegroundColor Red
    Write-Host "`n[INFO] Alternative download methods:" -ForegroundColor Yellow
    Write-Host "  1. Open this URL in your browser: $pythonUrl" -ForegroundColor Cyan
    Write-Host "  2. Save the file to: $workingDir\$destination" -ForegroundColor Cyan
    Write-Host "  3. Run: npm run build:desktop`n" -ForegroundColor Cyan
    
    # Check if it's a network/proxy issue
    if ($_.Exception.Message -match "timeout|proxy|connection") {
        Write-Host "[INFO] This appears to be a network/proxy issue." -ForegroundColor Yellow
        Write-Host "[INFO] If you're behind a corporate firewall, you may need to:" -ForegroundColor Yellow
        Write-Host "  - Configure your proxy settings" -ForegroundColor Cyan
        Write-Host "  - Contact your IT department" -ForegroundColor Cyan
        Write-Host "  - Use a VPN`n" -ForegroundColor Cyan
    }
    
    Write-Host "================================================================================`n" -ForegroundColor Red
    exit 1
}

