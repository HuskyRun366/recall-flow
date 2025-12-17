const notSupported = (fnName) => {
  throw new Error(`"fs" is not available in the browser (called fs.${fnName}()).`);
};

export const readFileSync = () => notSupported('readFileSync');
export const writeFileSync = () => notSupported('writeFileSync');
export const existsSync = () => false;

export const promises = {
  readFile: async () => notSupported('promises.readFile'),
  writeFile: async () => notSupported('promises.writeFile')
};

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  promises
};
