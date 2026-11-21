# Startet das Y2K-Overlay fuer das Claude-Fenster.
# Beenden: Rechtsklick auf das Glitzer-Symbol im Infobereich -> Beenden.
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'Y2KOverlay.cs'
Add-Type -Path $src -ReferencedAssemblies System.Windows.Forms, System.Drawing, UIAutomationClient, UIAutomationTypes, WindowsBase
[Y2KOverlay.App]::Run()
