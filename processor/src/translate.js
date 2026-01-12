/**
 * Canvas Translation - Claude API Integration
 *
 * Translates canvas batches using Claude API with context-aware prompts
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const LANGUAGE_NAMES = {
  ko: 'Korean',
  ja: 'Japanese',
  en: 'English',
};

/**
 * Generate translation prompt for a batch
 */
function buildTranslationPrompt(batch, batchType, targetLang, context, glossary) {
  const sourceLang = context._meta.sourceLang;
  const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

  let prompt = `You are a professional translator for StoryChat interactive fiction.
Translate the following ${batchType} content from ${sourceLangName} to ${targetLangName}.

## Translation Guidelines:
1. Maintain the EXACT JSON structure - only translate text values
2. Preserve all keys, UIDs, and technical fields exactly as-is
3. Keep {{var_*}} variable references unchanged (do NOT translate variable names inside {{}})
4. Preserve HTML tags in htmlContent - only translate the text content
5. Match the tone, style, and register of the original text
6. For character names: Use the glossary translations if provided, otherwise keep original or romanize appropriately
7. For lorebook entries: Translate both 'key' and 'text' fields, keeping 'patterns' as-is

## Story Context:
${context._translationContext.storySummary || 'No summary available'}

## Characters:
${Object.entries(context._translationContext.characters || {})
  .map(([name, info]) => `- ${name}: ${info.description || 'No description'}`)
  .join('\n') || 'No characters defined'}

## Glossary (use these translations for consistency):
### Characters:
${Object.entries(glossary.characters || {})
  .filter(([_, v]) => v[targetLang])
  .map(([name, v]) => `- ${name} → ${v[targetLang]}`)
  .join('\n') || 'No character translations'}

### Variables:
${Object.entries(glossary.variables || {})
  .filter(([_, v]) => v[targetLang])
  .map(([name, v]) => `- ${name} → ${v[targetLang]}`)
  .join('\n') || 'No variable translations'}

### Terms:
${Object.entries(glossary.terms || {})
  .filter(([_, v]) => v[targetLang])
  .map(([term, v]) => `- ${term} → ${v[targetLang]}`)
  .join('\n') || 'No term translations'}

## Input (${batchType}):
${JSON.stringify(batch, null, 2)}

## Output:
Return ONLY the translated JSON array. No explanation, no markdown code blocks, just the JSON.`;

  return prompt;
}

/**
 * Translate a single batch using Claude API
 * @param {Array} batch - Array of nodes to translate
 * @param {string} batchType - Type of batch (storyCore, characters, etc.)
 * @param {string} targetLang - Target language code (en, ko, ja)
 * @param {Object} context - Translation context from extract
 * @param {Object} glossary - Glossary for consistent translations
 * @returns {Promise<Array>} - Translated batch
 */
export async function translateBatch(batch, batchType, targetLang, context, glossary) {
  if (!batch || batch.length === 0) {
    return [];
  }

  const prompt = buildTranslationPrompt(batch, batchType, targetLang, context, glossary);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    // Parse the response - handle potential markdown code blocks
    let jsonText = content.text.trim();

    // Remove markdown code block if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const translated = JSON.parse(jsonText);

    // Validate that we got an array back
    if (!Array.isArray(translated)) {
      throw new Error('Expected array response from translation');
    }

    // Validate that UIDs match
    if (translated.length !== batch.length) {
      console.warn(`Warning: Translated batch length (${translated.length}) differs from original (${batch.length})`);
    }

    return translated;
  } catch (error) {
    console.error(`Error translating ${batchType} batch:`, error.message);
    throw error;
  }
}

/**
 * Translate glossary (characters, variables, terms) using Claude API
 * @param {Object} glossary - Raw glossary from extract
 * @param {string} targetLang - Target language code
 * @param {Object} context - Translation context
 * @returns {Promise<Object>} - Glossary with translations filled in
 */
export async function translateGlossary(glossary, targetLang, context) {
  const sourceLang = glossary._meta.sourceLang;
  const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

  // Build list of terms to translate
  const termsToTranslate = {
    characters: Object.entries(glossary.characters).map(([name, v]) => ({
      original: name,
      note: v.note,
    })),
    variables: Object.entries(glossary.variables).map(([name, v]) => ({
      original: name,
      note: v.note,
    })),
    terms: Object.entries(glossary.terms).map(([term, v]) => ({
      original: term,
      note: v.note,
    })),
  };

  const prompt = `You are a professional translator for StoryChat interactive fiction.
Translate the following glossary terms from ${sourceLangName} to ${targetLangName}.

## Story Context:
${context._translationContext.storySummary || 'No summary available'}

## Guidelines:
1. For character names: Provide appropriate translations or romanizations
2. For variable names: Translate to meaningful ${targetLangName} equivalents
3. For story terms: Translate to natural ${targetLangName} expressions
4. Use the 'note' field for context about each term

## Terms to Translate:
${JSON.stringify(termsToTranslate, null, 2)}

## Output Format:
Return a JSON object with the same structure, but with translated values:
{
  "characters": { "original_name": "translated_name", ... },
  "variables": { "original_name": "translated_name", ... },
  "terms": { "original_term": "translated_term", ... }
}

Return ONLY the JSON object. No explanation, no markdown code blocks.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    let jsonText = content.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const translations = JSON.parse(jsonText);

    // Apply translations to glossary
    for (const [name, translated] of Object.entries(translations.characters || {})) {
      if (glossary.characters[name]) {
        glossary.characters[name][targetLang] = translated;
      }
    }
    for (const [name, translated] of Object.entries(translations.variables || {})) {
      if (glossary.variables[name]) {
        glossary.variables[name][targetLang] = translated;
      }
    }
    for (const [term, translated] of Object.entries(translations.terms || {})) {
      if (glossary.terms[term]) {
        glossary.terms[term][targetLang] = translated;
      }
    }

    return glossary;
  } catch (error) {
    console.error('Error translating glossary:', error.message);
    throw error;
  }
}

/**
 * Translate all batches for a canvas
 * @param {Object} extractedData - Output from extractCanvas
 * @param {string} targetLang - Target language code
 * @param {Function} onProgress - Progress callback (batchType, current, total)
 * @returns {Promise<Object>} - { translatedBatches, glossary }
 */
export async function translateAllBatches(extractedData, targetLang, onProgress = () => {}) {
  const { context, glossary, batches } = extractedData;

  // First, translate the glossary for consistency
  console.log('Translating glossary...');
  onProgress('glossary', 0, 1);
  const translatedGlossary = await translateGlossary(glossary, targetLang, context);
  onProgress('glossary', 1, 1);

  // Then translate each batch in order
  const batchOrder = ['storyCore', 'variables', 'characters', 'characterText', 'content', 'system'];
  const translatedBatches = {};

  for (const batchType of batchOrder) {
    const batch = batches[batchType];
    if (!batch || batch.length === 0) {
      translatedBatches[batchType] = [];
      continue;
    }

    console.log(`Translating ${batchType} (${batch.length} nodes)...`);
    onProgress(batchType, 0, batch.length);

    // For large batches, split into chunks
    const CHUNK_SIZE = 10;
    const chunks = [];
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      chunks.push(batch.slice(i, i + CHUNK_SIZE));
    }

    const translatedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const translated = await translateBatch(
        chunks[i],
        batchType,
        targetLang,
        context,
        translatedGlossary
      );
      translatedChunks.push(...translated);
      onProgress(batchType, Math.min((i + 1) * CHUNK_SIZE, batch.length), batch.length);

      // Add small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    translatedBatches[batchType] = translatedChunks;
  }

  return { translatedBatches, glossary: translatedGlossary };
}

export default { translateBatch, translateGlossary, translateAllBatches };
