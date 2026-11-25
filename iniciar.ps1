[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Puerto = 3500)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $nodeVersion = & node.exe --version
    $nodeMajor = [int](($nodeVersion.TrimStart('v') -split '\.')[0])
    if ($nodeMajor -lt 24) { throw 'Instala Node.js 24 o posterior.' }
    if (-not (Test-Path -LiteralPath 'node_modules/.bin/next.cmd')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Error instalando las dependencias.' }
    }
    if (-not (Test-Path -LiteralPath '.next/BUILD_ID')) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Error compilando la aplicación.' }
    }
    while ($true) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Puerto)
        try { $listener.Start(); break }
        catch [System.Net.Sockets.SocketException] {
            if ($Puerto -eq 65535) { throw }
            $Puerto++
        }
        finally { $listener.Stop() }
    }
    Write-Host "Azure Exam Lab http://localhost:$Puerto"
    & npm.cmd run start -- --port $Puerto
    exit $LASTEXITCODE
}
finally { Pop-Location }

