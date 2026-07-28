# Atlas of Fundamental Concepts (mAtlas)

An interactive, source-backed graph connecting concepts across fields of knowledge. The current release combines the existing mathematics atlas with an initial physics spine running from foundational physical concepts through classical mechanics, relativity, quantum mechanics, quantum field theory, the Standard Model, particles, nuclei, atoms, ions, and molecules.

The atlas is one graph rather than a collection of isolated applications. Fields occupy vertically stacked, subtly bounded bands; domains form horizontal lanes within each field; and justified cross-field relations connect the bands.

## Public routes

- `/` — global atlas
- `/math/` — mathematics scope
- `/physics/` — physics scope
- `/concepts/<id>/` — canonical concept pages
- `/concepts/` — static concept directory
- `/data/atlas.<hash>.json` — immutable canonical graph export (the exact URL is linked from each generated page)
- `/data/schema.json` — published JSON Schema

The generated site does not create or preserve `/m/`; configure an external redirect if one is required.

## Requirements and setup

- Node.js 20 or newer
- npm

```bash
npm install
npm run dev
```

`npm run dev` rebuilds when files under `src/` change and serves the result at `http://localhost:4173` by default.

## Build and checks

```bash
npm run validate:data
npm run typecheck
npm test
```

`npm run build` writes the publishable static site to `dist/`. `npm run build:pages` copies that output unchanged to `.pages/` for GitHub Pages.

The validator checks field/domain membership, node and edge references, citations and source URLs, construction-junction consistency, structural direction and cycles, duplicate relations, source usage, generic detail sections, and explicit inline-math markup.

## Additional scripts

- `npm run clean` removes generated build artifacts such as `dist/` and `.pages/`.
- `npm run preview` serves the contents of `dist/` locally for review after building.
- `npm run math:mark` helps migrate legacy unmarked math to explicit `$...$` delimiters; its changes require editorial review.

## Architecture

```text
src/
  index.html                 shared application shell
  styles.css                 application, graph, and field-band styling
  main.ts                    graph renderer, routing, state, details, and SVG export
  types.ts                   graph and application types
  data/
    structures.json          canonical editable graph dataset
    schema.json              published schema
scripts/
  build.mjs                  validates, compiles, generates pages, and assembles dist/
  generate-concept-pages.mjs canonical concept, directory, and field-scope pages
  generate-seo-assets.mjs    sitemap, robots.txt, and llms.txt
  validate-data.mjs          semantic and reference validation
  prepare-pages.mjs          root-level GitHub Pages artifact
```

`src/data/structures.json` remains the single editable dataset for this revision. The model is now field-aware and can later be split into authoring modules without changing its compiled public form.

### Taxonomy

Each domain belongs to one field. Each concept declares:

- `primaryField` and `fields`
- `primaryDomain` and `domains`
- `conceptType`
- `level`, used for vertical placement within the field band
- common descriptive fields and optional generic `sections`

Existing mathematics concepts inherit the mathematics field through their domains. Physics concepts use the generalized detail-section model so theories, laws, fields, particles, systems, processes, states, and phenomena can coexist without forcing them into the mathematics-specific carrier/data/axiom schema.

A concept may eventually belong to several fields. Boundary concepts such as atoms and molecules should remain single nodes with multiple memberships once chemistry is added, unless distinct disciplinary concepts genuinely require separate nodes.

### Relations

The original mathematical relation types remain. The multi-field model adds relation types for:

- mathematical formulation
- framework specialization
- quantization
- theory components
- description or governance
- composition
- classification
- field excitation
- interaction mediation
- binding or formation
- limiting approximations
- state descriptions
- transformations and processes

Relations are not treated as one undifferentiated “built from” ordering. This is essential in physics: special relativity and quantum mechanics jointly constrain relativistic QFT, general relativity is parallel to the Standard Model rather than downstream from it, and classical limits are marked as approximations rather than derivations.

## User interface and URL state

The left panel contains hierarchical field and domain filters plus a **Cross-field links** preference:

- `contextual` — show designated overview bridges and reveal local bridges for the selected neighborhood
- `all` — show all admitted cross-field relations
- `hidden` — suppress cross-field relations and their external prerequisite context

Fields, domains, edge types, cross-field visibility, display options, and layout are encoded in query parameters for bookmarkable views and browser history. Preferences continue to be written to local storage, but restoration is intentionally disabled in `readStoredUiState()` for now.

The scoped routes initialize their corresponding field while using the same graph and codebase. Canonical concept URLs are field-independent so a multi-field concept has one durable identity.


## Inline mathematics

Math-capable strings use explicit `$...$` LaTeX delimiters, escaped for JSON:

```json
"body": "Its gauge group is $SU(3)_C \\times SU(2)_L \\times U(1)_Y$."
```

The browser escapes prose and sends only delimited formulas to KaTeX. `npm run math:mark` remains a migration aid for older unmarked text; its changes require editorial review.

## GitHub Pages

`.github/workflows/pages.yml` installs locked dependencies, runs `npm run build:pages`, and deploys `.pages/`. The artifact now places the complete atlas at its root, including `/math/`, `/physics/`, and `/concepts/`.

## License

See the [NOTICE](NOTICE) and [LICENSE](LICENSE) files for licensing information.

```
mAtlas - Copyright (c) 2026 Advay Mengle - https://atlas.madvay.com/

The files in `src/data/` (and as published, the `data/` directory) are licensed under the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/); attribution should be given per the first line in this file.

The remainder of mAtlas is licensed under the Apache License 2.0:

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
