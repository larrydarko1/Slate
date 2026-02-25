#!/bin/bash

# Icon generation script for Slate app
# Generates icons for Electron app and .slate file type

SOURCE_ICON="public/icon-512x512.png"
FILE_ICON="public/slate-file-icon-512x512.png"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "❌ Source icon not found at $SOURCE_ICON"
    exit 1
fi

if [ ! -f "$FILE_ICON" ]; then
    echo "❌ File icon not found at $FILE_ICON"
    exit 1
fi

echo "🎨 Starting icon generation..."

# ============================================
# Electron Icons (macOS .icns)
# ============================================
echo "🖥️  Generating Electron icons..."

# Create iconset directory
mkdir -p build/icon.iconset

# Generate all required macOS icon sizes
sips -z 16 16 "$SOURCE_ICON" --out build/icon.iconset/icon_16x16.png > /dev/null
sips -z 32 32 "$SOURCE_ICON" --out build/icon.iconset/icon_16x16@2x.png > /dev/null
sips -z 32 32 "$SOURCE_ICON" --out build/icon.iconset/icon_32x32.png > /dev/null
sips -z 64 64 "$SOURCE_ICON" --out build/icon.iconset/icon_32x32@2x.png > /dev/null
sips -z 128 128 "$SOURCE_ICON" --out build/icon.iconset/icon_128x128.png > /dev/null
sips -z 256 256 "$SOURCE_ICON" --out build/icon.iconset/icon_128x128@2x.png > /dev/null
sips -z 256 256 "$SOURCE_ICON" --out build/icon.iconset/icon_256x256.png > /dev/null
sips -z 512 512 "$SOURCE_ICON" --out build/icon.iconset/icon_256x256@2x.png > /dev/null
sips -z 512 512 "$SOURCE_ICON" --out build/icon.iconset/icon_512x512.png > /dev/null
sips -z 1024 1024 "$SOURCE_ICON" --out build/icon.iconset/icon_512x512@2x.png > /dev/null

# Convert iconset to .icns file
iconutil -c icns build/icon.iconset -o build/icon.icns

echo "✓ Electron macOS icons generated (icon.icns)"

# ============================================
# .slate File Type Icons
# ============================================
echo "📄 Generating .slate file icons..."

# macOS .icns file icon
mkdir -p build/slate-file.iconset

sips -z 16 16 "$FILE_ICON" --out build/slate-file.iconset/icon_16x16.png > /dev/null
sips -z 32 32 "$FILE_ICON" --out build/slate-file.iconset/icon_16x16@2x.png > /dev/null
sips -z 32 32 "$FILE_ICON" --out build/slate-file.iconset/icon_32x32.png > /dev/null
sips -z 64 64 "$FILE_ICON" --out build/slate-file.iconset/icon_32x32@2x.png > /dev/null
sips -z 128 128 "$FILE_ICON" --out build/slate-file.iconset/icon_128x128.png > /dev/null
sips -z 256 256 "$FILE_ICON" --out build/slate-file.iconset/icon_128x128@2x.png > /dev/null
sips -z 256 256 "$FILE_ICON" --out build/slate-file.iconset/icon_256x256.png > /dev/null
sips -z 512 512 "$FILE_ICON" --out build/slate-file.iconset/icon_256x256@2x.png > /dev/null
sips -z 512 512 "$FILE_ICON" --out build/slate-file.iconset/icon_512x512.png > /dev/null
sips -z 1024 1024 "$FILE_ICON" --out build/slate-file.iconset/icon_512x512@2x.png > /dev/null

iconutil -c icns build/slate-file.iconset -o build/slate.icns
echo "  ✓ slate.icns (macOS)"

# Windows .ico file icon
# Using ImageMagick if available, otherwise use sips and fallback
if command -v convert &> /dev/null; then
    convert "$FILE_ICON" -define icon:auto-resize=256,128,96,64,48,32,16 build/slate.ico
    echo "  ✓ slate.ico (Windows)"
else
    echo "  ⚠ Windows .ico generation skipped (ImageMagick not found)"
    echo "    Install with: brew install imagemagick"
fi

# Linux .png file icon (256x256)
sips -z 256 256 "$FILE_ICON" --out build/slate.png > /dev/null
echo "  ✓ slate.png (Linux)"

echo ""
echo "✅ All icons generated successfully!"
echo ""
echo "Generated icons for:"
echo "  • Electron app (macOS) - icon.icns"
echo "  • .slate file type:"
echo "    - macOS: slate.icns"
echo "    - Windows: slate.ico"
echo "    - Linux: slate.png"
