# PowerShell helper script to find and run Python scripts
# This script automatically detects Python installation and runs the specified script

param(
    [Parameter(Mandatory=$true)]
    [string]$Script,
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

# Function to find Python executable
function Find-Python {
    # Common Python installation paths on Windows
    $pythonPaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:ProgramFiles\Python312\python.exe",
        "$env:ProgramFiles\Python311\python.exe",
        "$env:ProgramFiles\Python310\python.exe",
        "$env:ProgramFiles\Python39\python.exe",
        "$env:ProgramFiles\Python38\python.exe"
    )
    
    # Check if python is in PATH
    $pythonInPath = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonInPath) {
        $pythonExe = $pythonInPath.Source
        # Skip Windows Store stub
        if ($pythonExe -notlike "*WindowsApps*") {
            return $pythonExe
        }
    }
    
    # Check common installation paths
    foreach ($path in $pythonPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    # Try to find in user's AppData\Local\Programs\Python
    $pythonDirs = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -ErrorAction SilentlyContinue
    foreach ($dir in $pythonDirs) {
        $pythonExe = Join-Path $dir.FullName "python.exe"
        if (Test-Path $pythonExe) {
            return $pythonExe
        }
    }
    
    Write-Error "Python not found. Please install Python or specify the path manually."
    exit 1
}

# Find Python
$pythonExe = Find-Python

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $backendDir

# Resolve script path (can be relative or absolute)
if (-not [System.IO.Path]::IsPathRooted($Script)) {
    # If script path already contains 'scripts', don't add it again
    if ($Script -like "scripts\*" -or $Script -like "scripts/*") {
        $Script = Join-Path $backendDir $Script
    } else {
        $Script = Join-Path $scriptDir $Script
    }
}

# Change to backend directory for proper module imports
Push-Location $backendDir

try {
    # Run the script with Python
    & $pythonExe $Script $Arguments
}
finally {
    Pop-Location
}

