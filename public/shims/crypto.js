const getWebCrypto = () => {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto API is not available in this environment.');
  }
  return c;
};

export const webcrypto = globalThis.crypto;

export const randomBytes = (size) => {
  const out = new Uint8Array(size);
  getWebCrypto().getRandomValues(out);
  return out;
};

export const createHash = () => {
  throw new Error('crypto.createHash() is not supported in the browser shim.');
};

export default {
  webcrypto,
  randomBytes,
  createHash
};
