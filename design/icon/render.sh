#!/bin/sh
# Renders the icon SVGs into app/assets (needs rsvg-convert: brew install librsvg).
set -e
cd "$(dirname "$0")"
A=../../app/assets
rsvg-convert -w 1024 -h 1024 icon.svg -o $A/icon.png
rsvg-convert -w 1024 -h 1024 android-foreground.svg -o $A/android-icon-foreground.png
rsvg-convert -w 1024 -h 1024 android-background.svg -o $A/android-icon-background.png
rsvg-convert -w 1024 -h 1024 android-monochrome.svg -o $A/android-icon-monochrome.png
rsvg-convert -w 1024 -h 1024 splash.svg -o $A/splash-icon.png
rsvg-convert -w 48 -h 48 icon.svg -o $A/favicon.png
