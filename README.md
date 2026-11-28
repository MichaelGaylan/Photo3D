# Photo3D

Turn a photo into a 3D relief for laser engravers and CNC machines. It is an installable web app (PWA) for iPhone, iPad, Android, Mac and Windows: open the site, then **Add to Home Screen** (iPhone/iPad, Safari share menu) or **Install app** (Chrome/Edge on Android and computers).

No build step: plain HTML, CSS and JavaScript modules, served as static files (GitHub Pages works as-is).

## How it works
1. **Photo**: take one or pick one. It is scaled to 2048 px (1600 px on iPhone/iPad) and never leaves the device. **Clean up** (dust and specks, uneven light, flat levels) and **Crop** each have one step of Undo.
2. **Depth**: *AI depth* runs [Depth Anything V2 Small](https://github.com/DepthAnything/Depth-Anything-V2) (Apache-2.0) in the browser with [transformers.js](https://github.com/huggingface/transformers.js), on the GPU (WebGPU) when the device has it, else on the CPU (WebAssembly). The model (~27 MB CPU / ~50 MB GPU) downloads from Hugging Face the first time and is cached. *Extra detail* also runs the model on 2 × 2 overlapping parts of the photo and merges them (each part is matched to the whole-photo depth, so they can't drift apart). *Quick* needs no download and makes a softer, brightness-based relief.
3. **Adjust**: detail (bas-relief compression plus depth sharpening), photo texture, smoothing, contrast, background removal, invert. Previews as a lit 3D look, a 3D model you can turn ([three.js](https://threejs.org), loaded from jsDelivr on first use), the raw heightmap, or the photo.
4. **Export**: pick a machine profile (diode, CO2, fiber, CNC, lithophane, relief print) for starting values, and download a calibration test card. 16-bit grayscale PNG (with print size set), 8-bit PNG for laser software such as LightBurn, or a watertight binary STL for CAM software and 3D printers.

Why these choices: see the research doc "Choosing an AI Depth Model for the Photo-to-3D Engraving App".

## Layout
- `index.html`, `css/app.css`: the app and its look
- `js/config.js`: version, build, What's new, Report a problem key, depth model id
- `js/depth.js`: AI and Quick depth
- `js/relief.js`: depth map → heightmap (normalize, smoothing, detail, texture, background, contrast) and the previews
- `js/export.js`: 16-bit PNG encoder, 8-bit PNG, STL writer
- `js/cleanup.js`: photo cleanup; `js/view3d.js`: rotatable 3D view; `js/profiles.js`: machine profiles and test card; `js/theme.js`: screen themes
- `js/app.js`: the screens, crop, docking, menu, About, Report a problem, updates
- transformers.js 4.3.2 and its WebAssembly runtime load from jsDelivr on first AI use (pinned in `js/depth.js`)
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and install
- `TODO.md`: the build lists

## Releasing
Bump `VERSION` and `BUILD` in `js/config.js`, add a line to `WHATS_NEW`, and bump `CACHE` in `sw.js` (add any new file to its list). Installed apps then show "An update is ready".

## Run locally
`python3 -m http.server` in this folder, then open http://localhost:8000.
