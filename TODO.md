# Photo3D — Build list

Project code: **P3D**

## 🔴 Needs you
- [ ] P3D-002 · Web3Forms key for Report a problem · Infra · S — create a key at web3forms.com for this app's report inbox and send it to Claude (it goes in `js/config.js` as `W3F_KEY`)
- [ ] P3D-003 · Try AI depth on your iPhone and an Android phone · Safety · S — the AI path could not be run in Claude's test browser (no access to Hugging Face there); Quick mode and all exports were tested

## 🔵 Build list
- [ ] P3D-004 · Server "High detail" mode on Render (Depth Anything 3 Mono-Large or MoGe-2) · Infra · L · added 2026-11-27
- [ ] P3D-005 · Real 3D preview you can rotate (three.js) · UI · M · added 2026-11-27
- [ ] P3D-006 · Crop and background cut-out before depth · UI · M · added 2026-11-27
- [ ] P3D-007 · Machine and material profiles, test card (design flow C) · Data · L · added 2026-11-27
- [ ] P3D-008 · Tiled depth for sharper detail on big prints · Data · M · added 2026-11-27
- [ ] P3D-009 · Cleanup button: clean up the photo before processing (denoise, even out light, remove blemishes and dust) · UI · M · added 2026-11-28
- [ ] P3D-010 · Dockable controls: move the control panel to the left, right or bottom of the work area · UI · M · added 2026-11-28

## 🟡 Hold

## 🟣 Done
### 0.1.3 · build 2026.11.28-3
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
