const mathOperatorPattern = /[⊆⊂∈∉×→←↦⇒⇉≤≥≠≅≈=∧∨⋁⊗⊕⊔▷∘·†∇□∖√‖⟨⟩−^_]/u;
const unicodeScriptPattern = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿᵒᵖ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]/u;
const specialMathAlphabetPattern = /[ℕℤℚℝℂ𝔤πωτΣΤμΩα∞∅⊥⊤]/u;
const knownMathTokenPattern = /^(?:Spec|hom|GL|lim|[A-Z])(?:\([^\s]*\)|\[[^\s]*\])$/u;
const explicitMathPattern = /\$([^$\n]+?)\$/g;

const subscriptCharacters = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j',
  'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't',
  'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x'
};
const superscriptCharacters = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ᵒ': 'o', 'ᵖ': 'p'
};

function normalizedMathToken(value) {
  return value
    .replace(/^[“”"'`]+/u, '')
    .replace(/[“”"'`.;!?]+$/u, '');
}

function isStrongMathToken(value) {
  const token = normalizedMathToken(value);
  if (!token) return false;
  return mathOperatorPattern.test(token)
    || unicodeScriptPattern.test(token)
    || specialMathAlphabetPattern.test(token)
    || knownMathTokenPattern.test(token)
    || /^(?:Spec|hom|GL|lim)$/u.test(token);
}

function isWeakMathToken(value) {
  const token = normalizedMathToken(value);
  if (!token) return false;
  return /^[A-Za-zΑ-ω]$/u.test(token)
    || /^\d+(?:\.\d+)?$/u.test(token)
    || /^[()[\]{}]+$/u.test(token);
}

export function unicodeMathToTex(value) {
  let tex = value.trim();
  tex = tex.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/gu,
    (run) => `_{${[...run].map((character) => subscriptCharacters[character] ?? character).join('')}}`);
  tex = tex.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿᵒᵖ]+/gu,
    (run) => `^{${[...run].map((character) => superscriptCharacters[character] ?? character).join('')}}`);

  tex = tex.replace(/‖([^‖]+)‖/gu, '\\lVert $1 \\rVert ');
  tex = tex.replace(/√([^\s,;]+)/gu, '\\sqrt{$1}');

  const replacements = [
    ['ℕ', '\\mathbb{N}'], ['ℤ', '\\mathbb{Z}'], ['ℚ', '\\mathbb{Q}'], ['ℝ', '\\mathbb{R}'], ['ℂ', '\\mathbb{C}'],
    ['𝔤', '\\mathfrak{g}'], ['⊆', '\\subseteq '], ['⊂', '\\subset '], ['∈', '\\in '], ['∉', '\\notin '],
    ['×', '\\times '], ['→', '\\to '], ['←', '\\leftarrow '], ['↦', '\\mapsto '], ['⇒', '\\Rightarrow '],
    ['⇉', '\\rightrightarrows '], ['≤', '\\le '], ['≥', '\\ge '], ['≠', '\\ne '], ['≅', '\\cong '],
    ['≈', '\\approx '], ['∞', '\\infty '], ['∅', '\\varnothing '], ['⊥', '\\bot '], ['⊤', '\\top '],
    ['∧', '\\wedge '], ['∨', '\\vee '], ['⋁', '\\bigvee '], ['⊗', '\\otimes '], ['⊕', '\\oplus '],
    ['⊔', '\\sqcup '], ['▷', '\\triangleright '], ['∘', '\\circ '], ['·', '\\cdot '], ['†', '\\dagger '],
    ['∇', '\\nabla '], ['□', '\\square '], ['∖', '\\setminus '], ['⟨', '\\langle '], ['⟩', '\\rangle '],
    ['−', '-'], ['τ', '\\tau '], ['ω', '\\omega '], ['Σ', '\\Sigma '], ['Τ', 'T'], ['μ', '\\mu '],
    ['Ω', '\\Omega '], ['π', '\\pi '], ['α', '\\alpha '], ['Δ', '\\Delta '], ['ξ', '\\xi '],
    ['λ', '\\lambda '], ['φ', '\\varphi '], ['…', '\\ldots ']
  ];
  for (const [source, replacement] of replacements) tex = tex.replaceAll(source, replacement);
  return tex.replace(/\bSpec\b/g, '\\operatorname{Spec}')
    .replace(/\bhom\b/g, '\\operatorname{hom}')
    .replace(/\bGL\b/g, '\\operatorname{GL}')
    .replace(/\blim\b/g, '\\varprojlim');
}

function heuristicSegments(value) {
  const tokens = [...value.matchAll(/\S+/gu)].map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
  const segments = [];
  let index = 0;
  while (index < tokens.length) {
    if (!isStrongMathToken(tokens[index].text)) {
      index += 1;
      continue;
    }

    let startIndex = index;
    let endIndex = index;
    while (startIndex > 0 && isWeakMathToken(tokens[startIndex - 1].text)) startIndex -= 1;
    while (endIndex + 1 < tokens.length
      && (isStrongMathToken(tokens[endIndex + 1].text) || isWeakMathToken(tokens[endIndex + 1].text))) {
      endIndex += 1;
    }

    const start = tokens[startIndex].start;
    const end = tokens[endIndex].end;
    const source = value.slice(start, end);
    const terminalMatch = source.match(/([.;!?]+)$/u);
    const terminal = terminalMatch?.[1] ?? '';
    segments.push({ start, end: end - terminal.length, source: terminal ? source.slice(0, -terminal.length) : source });
    index = endIndex + 1;
  }
  return segments;
}

function mapOutsideExplicitMath(value, transform) {
  let output = '';
  let cursor = 0;
  for (const match of value.matchAll(explicitMathPattern)) {
    const index = match.index ?? 0;
    output += transform(value.slice(cursor, index));
    output += match[0];
    cursor = index + match[0].length;
  }
  return output + transform(value.slice(cursor));
}

export function markExplicitMath(value) {
  return mapOutsideExplicitMath(String(value ?? ''), (plainText) => {
    const segments = heuristicSegments(plainText);
    if (!segments.length) return plainText;
    let output = '';
    let cursor = 0;
    for (const segment of segments) {
      if (segment.start < cursor) continue;
      output += plainText.slice(cursor, segment.start);
      output += `$${unicodeMathToTex(segment.source)}$`;
      cursor = segment.end;
    }
    return output + plainText.slice(cursor);
  });
}

export function findUnmarkedMath(value) {
  const findings = [];
  let baseOffset = 0;
  let cursor = 0;
  const text = String(value ?? '');
  for (const match of text.matchAll(explicitMathPattern)) {
    const index = match.index ?? 0;
    for (const segment of heuristicSegments(text.slice(cursor, index))) {
      findings.push({ ...segment, start: segment.start + cursor, end: segment.end + cursor });
    }
    cursor = index + match[0].length;
    baseOffset = cursor;
  }
  for (const segment of heuristicSegments(text.slice(cursor))) {
    findings.push({ ...segment, start: segment.start + baseOffset, end: segment.end + baseOffset });
  }
  return findings;
}

export function explicitMathErrors(value) {
  const text = String(value ?? '');
  const errors = [];
  const delimiters = [...text.matchAll(/\$/g)];
  if (delimiters.length % 2 !== 0) errors.push('has an unmatched $ delimiter');

  for (const match of text.matchAll(explicitMathPattern)) {
    const expression = match[1];
    if (!expression.trim()) errors.push('contains an empty inline-math expression');
    if (/[^\x00-\x7F]/u.test(expression)) errors.push(`contains non-ASCII notation inside $...$: ${match[0]}`);

    let depth = 0;
    for (let index = 0; index < expression.length; index += 1) {
      const character = expression[index];
      const escaped = index > 0 && expression[index - 1] === '\\';
      if (escaped) continue;
      if (character === '{') depth += 1;
      if (character === '}') depth -= 1;
      if (depth < 0) break;
    }
    if (depth !== 0) errors.push(`has unbalanced TeX braces in ${match[0]}`);
  }
  return errors;
}
