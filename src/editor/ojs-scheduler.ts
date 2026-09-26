// Observable captures requestAnimationFrame when imported. Its hidden runtime
// frame has no paint cycle, so schedule computations independently of painting.
window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 16);
window.cancelAnimationFrame = handle => window.clearTimeout(handle);
