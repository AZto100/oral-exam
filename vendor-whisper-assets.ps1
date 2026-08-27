$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$wasmDir = Join-Path $root 'wasm'
$modelDir = Join-Path $root 'models'
New-Item -ItemType Directory -Force -Path $wasmDir | Out-Null
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

$runtimeUrl = 'https://ggml.ai/whisper.cpp/stream.wasm/stream.js'
$modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin?download=true'
$runtimeOut = Join-Path $wasmDir 'stream.js'
$modelOut = Join-Path $modelDir 'ggml-base.en-q5_1.bin'

Write-Host 'Downloading official whisper.cpp browser runtime...'
Invoke-WebRequest -Uri $runtimeUrl -OutFile $runtimeOut -UseBasicParsing

Write-Host 'Downloading quantized base.en Q5_1 model (~57 MB)...'
Invoke-WebRequest -Uri $modelUrl -OutFile $modelOut -UseBasicParsing

if ((Get-Item $runtimeOut).Length -lt 100000) { throw 'stream.js download is unexpectedly small.' }
if ((Get-Item $modelOut).Length -lt 50000000) { throw 'Whisper model download is unexpectedly small.' }

Write-Host ''
Write-Host 'Whisper assets installed:' -ForegroundColor Green
Write-Host "  $runtimeOut"
Write-Host "  $modelOut"
Write-Host "  coi-serviceworker.js (already included in project)"
Write-Host ''
Write-Host 'Commit these files to the GitHub Pages repository so students require no setup.'
