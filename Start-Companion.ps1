$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & npm.cmd start
    if ($LASTEXITCODE -ne 0) { throw '软件启动失败，请检查依赖是否安装。' }
} finally {
    Pop-Location
}
