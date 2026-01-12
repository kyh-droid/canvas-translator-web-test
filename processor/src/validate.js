/**
 * Canvas Translation - Validate Module
 *
 * Validates a translated canvas for:
 * 1. Untranslated text (source language still present)
 * 2. Variable reference consistency
 * 3. Token limits
 */

// Try to load tiktoken for token counting
let encoder = null;
try {
  const { encodingForModel } = await import('js-tiktoken');
  encoder = encodingForModel('gpt-4o');
} catch (e) {
  console.warn('Warning: js-tiktoken not available. Token counting disabled.');
}

// Language detection patterns
const LANG_PATTERNS = {
  ko: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,  // Korean Hangul
  ja: /[\u3040-\u309F\u30A0-\u30FF]/,                // Japanese Hiragana/Katakana
  en: /^[\x00-\x7F]*$/,                              // ASCII only
};

// Token limits per field type
const TOKEN_LIMITS = {
  characterText: 30000,
  textNode: 300,
  imageExplain: 300,
  lorebookEntry: 300,
  prologueMessage: 700,
  prologueGuide: 300,
  updateRule: 400,
  detailedDescription: 30000,
};

function hasSourceLanguage(text, sourceLang) {
  if (!text || typeof text !== 'string') return false;
  return LANG_PATTERNS[sourceLang]?.test(text) || false;
}

function countTokens(text) {
  if (!text || !encoder) return 0;
  return encoder.encode(text).length;
}

function getCoreContextLimit(advancedSettings) {
  let limit = 2000;
  if (advancedSettings) {
    if (advancedSettings.disableDynamicMemory) limit += 800;
    if (advancedSettings.disableAutoPlotCompression) limit += 1200;
    if (advancedSettings.disableMacroPromptInjections) limit += 1200;
    if (advancedSettings.disableDefaultContentPolicy) limit += 800;
    if (advancedSettings.disableDefaultSystemInstructions) {
      if (advancedSettings.disableNarrationCue && advancedSettings.disableDialogueCue) {
        limit += 1500;
      } else if (advancedSettings.disableNarrationCue || advancedSettings.disableDialogueCue) {
        limit += 1000;
      }
    }
  }
  return limit;
}

/**
 * Validate a translated canvas
 * @param {Object} canvas - Translated canvas object
 * @param {string} sourceLang - Original source language
 * @returns {Object} - { passed: boolean, errors: [], warnings: [], stats: {} }
 */
export function validateCanvas(canvas, sourceLang) {
  const errors = [];
  const warnings = [];
  const untranslated = [];
  const invalidRefs = [];
  const overLimit = [];

  // Check 1: Untranslated Text
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    const nodeName = meta.name || meta.title || meta.variableName || uid.substring(0, 8);

    const fieldsToCheck = [
      'text', 'name', 'title', 'variableName', 'coreContext', 'prologue',
      'prologueGuide', 'statusTitle', 'achievementName', 'description'
    ];

    for (const field of fieldsToCheck) {
      if (meta[field] && hasSourceLanguage(meta[field], sourceLang)) {
        untranslated.push({
          uid: uid.substring(0, 8),
          nodeType: meta.type,
          nodeName,
          field,
          preview: meta[field].substring(0, 40).replace(/\n/g, ' '),
        });
      }
    }

    // Check nested: images
    if (meta.images) {
      for (let i = 0; i < meta.images.length; i++) {
        if (meta.images[i].explain && hasSourceLanguage(meta.images[i].explain, sourceLang)) {
          untranslated.push({
            uid: uid.substring(0, 8),
            nodeType: 'image',
            nodeName: `${nodeName}[${i}]`,
            field: 'explain',
            preview: meta.images[i].explain.substring(0, 40).replace(/\n/g, ' '),
          });
        }
      }
    }

    // Check nested: lorebook entries
    if (meta.entries) {
      for (let i = 0; i < meta.entries.length; i++) {
        const entry = meta.entries[i];
        for (const field of ['key', 'text']) {
          if (entry[field] && hasSourceLanguage(entry[field], sourceLang)) {
            untranslated.push({
              uid: uid.substring(0, 8),
              nodeType: 'lorebook',
              nodeName: `${nodeName}[${i}]`,
              field,
              preview: entry[field].substring(0, 40).replace(/\n/g, ' '),
            });
          }
        }
      }
    }
  }

  // Check 2: Variable Reference Consistency
  const validRefs = new Set();
  const validRefsLower = new Set();
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    if (meta.type === 'variable' && meta.variableName) {
      const refOriginal = 'var_' + meta.variableName.replace(/\s+/g, '_');
      const refLower = refOriginal.toLowerCase();
      validRefs.add(`{{${refOriginal}}}`);
      validRefsLower.add(refLower);
    }
  }

  const varRefPattern = /\{\{var_[^}]+\}\}/g;
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    const nodeName = meta.name || meta.title || uid.substring(0, 8);
    const textFields = [meta.text, meta.coreContext, meta.prologue, meta.prologueGuide];

    for (const text of textFields) {
      if (!text) continue;
      const refs = text.match(varRefPattern) || [];
      for (const ref of refs) {
        const refInner = ref.slice(2, -2);
        const refLower = refInner.toLowerCase();
        if (!validRefs.has(ref) && !validRefsLower.has(refLower)) {
          invalidRefs.push({
            uid: uid.substring(0, 8),
            nodeType: meta.type,
            nodeName,
            ref,
          });
        }
      }
    }
  }

  // Check 3: Token Limits
  if (encoder) {
    let totalFields = 0;
    let totalTokens = 0;

    for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
      const nodeName = meta.name || meta.title || uid.substring(0, 8);
      const checks = [];

      switch (meta.type) {
        case 'character':
          if (meta.text) checks.push({ field: 'text', value: meta.text, limit: TOKEN_LIMITS.characterText });
          break;
        case 'story':
          if (meta.coreContext) checks.push({ field: 'coreContext', value: meta.coreContext, limit: getCoreContextLimit(meta.advancedSettings) });
          if (meta.prologue) checks.push({ field: 'prologue', value: meta.prologue, limit: TOKEN_LIMITS.prologueMessage });
          if (meta.prologueGuide) checks.push({ field: 'prologueGuide', value: meta.prologueGuide, limit: TOKEN_LIMITS.prologueGuide });
          if (meta.text) checks.push({ field: 'text', value: meta.text, limit: TOKEN_LIMITS.detailedDescription });
          break;
        case 'text':
          if (meta.text) checks.push({ field: 'text', value: meta.text, limit: TOKEN_LIMITS.textNode });
          break;
        case 'updateRule':
          if (meta.text) checks.push({ field: 'text', value: meta.text, limit: TOKEN_LIMITS.updateRule });
          break;
      }

      for (const check of checks) {
        const tokens = countTokens(check.value);
        totalFields++;
        totalTokens += tokens;

        if (tokens > check.limit) {
          overLimit.push({
            uid: uid.substring(0, 8),
            nodeType: meta.type,
            nodeName,
            field: check.field,
            tokens,
            limit: check.limit,
            over: tokens - check.limit,
          });
        }
      }
    }
  }

  // Build errors and warnings
  if (untranslated.length > 0) {
    errors.push({
      type: 'untranslated',
      message: `${untranslated.length} fields contain untranslated ${sourceLang} text`,
      items: untranslated,
    });
  }

  if (invalidRefs.length > 0) {
    errors.push({
      type: 'invalid_refs',
      message: `${invalidRefs.length} invalid variable references found`,
      items: invalidRefs,
    });
  }

  if (overLimit.length > 0) {
    errors.push({
      type: 'over_limit',
      message: `${overLimit.length} fields exceed token limits`,
      items: overLimit,
    });
  }

  const passed = errors.length === 0;

  return {
    passed,
    errors,
    warnings,
    stats: {
      untranslatedCount: untranslated.length,
      invalidRefsCount: invalidRefs.length,
      overLimitCount: overLimit.length,
      totalNodes: Object.keys(canvas.metadataSet).length,
      variableCount: validRefs.size,
    },
  };
}

export default { validateCanvas };
