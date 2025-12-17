const stripTrailingSlashes = (p) => p.replace(/\/+$/, '');
const stripLeadingSlashes = (p) => p.replace(/^\/+/, '');

export const sep = '/';
export const delimiter = ':';

export const normalize = (p) => {
  if (!p) return '.';
  const isAbs = p.startsWith('/');
  const parts = p.split('/').filter(Boolean);
  const out = [];

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!isAbs) out.push('..');
      continue;
    }
    out.push(part);
  }

  const joined = out.join('/');
  return isAbs ? `/${joined}` : joined || (isAbs ? '/' : '.');
};

export const join = (...parts) => normalize(parts.filter(Boolean).join('/'));

export const dirname = (p) => {
  if (!p) return '.';
  const normalized = normalize(p);
  if (normalized === '/') return '/';
  const withoutTrailing = stripTrailingSlashes(normalized);
  const idx = withoutTrailing.lastIndexOf('/');
  if (idx === -1) return '.';
  if (idx === 0) return '/';
  return withoutTrailing.slice(0, idx);
};

export const basename = (p, ext = '') => {
  if (!p) return '';
  const normalized = stripTrailingSlashes(normalize(p));
  const idx = normalized.lastIndexOf('/');
  const name = idx === -1 ? normalized : normalized.slice(idx + 1);
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
};

export const extname = (p) => {
  const name = basename(p);
  const idx = name.lastIndexOf('.');
  return idx <= 0 ? '' : name.slice(idx);
};

export const resolve = (...parts) => {
  let path = '';
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('/')) {
      path = part;
    } else {
      path = path ? `${stripTrailingSlashes(path)}/${stripLeadingSlashes(part)}` : part;
    }
  }
  return normalize(path);
};

export default {
  sep,
  delimiter,
  normalize,
  join,
  dirname,
  basename,
  extname,
  resolve
};
