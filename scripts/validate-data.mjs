import { readFile } from 'node:fs/promises';
import { explicitMathErrors, findUnmarkedMath } from './math-markup.mjs';

const dataUrl = new URL('../src/data/structures.json', import.meta.url);
const viewsUrl = new URL('../src/data/views.json', import.meta.url);
const graph = JSON.parse(await readFile(dataUrl, 'utf8'));
const viewsData = JSON.parse(await readFile(viewsUrl, 'utf8'));
const errors = [];

const validateNoAsciiControls = (value, path = 'graph') => {
  if (typeof value === 'string') {
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
      errors.push(`${path} contains an ASCII control character; this usually indicates a corrupted escape sequence.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoAsciiControls(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) validateNoAsciiControls(item, `${path}.${key}`);
  }
};
validateNoAsciiControls(graph);
validateNoAsciiControls(viewsData, 'views');

const requireObject = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${path} must be an object.`);
};
const requireString = (value, path) => {
  if (typeof value !== 'string' || value.length === 0) errors.push(`${path} must be a non-empty string.`);
};
const requireStringArray = (value, path, { nonEmpty = false, unique = false } = {}) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${path} must be an array of strings.`);
    return;
  }
  if (nonEmpty && value.length === 0) errors.push(`${path} must not be empty.`);
  if (unique && new Set(value).size !== value.length) errors.push(`${path} must not contain duplicates.`);
};

const validateMathText = (value, path) => {
  if (typeof value !== 'string') return;
  for (const error of explicitMathErrors(value)) errors.push(`${path} ${error}.`);
  for (const finding of findUnmarkedMath(value)) {
    errors.push(`${path} contains unmarked math candidate ${JSON.stringify(finding.source)}; use explicit $...$ LaTeX.`);
  }
};

requireObject(graph.meta, 'meta');
requireObject(graph.fields, 'fields');
requireObject(graph.domains, 'domains');
requireObject(graph.edgeTypes, 'edgeTypes');
requireObject(graph.sources, 'sources');
if (!Array.isArray(graph.nodes)) errors.push('nodes must be an array.');
if (!Array.isArray(graph.edges)) errors.push('edges must be an array.');


const fieldIds = new Set(Object.keys(graph.fields ?? {}));
const fieldPaths = new Map();
for (const [id, field] of Object.entries(graph.fields ?? {})) {
  requireString(field.label, `fields.${id}.label`);
  requireString(field.color, `fields.${id}.color`);
  requireString(field.path, `fields.${id}.path`);
  requireString(field.description, `fields.${id}.description`);
  if (fieldPaths.has(field.path)) errors.push(`Fields ${fieldPaths.get(field.path)} and ${id} use the same path ${field.path}.`);
  else if (typeof field.path === 'string') fieldPaths.set(field.path, id);
  validateMathText(field.description, `fields.${id}.description`);
  if (!/^#[0-9a-f]{6}$/i.test(field.color ?? '')) errors.push(`fields.${id}.color must be a six-digit hex color.`);
  if (!Number.isFinite(field.order)) errors.push(`fields.${id}.order must be a number.`);
}
requireStringArray(graph.meta?.fieldOrder, 'meta.fieldOrder', { nonEmpty: true, unique: true });
for (const id of graph.meta?.fieldOrder ?? []) if (!fieldIds.has(id)) errors.push(`meta.fieldOrder references unknown field: ${id}`);
for (const id of fieldIds) if (!(graph.meta?.fieldOrder ?? []).includes(id)) errors.push(`Field ${id} is missing from meta.fieldOrder.`);
if (graph.meta?.defaultField && !fieldIds.has(graph.meta.defaultField)) errors.push(`meta.defaultField references unknown field: ${graph.meta.defaultField}`);

const domainIds = new Set(Object.keys(graph.domains ?? {}));
for (const [id, domain] of Object.entries(graph.domains ?? {})) {
  requireString(domain.label, `domains.${id}.label`);
  requireString(domain.color, `domains.${id}.color`);
  if (!/^#[0-9a-f]{6}$/i.test(domain.color ?? '')) errors.push(`domains.${id}.color must be a six-digit hex color.`);
  if (!Number.isFinite(domain.order)) errors.push(`domains.${id}.order must be a number.`);
  requireString(domain.field, `domains.${id}.field`);
  if (!fieldIds.has(domain.field)) errors.push(`domains.${id}.field references unknown field: ${domain.field}`);
}

requireStringArray(graph.meta?.domainOrder, 'meta.domainOrder', { nonEmpty: true, unique: true });
for (const id of graph.meta?.domainOrder ?? []) {
  if (!domainIds.has(id)) errors.push(`meta.domainOrder references unknown domain: ${id}`);
}
for (const id of domainIds) {
  if (!(graph.meta?.domainOrder ?? []).includes(id)) errors.push(`Domain ${id} is missing from meta.domainOrder.`);
}

const nodeIds = new Set();
for (const [index, node] of (graph.nodes ?? []).entries()) {
  const path = `nodes[${index}]`;
  requireString(node.id, `${path}.id`);
  requireString(node.label, `${path}.label`);
  requireString(node.primaryDomain, `${path}.primaryDomain`);
  if (node.primaryField !== undefined) requireString(node.primaryField, `${path}.primaryField`);
  if (node.fields !== undefined) requireStringArray(node.fields, `${path}.fields`, { nonEmpty: true, unique: true });
  if (node.conceptType !== undefined) requireString(node.conceptType, `${path}.conceptType`);
  if (node.scale !== undefined) requireString(node.scale, `${path}.scale`);
  if (node.status !== undefined) requireString(node.status, `${path}.status`);
  if (node.root !== undefined && typeof node.root !== 'boolean') errors.push(`${path}.root must be a boolean.`);
  requireStringArray(node.domains, `${path}.domains`, { nonEmpty: true, unique: true });
  requireString(node.kind, `${path}.kind`);
  requireString(node.summary, `${path}.summary`);
  validateMathText(node.summary, `${path}.summary`);
  for (const field of ['carriers', 'data', 'axioms', 'induces']) {
    for (const [itemIndex, item] of (node[field] ?? []).entries()) validateMathText(item, `${path}.${field}[${itemIndex}]`);
  }
  if (typeof node.notes === 'string') validateMathText(node.notes, `${path}.notes`);
  for (const [sectionIndex, section] of (node.sections ?? []).entries()) {
    const sectionPath = `${path}.sections[${sectionIndex}]`;
    requireObject(section, sectionPath);
    requireString(section.title, `${sectionPath}.title`);
    if (section.body !== undefined) { requireString(section.body, `${sectionPath}.body`); validateMathText(section.body, `${sectionPath}.body`); }
    if (section.items !== undefined) { requireStringArray(section.items, `${sectionPath}.items`); section.items.forEach((item, itemIndex) => validateMathText(item, `${sectionPath}.items[${itemIndex}]`)); }
    if (section.body === undefined && section.items === undefined) errors.push(`${sectionPath} must include body or items.`);
  }
  requireStringArray(node.citations, `${path}.citations`);
  if (!Number.isFinite(node.level)) errors.push(`${path}.level must be a number.`);
  if (nodeIds.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
  nodeIds.add(node.id);

  if (!domainIds.has(node.primaryDomain)) errors.push(`${path}.primaryDomain references unknown domain: ${node.primaryDomain}`);
  if (!node.domains?.includes(node.primaryDomain)) errors.push(`${path}.domains must include primaryDomain ${node.primaryDomain}.`);
  for (const domainId of node.domains ?? []) {
    if (!domainIds.has(domainId)) errors.push(`${path}.domains references unknown domain: ${domainId}`);
  }
  const inferredFields = [...new Set((node.domains ?? []).map((domainId) => graph.domains?.[domainId]?.field).filter(Boolean))];
  const declaredFields = node.fields ?? inferredFields;
  for (const fieldId of declaredFields) if (!fieldIds.has(fieldId)) errors.push(`${path}.fields references unknown field: ${fieldId}`);
  const primaryField = node.primaryField ?? graph.domains?.[node.primaryDomain]?.field;
  if (!fieldIds.has(primaryField)) errors.push(`${path}.primaryField could not be resolved to a known field.`);
  if (!declaredFields.includes(primaryField)) errors.push(`${path}.fields must include primaryField ${primaryField}.`);
  if (node.kind === 'structure' && primaryField !== 'mathematics' && !node.conceptType) errors.push(`${path}.conceptType is required outside the legacy mathematics field.`);
  for (const fieldId of inferredFields) if (!declaredFields.includes(fieldId)) errors.push(`${path}.fields omits field ${fieldId} implied by its domains.`);

  if (!['structure', 'junction'].includes(node.kind)) errors.push(`${path}.kind must be structure or junction.`);
  if (node.kind === 'junction') {
    requireObject(node.combination, `${path}.combination`);
    requireStringArray(node.combination?.inputs, `${path}.combination.inputs`, { nonEmpty: true, unique: true });
    requireString(node.combination?.compatibility, `${path}.combination.compatibility`);
    validateMathText(node.combination?.compatibility, `${path}.combination.compatibility`);
    requireString(node.combination?.output, `${path}.combination.output`);
  } else if (node.combination !== undefined) {
    errors.push(`${path}.combination is only valid for junction nodes.`);
  }
}

const edgeIds = new Set();
for (const [index, edge] of (graph.edges ?? []).entries()) {
  const path = `edges[${index}]`;
  for (const field of ['id', 'source', 'target', 'type', 'label', 'detail']) requireString(edge[field], `${path}.${field}`);
  validateMathText(edge.detail, `${path}.detail`);
  requireStringArray(edge.citations, `${path}.citations`);
  if (edgeIds.has(edge.id)) errors.push(`Duplicate edge id: ${edge.id}`);
  edgeIds.add(edge.id);
  if (!nodeIds.has(edge.source)) errors.push(`${path}.source references unknown node: ${edge.source}`);
  if (!nodeIds.has(edge.target)) errors.push(`${path}.target references unknown node: ${edge.target}`);
  if (!graph.edgeTypes?.[edge.type]) errors.push(`${path}.type references unknown edge type: ${edge.type}`);
  if (edge.overview !== undefined && typeof edge.overview !== 'boolean') errors.push(`${path}.overview must be a boolean.`);
}

for (const [index, node] of (graph.nodes ?? []).entries()) {
  for (const input of node.combination?.inputs ?? []) {
    if (!nodeIds.has(input)) errors.push(`nodes[${index}].combination.inputs references unknown node: ${input}`);
  }
  if (node.combination && !nodeIds.has(node.combination.output)) {
    errors.push(`nodes[${index}].combination.output references unknown node: ${node.combination.output}`);
  }
}

const citationIds = new Set([
  ...(graph.nodes ?? []).flatMap((node) => node.citations ?? []),
  ...(graph.edges ?? []).flatMap((edge) => edge.citations ?? [])
]);
for (const citationId of citationIds) {
  if (!graph.sources?.[citationId]) errors.push(`Unknown citation id: ${citationId}`);
}
for (const [id, source] of Object.entries(graph.sources ?? {})) {
  requireString(source.label, `sources.${id}.label`);
  requireString(source.title, `sources.${id}.title`);
  requireString(source.url, `sources.${id}.url`);
  requireString(source.kind, `sources.${id}.kind`);
  if (typeof source.label === 'string' && !source.label.includes(' — ')) {
    errors.push(`sources.${id}.label must use the normalized “Publisher — title” form.`);
  }
}


// Cross-record integrity and graph-shape checks.
const activeEdgeTypeIds = new Set();
for (const [id, type] of Object.entries(graph.edgeTypes ?? {})) {
  requireString(type.label, `edgeTypes.${id}.label`);
  requireString(type.short, `edgeTypes.${id}.short`);
  requireString(type.description, `edgeTypes.${id}.description`);
  validateMathText(type.description, `edgeTypes.${id}.description`);
  requireString(type.color, `edgeTypes.${id}.color`);
  requireObject(type.endpointLabels, `edgeTypes.${id}.endpointLabels`);
  requireString(type.endpointLabels?.source, `edgeTypes.${id}.endpointLabels.source`);
  requireString(type.endpointLabels?.target, `edgeTypes.${id}.endpointLabels.target`);
  if (!/^#[0-9a-f]{6}$/i.test(type.color ?? '')) errors.push(`edgeTypes.${id}.color must be a six-digit hex color.`);
  if (type.lineStyle !== undefined && !['solid', 'dashed', 'dotted'].includes(type.lineStyle)) errors.push(`edgeTypes.${id}.lineStyle is invalid.`);
  if (type.activeInDataset !== false) activeEdgeTypeIds.add(id);
}
requireStringArray(graph.meta?.edgeTypeOrder, 'meta.edgeTypeOrder', { nonEmpty: true, unique: true });
for (const id of graph.meta?.edgeTypeOrder ?? []) {
  if (!graph.edgeTypes?.[id]) errors.push(`meta.edgeTypeOrder references unknown edge type: ${id}`);
}
for (const id of Object.keys(graph.edgeTypes ?? {})) {
  if (!(graph.meta?.edgeTypeOrder ?? []).includes(id)) errors.push(`Edge type ${id} is missing from meta.edgeTypeOrder.`);
}
const usedEdgeTypeIds = new Set((graph.edges ?? []).map((edge) => edge.type));
for (const id of activeEdgeTypeIds) {
  if (!usedEdgeTypeIds.has(id)) errors.push(`Active edge type ${id} is not used by any edge.`);
}

const relationSignatures = new Map();
const incomingByNode = new Map((graph.nodes ?? []).map((node) => [node.id, []]));
const outgoingByNode = new Map((graph.nodes ?? []).map((node) => [node.id, []]));
for (const edge of graph.edges ?? []) {
  if (edge.source === edge.target) errors.push(`Edge ${edge.id} is a self-loop.`);
  const signature = `${edge.source}|${edge.target}|${edge.type}`;
  if (relationSignatures.has(signature)) errors.push(`Edges ${relationSignatures.get(signature)} and ${edge.id} duplicate the same relation signature.`);
  else relationSignatures.set(signature, edge.id);
  incomingByNode.get(edge.target)?.push(edge);
  outgoingByNode.get(edge.source)?.push(edge);
  if (!edge.citations?.length) errors.push(`Edge ${edge.id} must have at least one citation.`);
}

for (const node of graph.nodes ?? []) {
  if (!node.citations?.length) errors.push(`Node ${node.id} must have at least one citation.`);
  const primaryField = node.primaryField ?? graph.domains?.[node.primaryDomain]?.field;
  if (primaryField === 'physics') {
    const citedSources = (node.citations ?? []).map((id) => graph.sources?.[id]).filter(Boolean);
    if (!citedSources.some((source) => source.url.includes('wikipedia.org'))) {
      errors.push(`Physics node ${node.id} must cite a Wikipedia overview for navigation.`);
    }
    if (!citedSources.some((source) => !source.url.includes('wikipedia.org') && !source.url.includes('ncatlab.org'))) {
      errors.push(`Physics node ${node.id} must cite at least one authoritative source beyond Wikipedia and nLab.`);
    }
  }
  // Concepts may be primitive, independent, or otherwise have no incoming relation.
  // Connectivity is validated for explicit junctions below, not imposed globally.
  if (node.kind === 'junction' && node.combination) {
    const incoming = incomingByNode.get(node.id) ?? [];
    const outgoing = outgoingByNode.get(node.id) ?? [];
    for (const input of node.combination.inputs) {
      if (!incoming.some((edge) => edge.source === input && edge.type === 'combine-compatible')) {
        errors.push(`Junction ${node.id} is missing a combine-compatible edge from input ${input}.`);
      }
    }
    const unexpectedInputs = incoming.filter((edge) => !node.combination.inputs.includes(edge.source));
    if (unexpectedInputs.length) errors.push(`Junction ${node.id} has unexpected incoming edge(s): ${unexpectedInputs.map((edge) => edge.id).join(', ')}.`);
    const outputEdges = outgoing.filter((edge) => edge.target === node.combination.output && edge.type === 'combine-compatible');
    if (outputEdges.length !== 1) errors.push(`Junction ${node.id} must have exactly one combine-compatible edge to ${node.combination.output}.`);
    const unexpectedOutputs = outgoing.filter((edge) => edge.target !== node.combination.output);
    if (unexpectedOutputs.length) errors.push(`Junction ${node.id} has unexpected outgoing edge(s): ${unexpectedOutputs.map((edge) => edge.id).join(', ')}.`);
  }
}

const sourceIdsByUrl = new Map();
for (const [id, source] of Object.entries(graph.sources ?? {})) {
  try {
    const parsed = new URL(source.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) errors.push(`sources.${id}.url must use http or https.`);
  } catch {
    errors.push(`sources.${id}.url is not a valid absolute URL.`);
  }
  if (sourceIdsByUrl.has(source.url)) errors.push(`Sources ${sourceIdsByUrl.get(source.url)} and ${id} duplicate the same URL.`);
  else sourceIdsByUrl.set(source.url, id);
  if (!citationIds.has(id)) errors.push(`Source ${id} is not cited by any node or edge.`);
}

const nodeById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
for (const edge of graph.edges ?? []) {
  if (!['add-data', 'impose-axiom', 'combine-compatible'].includes(edge.type)) continue;
  const sourceLevel = nodeById.get(edge.source)?.level;
  const targetLevel = nodeById.get(edge.target)?.level;
  if (Number.isFinite(sourceLevel) && Number.isFinite(targetLevel) && sourceLevel > targetLevel) {
    errors.push(`Structural edge ${edge.id} points upward from level ${sourceLevel} to ${targetLevel}.`);
  }
}

const downwardPhysicsTypes = new Set([
  'mathematical-limit',
  'controlled-approximation',
  'effective-theory',
  'approximation-method',
  'phenomenological-model',
  'model-realization',
  'theory-extension',
  'composition',
  'field-excitation',
  'binds-forms',
  'emergence'
]);
for (const edge of graph.edges ?? []) {
  if (!downwardPhysicsTypes.has(edge.type)) continue;
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) continue;
  const sourceField = source.primaryField ?? graph.domains?.[source.primaryDomain]?.field;
  const targetField = target.primaryField ?? graph.domains?.[target.primaryDomain]?.field;
  if (sourceField !== 'physics' || targetField !== 'physics') continue;
  if (Number.isFinite(source.level) && Number.isFinite(target.level) && source.level > target.level) {
    errors.push(`Physics ${edge.type} edge ${edge.id} points upward from level ${source.level} to ${target.level}.`);
  }
}


// Guided views are a separate, data-driven navigation layer over valid graph settings.
requireObject(viewsData, 'views');
if (viewsData.version !== 1) errors.push('views.version must be 1.');
if (!Array.isArray(viewsData.views) || viewsData.views.length === 0) errors.push('views.views must be a non-empty array.');
const viewIds = new Set();
const viewTitles = new Set();
let featuredViewCount = 0;
const allowedLayouts = new Set(['atlas', 'breadthfirst', 'cose-bilkent']);
const allowedCrossField = new Set(['contextual', 'all', 'hidden']);
for (const [index, view] of (viewsData.views ?? []).entries()) {
  const path = `views.views[${index}]`;
  requireObject(view, path);
  for (const field of ['id', 'title', 'summary', 'narrative']) requireString(view?.[field], `${path}.${field}`);
  if (typeof view?.id === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(view.id)) errors.push(`${path}.id must be a lowercase URL slug.`);
  if (viewIds.has(view?.id)) errors.push(`Duplicate view id: ${view.id}`);
  viewIds.add(view?.id);
  if (viewTitles.has(view?.title)) errors.push(`Duplicate view title: ${view.title}`);
  viewTitles.add(view?.title);
  requireStringArray(view?.tags, `${path}.tags`, { nonEmpty: true, unique: true });
  if (view?.featured !== undefined && typeof view.featured !== 'boolean') errors.push(`${path}.featured must be a boolean.`);
  if (view?.featured === true) featuredViewCount += 1;
  requireStringArray(view?.nodeSequence, `${path}.nodeSequence`, { nonEmpty: true, unique: true });
  for (const nodeId of view?.nodeSequence ?? []) if (!nodeIds.has(nodeId)) errors.push(`${path}.nodeSequence references unknown node: ${nodeId}`);
  if (view?.image !== undefined) {
    requireObject(view.image, `${path}.image`);
    requireString(view.image?.src, `${path}.image.src`);
    requireString(view.image?.alt, `${path}.image.alt`);
    try {
      const imageUrl = new URL(view.image?.src, 'https://atlas.madvay.com/');
      if (!['http:', 'https:'].includes(imageUrl.protocol)) errors.push(`${path}.image.src must resolve to an HTTP(S) URL.`);
    } catch {
      errors.push(`${path}.image.src is not a valid URL or root-relative path.`);
    }
  }
  requireObject(view?.settings, `${path}.settings`);
  const settings = view?.settings ?? {};
  requireStringArray(settings.fields, `${path}.settings.fields`, { nonEmpty: true, unique: true });
  requireStringArray(settings.domains, `${path}.settings.domains`, { nonEmpty: true, unique: true });
  requireStringArray(settings.edgeTypes, `${path}.settings.edgeTypes`, { nonEmpty: true, unique: true });
  for (const fieldId of settings.fields ?? []) if (!fieldIds.has(fieldId)) errors.push(`${path}.settings.fields references unknown field: ${fieldId}`);
  for (const domainId of settings.domains ?? []) {
    if (!domainIds.has(domainId)) errors.push(`${path}.settings.domains references unknown domain: ${domainId}`);
    const fieldId = graph.domains?.[domainId]?.field;
    if (fieldId && !(settings.fields ?? []).includes(fieldId)) errors.push(`${path}.settings.fields must include ${fieldId}, required by domain ${domainId}.`);
  }
  for (const edgeTypeId of settings.edgeTypes ?? []) {
    if (!activeEdgeTypeIds.has(edgeTypeId)) errors.push(`${path}.settings.edgeTypes references inactive or unknown edge type: ${edgeTypeId}`);
  }
  if (!allowedCrossField.has(settings.crossFieldVisibility)) errors.push(`${path}.settings.crossFieldVisibility is invalid.`);
  if (!allowedLayouts.has(settings.layout)) errors.push(`${path}.settings.layout is invalid.`);
  for (const key of ['edgeLabels', 'junctions', 'edgeZoomActivation']) {
    if (typeof settings[key] !== 'boolean') errors.push(`${path}.settings.${key} must be a boolean.`);
  }
  for (const nodeId of view?.nodeSequence ?? []) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    if (node.kind !== 'structure') errors.push(`${path}.nodeSequence must reference structure nodes; ${nodeId} is ${node.kind}.`);
    const nodeDomains = node.domains?.length ? node.domains : [node.primaryDomain];
    const nodeFields = node.fields?.length
      ? node.fields
      : [...new Set(nodeDomains.map((domainId) => graph.domains?.[domainId]?.field).filter(Boolean))];
    if (!nodeFields.some((fieldId) => (settings.fields ?? []).includes(fieldId))
      || !nodeDomains.some((domainId) => (settings.domains ?? []).includes(domainId))) {
      errors.push(`${path}.nodeSequence node ${nodeId} is outside the view's selected taxonomy.`);
    }
  }
}
if (featuredViewCount === 0) errors.push('At least one guided view must be featured.');

// The definitional/enrichment subgraph should remain acyclic. Theorem and representation
// edges are excluded because they may deliberately point toward weaker structures.
const structuralTypes = new Set(['add-data', 'impose-axiom', 'combine-compatible']);
const adjacency = new Map((graph.nodes ?? []).map((node) => [node.id, []]));
for (const edge of graph.edges ?? []) if (structuralTypes.has(edge.type)) adjacency.get(edge.source)?.push(edge.target);
const visitState = new Map();
const visitStack = [];
let structuralCycle = null;
const visit = (id) => {
  visitState.set(id, 1);
  visitStack.push(id);
  for (const next of adjacency.get(id) ?? []) {
    if (visitState.get(next) === 1) {
      structuralCycle = [...visitStack.slice(visitStack.indexOf(next)), next];
      return true;
    }
    if (!visitState.has(next) && visit(next)) return true;
  }
  visitStack.pop();
  visitState.set(id, 2);
  return false;
};
for (const node of graph.nodes ?? []) {
  if (!visitState.has(node.id) && visit(node.id)) break;
}
if (structuralCycle) errors.push(`Structural edge cycle detected: ${structuralCycle.join(' -> ')}`);

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const multiDomainCount = graph.nodes.filter((node) => node.kind === 'structure' && node.domains.length > 1).length;
  console.log(`Validated ${Object.keys(graph.fields).length} fields, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${Object.keys(graph.sources).length} sources, ${viewsData.views.length} views, and ${multiDomainCount} multi-domain concepts.`);
}
