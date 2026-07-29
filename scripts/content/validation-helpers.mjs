export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requireObject(errors, value, path) {
  if (!isObject(value)) errors.push(`${path} must be an object.`);
}

export function requireString(errors, value, path) {
  if (typeof value !== 'string' || value.length === 0) errors.push(`${path} must be a non-empty string.`);
}

export function requireBoolean(errors, value, path) {
  if (typeof value !== 'boolean') errors.push(`${path} must be a boolean.`);
}

export function requireNumber(errors, value, path) {
  if (!Number.isFinite(value)) errors.push(`${path} must be a number.`);
}

export function requireStringArray(errors, value, path, { nonEmpty = false, unique = false } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${path} must be an array of strings.`);
    return false;
  }
  if (nonEmpty && value.length === 0) errors.push(`${path} must not be empty.`);
  if (unique && new Set(value).size !== value.length) errors.push(`${path} must not contain duplicates.`);
  return true;
}

export function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

export function entriesOrEmpty(value) {
  return isObject(value) ? Object.entries(value) : [];
}
