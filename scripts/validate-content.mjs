import { loadSourceContent } from './content/load.mjs';
import { validateContent, validationLayers, validationSummary } from './content/validate.mjs';

const requestedLayer = process.argv[2] ?? null;
const content = await loadSourceContent();
const results = validateContent(content, requestedLayer);
const failures = results.flatMap((result) => result.errors.map((error) => `[${result.name}] ${error}`));

if (failures.length) {
  console.error(`Content validation failed with ${failures.length} error${failures.length === 1 ? '' : 's'}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else if (requestedLayer) {
  console.log(`Validated content layer: ${requestedLayer}.`);
} else {
  console.log(`Validated ${validationSummary(content)} across ${validationLayers.length} layers.`);
}
