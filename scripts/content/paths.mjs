export const repositoryRoot = new URL('../../', import.meta.url);
export const contentSourceDirectory = new URL('../../content/', import.meta.url);
export const contentManifestUrl = new URL('manifest.json', contentSourceDirectory);
export const compiledContentDirectory = new URL('../../.build/content/', import.meta.url);
