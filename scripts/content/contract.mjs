export const CONTENT_BUILD_FORMAT_VERSION = 2;
export const SUPPORTED_SCHEMA_VERSIONS = new Set(['1.0.0']);
export const COMPILED_CONTENT_FILES = Object.freeze({
  graph: 'atlas.json',
  schema: 'schema.json',
  views: 'views.json',
  provenance: 'provenance.json',
  removedDomains: 'removed-domains.json'
});
