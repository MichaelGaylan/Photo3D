// Release: bump VERSION and BUILD, add a WHATS_NEW line, and bump CACHE in sw.js.
export const APP_NAME = 'Photo3D';
export const VERSION = '0.1.0';
export const BUILD = '2026.11.27-1';

export const WHATS_NEW = [
  ['0.1.0', 'First version: photo in, AI depth on your device, relief sliders, 16-bit PNG and STL export.'],
];

// Web3Forms access key for "Report a problem" (public by design; routes to the app's report inbox).
// Leave empty until it is set up: the app then only offers "Copy report text".
export const W3F_KEY = '';
export const REPORT_PREFIX = 'Photo3D —';

// On-device depth model (Apache 2.0). See docs in README.
export const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
