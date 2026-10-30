![GitHub Repo Banner](https://ghrb.waren.build/render/banner?stats=false&header=Raytolfas+Designer&bg=F3F4F6&color=1F2937&headerfont=DynaPuff&support=false)

![License](https://badgen.net/github/license/raytolfas/designer)
![Stars](https://badgen.net/github/stars/raytolfas/designer)
![License](https://badgen.net/github/release/raytolfas/designer/latest)

---

A fast, offline-first desktop graphic design tool built on Electron, React, and Fabric.js.

## Highlights

- **On-Device AI Background Removal**: Local foreground extraction powered by ONNX Runtime WASM and U2-NetP, operating entirely offline without external API dependencies.
- **Localization**: Built-in support for English, Ukrainian (Українська), and Russian (Русский).
- **Project Tabs**: Multi-document workspace with tab switching, unsaved change indicators, and state isolation.
- **Templates**: Quick presets for YouTube Thumbnails (1280×720), Instagram Stories & Posts, Telegram Banners, Marketplace Cards, Full HD, and Print A4.
- **Canvas Alignment**: Precise layer alignment relative to canvas boundaries (horizontal and vertical axes).
- **Multi-Format Export**: Export assets to PNG, JPEG, SVG, and PDF.
- **Editing Tools**: Selection, Pencil with custom patterns, Fill bucket, Vector shapes, Text layers, and Image import.
- **Styles & Filters**: Image adjustments (brightness, contrast, saturation, blur, noise, tint), blend modes, and style presets (`.rdtxt`).
- **Cross-Platform**: Automated multi-platform builds for Windows, macOS (Universal x64/arm64), and Linux via GitHub Actions.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `V` | Selection Tool |
| `P` | Brush / Pencil |
| `B` | Fill Bucket |
| `Del` / `Backspace` | Delete Active Layer |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save Project |
| `Ctrl+Shift+S` | Save As... |
| `Ctrl+N` | New Project |
| `Ctrl+W` | Close Tab |
| `Ctrl+1` | Zoom 100% |
| `Ctrl+0` | Fit to Screen |
| `Ctrl++` / `Ctrl+-` | Zoom In / Zoom Out |
| `Space` (Hold) | Pan Canvas |
| `Esc` | Close Modal / Deselect |

## Development & Build

```bash
npm install

```

### Dev Mode

```bash
npm run dev

```

### Production Build

```bash
# Desktop multi-platform builds
npm run build:win
npm run build:mac
npm run build:linux

# Web build (Static SPA for GitHub Pages / Web hosting)
npm run build:web

```

## Deployment & CI/CD

* **Desktop Release**: Manual execution of `.github/workflows/build-and-release.yml` via GitHub Actions for Windows, macOS, and Linux binaries.
* **Web Deployment**: Manual execution of `.github/workflows/deploy-web.yml` via GitHub Actions to compile and deploy the static SPA to the `web` branch.

## Architecture & Technology Stack

* **Framework**: Electron, React 19, Vite 7, Fabric.js 7
* **AI Inference**: ONNX Runtime Web (`onnxruntime-web`) utilizing U2-NetP model via IPC worker threads
* **Storage**: Native file system integration with `.rdesign` JSON schemas and local configuration persistence
* **License**: Permissive Open Source (MIT / Apache-2.0 compliant)
