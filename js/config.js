// Release: bump VERSION and BUILD, add a WHATS_NEW line, and bump CACHE in sw.js.
export const APP_NAME = 'Photo3D';
export const VERSION = '0.2.0';
export const BUILD = '2026.11.28-5';

export const WHATS_NEW = [
  ['0.2.0', 'Clean up and Crop for your photo, Extra detail for AI depth, a 3D view you can turn, machine profiles with a test card, screen themes, liquid glass buttons, controls you can dock left, right or bottom, and an About section in the menu.'],
  ['0.1.4', 'Report a problem now sends straight from the app (menu ☰).'],
  ['0.1.3', 'AI depth now runs in its own space and hands all of its memory back when done, so iPhone has room for the sliders. The update notice now stays until you tap Update now or Later, and the menu keeps an Install the update button.'],
  ['0.1.2', 'iPhone: moving the sliders no longer sends you back to the start. If the page ever reloads, your photo and relief come back.'],
  ['0.1.1', 'iPhone: AI depth uses a lighter mode so the page no longer closes; if it ever does, your photo comes back and Quick is offered.'],
  ['0.1.0', 'First version: photo in, AI depth on your device, relief sliders, 16-bit PNG and STL export.'],
];

// Web3Forms access key for "Report a problem" (public by design; routes to the app's report inbox).
// Leave empty until it is set up: the app then only offers "Copy report text".
export const W3F_KEY = '19e35d7e-216c-43ee-b93e-fab02f7eaa91';
export const REPORT_SUBJECT = 'Photo3D'; // every report email has exactly this subject

// On-device depth model (Apache 2.0). See docs in README.
export const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
