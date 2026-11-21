# Übernimmt die aktuelle Fassung des Y2K-Plugins in die Claude-App.
# Die App lädt das Plugin aus einer Kopie im Plugin-Cache, nicht direkt aus diesem Ordner.
# Danach in der Sitzung /reload-plugins eingeben (oder eine neue Sitzung öffnen).

claude plugin marketplace update claude-mods
claude plugin update y2k@claude-mods
Write-Host ''
Write-Host 'Jetzt in der Claude-Sitzung /reload-plugins eingeben. Im Schild unten rechts steht danach die neue Version.'
