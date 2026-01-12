/**
 * Canvas Translation - Extract Module
 *
 * Extracts translatable content from a StoryChat canvas export into
 * batch structures that can be translated by Claude.
 */

/**
 * Detect if text is primarily English
 */
function isEnglishText(text) {
  if (!text) return false;
  const englishChars = text.match(/[a-zA-Z]/g) || [];
  const totalChars = text.replace(/[\s\d\p{P}]/gu, '').length;
  return totalChars > 0 && (englishChars.length / totalChars) > 0.7;
}

/**
 * Detect language generation instructions in text
 * Returns: { found: boolean, lang: string, pattern: string }
 */
function detectLanguageInstruction(text) {
  if (!text) return { found: false };

  const patterns = [
    // Korean instructions
    { regex: /한국어로\s*(작성|출력|생성|응답)/gi, lang: 'ko' },
    { regex: /한글로\s*(작성|출력|생성|응답)/gi, lang: 'ko' },
    { regex: /(작성|출력|생성|응답).*한국어/gi, lang: 'ko' },
    { regex: /(작성|출력|생성|응답).*한글/gi, lang: 'ko' },
    // Japanese instructions
    { regex: /日本語で\s*(書く|出力|生成|応答)/gi, lang: 'ja' },
    { regex: /(書く|出力|生成|応答).*日本語/gi, lang: 'ja' },
    // English instructions
    { regex: /(?:write|output|respond|generate)\s+(?:in|using)\s+korean/gi, lang: 'ko' },
    { regex: /(?:write|output|respond|generate)\s+(?:in|using)\s+japanese/gi, lang: 'ja' },
    { regex: /(?:write|output|respond|generate)\s+(?:in|using)\s+english/gi, lang: 'en' },
    { regex: /(?:in|using)\s+korean\s+(?:language)?/gi, lang: 'ko' },
    { regex: /(?:in|using)\s+japanese\s+(?:language)?/gi, lang: 'ja' },
    { regex: /(?:in|using)\s+english\s+(?:language)?/gi, lang: 'en' },
  ];

  for (const { regex, lang } of patterns) {
    const match = text.match(regex);
    if (match) {
      return { found: true, lang, pattern: match[0] };
    }
  }

  return { found: false };
}

/**
 * Extract translatable content from a canvas object
 * @param {Object} canvas - Parsed canvas-export JSON
 * @returns {Object} - { context, glossary, batches }
 */
export function extractCanvas(canvas) {
  // Build Translation Context & Glossary
  const translationContext = {
    storySummary: '',
    characters: {},
    glossary: [],
  };

  const glossary = {
    _meta: {
      sourceLang: canvas.canvas.canvasLanguage || 'ko',
      generatedAt: new Date().toISOString(),
      note: 'Auto-generated glossary for translation consistency',
    },
    characters: {},
    variables: {},
    terms: {},
    languageInstructions: [],
  };

  // Extract story summary from coreContext
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    if (meta.type === 'story' && meta.coreContext) {
      translationContext.storySummary = meta.coreContext.substring(0, 500) +
        (meta.coreContext.length > 500 ? '...' : '');
      break;
    }
  }

  // Extract character profiles and add to glossary
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    if (meta.type === 'character' && meta.name) {
      translationContext.characters[meta.name] = {
        description: meta.text ? meta.text.substring(0, 200) : '',
        voiceStyle: null,
      };
      glossary.characters[meta.name] = {
        en: '',
        ja: '',
        note: meta.text ? meta.text.substring(0, 100) : '',
      };
    }
  }

  // Extract variables and add to glossary
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    if (meta.type === 'variable' && meta.variableName) {
      const varNote = [];
      if (meta.initialValue !== undefined) {
        varNote.push(`초기값: ${JSON.stringify(meta.initialValue)}`);
      }
      glossary.variables[meta.variableName] = {
        en: '',
        ja: '',
        note: varNote.join(', '),
      };
    }
  }

  // Extract lorebook entries as terms
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    if (meta.type === 'lorebook' && meta.entries) {
      for (const entry of meta.entries) {
        if (entry.key && !glossary.terms[entry.key]) {
          glossary.terms[entry.key] = {
            en: '',
            ja: '',
            note: 'lorebook entry',
          };
        }
      }
    }
  }

  // Find speech style nodes linked to characters
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    if (meta.type === 'text' && meta.name && meta.text) {
      for (const charName of Object.keys(translationContext.characters)) {
        if (meta.name.includes(charName) || meta.title?.includes(charName)) {
          translationContext.characters[charName].voiceStyle =
            meta.text.substring(0, 150) + (meta.text.length > 150 ? '...' : '');
        }
      }
    }
  }

  // Build glossary from repeated quoted terms
  const allText = [];
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    if (meta.text) allText.push(meta.text);
    if (meta.coreContext) allText.push(meta.coreContext);
    if (meta.prologue) allText.push(meta.prologue);
  }
  const combinedText = allText.join(' ');

  const quotedTerms = combinedText.match(/[「『"']([^」』"']+)[」』"']/g) || [];
  const termCounts = {};
  for (const term of quotedTerms) {
    const clean = term.replace(/[「『」』"'"']/g, '').trim();
    if (clean.length >= 2 && clean.length <= 20) {
      termCounts[clean] = (termCounts[clean] || 0) + 1;
    }
  }
  translationContext.glossary = Object.entries(termCounts)
    .filter(([term, count]) => count >= 2)
    .map(([term]) => term)
    .slice(0, 20);

  // Build Batches
  const batches = {
    storyCore: [],
    variables: [],
    characters: [],
    characterText: [],
    content: [],
    system: [],
  };

  // Categorize nodes into batches
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    const node = {
      uid,
      type: meta.type,
      name: meta.name || null,
      title: meta.title || null,
    };

    let batch = null;

    switch (meta.type) {
      case 'character':
        if (meta.text) node.text = meta.text;
        batch = 'characters';
        break;

      case 'story':
        if (meta.coreContext) node.coreContext = meta.coreContext;
        if (meta.prologue) node.prologue = meta.prologue;
        if (meta.prologueGuide) node.prologueGuide = meta.prologueGuide;
        if (meta.text) node.text = meta.text;
        if (meta.advancedSettings) node.advancedSettings = meta.advancedSettings;
        batch = 'storyCore';
        break;

      case 'text':
        if (meta.text) node.text = meta.text;
        const isCharacterText = Object.keys(translationContext.characters)
          .some(name => meta.name?.includes(name) || meta.title?.includes(name));
        batch = isCharacterText ? 'characterText' : 'content';
        break;

      case 'updateRule':
        if (meta.text) {
          node.text = meta.text;
          const langInstr = detectLanguageInstruction(meta.text);
          if (langInstr.found) {
            node.languageInstruction = langInstr;
            if (!glossary.languageInstructions.some(l => l.pattern === langInstr.pattern)) {
              glossary.languageInstructions.push({
                nodeUid: uid,
                ...langInstr,
              });
            }
          }
        }
        batch = 'content';
        break;

      case 'variable':
        if (meta.variableName) {
          node.variableName = meta.variableName;
          if (meta.initialValue !== undefined) {
            const valType = typeof meta.initialValue;
            if (valType === 'string' && meta.initialValue.trim()) {
              node.initialValue = meta.initialValue;
              node.initialValueIsEnglish = isEnglishText(meta.initialValue);
            }
          }
          batch = 'variables';
        }
        break;

      case 'user':
        if (meta.text) node.text = meta.text;
        batch = 'system';
        break;

      case 'lorebook':
        if (meta.entries) node.entries = meta.entries;
        batch = 'content';
        break;

      case 'achievement':
        if (meta.achievementName) node.achievementName = meta.achievementName;
        if (meta.description) node.description = meta.description;
        batch = 'system';
        break;

      case 'statusView':
        if (meta.statusTitle) node.statusTitle = meta.statusTitle;
        if (meta.htmlContent) node.htmlContent = meta.htmlContent;
        batch = 'system';
        break;

      case 'image':
        if (meta.images) {
          node.images = meta.images
            .map(img => ({ explain: img.explain || null }))
            .filter(img => img.explain);
          if (node.images.length > 0) batch = 'content';
        }
        break;

      case 'trigger':
        // Skip - contains code logic
        break;
    }

    if (batch) {
      const hasContent = Object.keys(node).some(k =>
        !['uid', 'type', 'name', 'title'].includes(k) && node[k]
      );
      if (hasContent || node.name || node.title) {
        batches[batch].push(node);
      }
    }
  }

  // Build context metadata
  const context = {
    _meta: {
      sourceLang: canvas.canvas.canvasLanguage,
      extractedAt: new Date().toISOString(),
      nodeCount: Object.keys(canvas.metadataSet).length,
    },
    _translationContext: translationContext,
    tagCategorization: canvas.canvas.tagCategorization,
    batchSummary: {
      storyCore: batches.storyCore.length,
      variables: batches.variables.length,
      characters: batches.characters.length,
      characterText: batches.characterText.length,
      content: batches.content.length,
      system: batches.system.length,
    },
  };

  return { context, glossary, batches };
}

export default { extractCanvas };
