#!/bin/sh
# Baut das Mac-Overlay beim ersten Start (oder nach einer Änderung) und startet es im Hintergrund.
# Braucht die Xcode-Befehlszeilenwerkzeuge (swiftc): einmalig `xcode-select --install`.
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$HOME/.claude/y2k-overlay"
BIN="$OUT/Y2KOverlay-mac"
mkdir -p "$OUT"
if [ ! -x "$BIN" ] || [ "$DIR/Y2KOverlay.swift" -nt "$BIN" ]; then
  swiftc -O "$DIR/Y2KOverlay.swift" -o "$BIN" 2>"$OUT/build.log" || exit 1
fi
nohup "$BIN" >/dev/null 2>&1 &
