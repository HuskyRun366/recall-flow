// Polyfills for Node.js modules used by sql.js in browser environment
// These are empty implementations since sql.js will use the WASM version

(window as any).global = window;
