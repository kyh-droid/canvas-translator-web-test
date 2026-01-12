/**
 * Canvas Translation - Merge Module
 *
 * Merges translated batches back into the original canvas file.
 * Handles variable initialValues and language instruction transformations.
 */

// Language instruction transformation map
const LANG_INSTRUCTION_MAP = {
  ko: {
    instruction: '한국어로 작성',
    alternatives: ['한글로 작성', '한국어로 출력', '한글로 출력', 'in Korean', 'using Korean'],
  },
  ja: {
    instruction: '日本語で書く',
    alternatives: ['日本語で出力', '日本語で作成', 'in Japanese', 'using Japanese'],
  },
  en: {
    instruction: 'Write in English',
    alternatives: ['in English', 'using English', 'Output in English'],
  },
};

/**
 * Transform language instruction in text to target language
 * BUT: if original is English instruction, keep it as English
 */
function transformLanguageInstruction(text, langInstr, targetLang) {
  if (!text || !langInstr || !langInstr.found) return text;

  // If original instruction is for English, keep it
  if (langInstr.lang === 'en') {
    return text;
  }

  // Replace with target language instruction
  const targetInstr = LANG_INSTRUCTION_MAP[targetLang];
  if (!targetInstr) return text;

  // Replace the found pattern with target instruction
  return text.replace(langInstr.pattern, targetInstr.instruction);
}

/**
 * Merge translated batches back into the original canvas
 * @param {Object} originalCanvas - Original canvas-export JSON
 * @param {Object} translatedBatches - { storyCore, variables, characters, ... }
 * @param {Object} context - Context from extraction
 * @param {string} targetLang - Target language code
 * @returns {Object} - Translated canvas object
 */
export function mergeTranslations(originalCanvas, translatedBatches, context, targetLang) {
  // Deep clone the original canvas to avoid mutation
  const canvas = JSON.parse(JSON.stringify(originalCanvas));

  // Build translation map from all batches
  const translationMap = {};
  const batchOrder = ['storyCore', 'variables', 'characters', 'characterText', 'content', 'system'];

  for (const batchType of batchOrder) {
    const batch = translatedBatches[batchType];
    if (!batch) continue;

    for (const node of batch) {
      translationMap[node.uid] = node;
    }
  }

  let applied = 0;
  let skipped = 0;

  // Apply translations to each node in metadataSet
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    const translated = translationMap[uid];
    if (!translated) {
      skipped++;
      continue;
    }

    // Apply translated fields
    if (translated.name) meta.name = translated.name;
    if (translated.title) meta.title = translated.title;

    // Handle text with potential language instruction transformation
    if (translated.text !== undefined) {
      let text = translated.text;
      // If this node has a language instruction marker, transform it
      if (translated.languageInstruction) {
        text = transformLanguageInstruction(text, translated.languageInstruction, targetLang);
      }
      meta.text = text;
    }

    if (translated.variableName) meta.variableName = translated.variableName;

    // Handle variable initialValue (only if translated and not English)
    if (translated.initialValue !== undefined && !translated.initialValueIsEnglish) {
      meta.initialValue = translated.initialValue;
    }

    if (translated.coreContext) meta.coreContext = translated.coreContext;
    if (translated.prologue) meta.prologue = translated.prologue;
    if (translated.prologueGuide) meta.prologueGuide = translated.prologueGuide;
    if (translated.statusTitle) meta.statusTitle = translated.statusTitle;
    if (translated.htmlContent) meta.htmlContent = translated.htmlContent;
    if (translated.achievementName) meta.achievementName = translated.achievementName;
    if (translated.description) meta.description = translated.description;

    // Handle lorebook entries
    if (translated.entries && meta.entries) {
      meta.entries = translated.entries;
    }

    // Handle image explains
    if (translated.images && meta.images) {
      for (let i = 0; i < translated.images.length && i < meta.images.length; i++) {
        if (translated.images[i].explain) {
          meta.images[i].explain = translated.images[i].explain;
        }
      }
    }

    applied++;
  }

  // Update tagCategorization if provided
  if (context.tagCategorization) {
    canvas.canvas.tagCategorization = context.tagCategorization;
  }

  // Update canvas language
  canvas.canvas.canvasLanguage = targetLang;

  // Update export metadata
  canvas.exportedAt = new Date().toISOString();
  canvas.translatedFrom = context._meta.sourceLang;
  canvas.translatedTo = targetLang;

  return {
    canvas,
    stats: {
      applied,
      skipped,
      sourceLang: context._meta.sourceLang,
      targetLang,
    },
  };
}

export default { mergeTranslations };
