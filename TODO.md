# Photo3D — Build list

Project code: **P3D**

## 🔴 Needs you

## 🔵 Build list

## 🟡 Hold
- [ ] P3D-004 · Server "High detail" mode on Render (Depth Anything 3 Mono-Large or MoGe-2) · Infra · L · added 2026-11-27 — on hold 2026-11-28 (Gaylan). Needs a paid Render instance (a GPU-less starter is too slow for these models) and Gaylan's go-ahead on cost; also decides whether photos may leave the phone for this mode
- [ ] P3D-018 · AI background cut-out (part of P3D-006) · UI · M · added 2026-11-28 — on hold 2026-11-28 (Gaylan). Needs a model choice: RMBG-2.0 is non-commercial only, BiRefNet (MIT) is sharp but a large download for phones, and the small free ones (MODNet for people, U2-Net-p for objects, Apache 2.0) are rougher. The depth-based Remove background slider and Crop cover most cases meanwhile

## 🟣 Done
### 0.2.0 · build 2026.11.28-5
- [x] P3D-016 · About section in the menu: version and build, privacy, model and library credits, © 2026 VYBEON · UI · S
- [x] P3D-017 · Liquid glass buttons and a sliding glass bubble on the view and dock switches, after VYBEON Make's tab bar · UI · M
- [x] P3D-015 · Screen themes: VYBEON, Blush, Mocha, Coastal, Linen, Midnight, Rosewood, Forest (VYBEON swatch colors, same set as VYBEON Make) · UI · M
- [x] P3D-010 · Dockable controls: left, right or bottom of the picture (header buttons and menu); phones held upright keep the picture on top · UI · M
- [x] P3D-009 · Clean up button: dust and specks, even light, levels, with a strength slider and Undo · UI · M
- [x] P3D-006 · Crop before depth, with Undo (AI background cut-out split out as P3D-018) · UI · M
- [x] P3D-005 · Rotate 3D view (three.js, loaded on first use, kept offline afterwards; smaller mesh on iPhone, freed when you leave the view) · UI · M
- [x] P3D-007 · Machine and material profiles (diode, CO2, fiber, CNC, fine CNC, lithophane, relief print) and a calibration test card · Data · L
- [x] P3D-008 · Extra detail: AI depth on the whole photo plus 2 × 2 overlapping parts, merged · Data · M

### 0.1.4 · build 2026.11.28-4
- [x] P3D-002 · Report a problem sends via Web3Forms (key from Gaylan) · Infra · S

### 0.1.3 · build 2026.11.28-3
- [x] P3D-003 · Try AI depth on iPhone · Safety · S — confirmed working by Gaylan 2026-11-28
- [x] P3D-014 · Update notice stays until Update now or Later is tapped; Install the update in the menu; checks for updates when the app is reopened · UI · S
- [x] P3D-013 · iPhone still reloaded after AI depth: the model now runs in a Web Worker that is closed after each run, so all its memory is freed; photo kept at 1600 px on iOS · Bug · M

### 0.1.2 · build 2026.11.28-2
- [x] P3D-012 · iPhone: moving the sliders after AI depth sent the app back to the start (memory). Model unloaded after use on iOS, smaller cached preview, throttled redraws, session restored after a reload · Bug · M

### 0.1.1 · build 2026.11.28-1
- [x] P3D-011 · iPhone: AI depth sent the app back to the start screen (Safari memory limit). Lighter iOS mode, photo restored after a crash, Quick fallback · Bug · M

### 0.1.0 · build 2026.11.27-1
- [x] P3D-001 · Turn on GitHub Pages · Infra · S — live at https://michaelgaylan.github.io/Photo3D/
- [x] P3D-000 · First version: photo in, AI depth on device (WebGPU/WASM), Quick depth, relief sliders, 3D-look preview, 16-bit PNG, 8-bit PNG and STL export, installable PWA with offline support and updates, Report a problem (copy text until the key is set)

## ⚪ Dropped
