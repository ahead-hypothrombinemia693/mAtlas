export function requestCacheRecovery(): boolean {
  return window.__atlasRecovery?.reload() ?? false;
}

function failDataLoad(message: string): never {
  requestCacheRecovery();
  throw new Error(message);
}

export async function fetchAtlasJson<T>(url: string, label: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'force-cache' });
  } catch {
    return failDataLoad(`Unable to load ${label}.`);
  }
  if (!response.ok) return failDataLoad(`Unable to load ${label} (${response.status}).`);
  try {
    return await response.json() as T;
  } catch {
    return failDataLoad(`The ${label} response was not valid JSON.`);
  }
}
