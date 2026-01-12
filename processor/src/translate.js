/**
 * Canvas Translation using Claude API
 *
 * Extracts translatable content, translates via Claude, and merges back.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Language configurations
const LANG_CONFIG = {
  en: { name: 'English', instruction: 'Write in English' },
  ko: { name: 'Korean', instruction: '한국어로 작성' },
  ja: { name: 'Japanese', instruction: '日本語で書く' },
};

/**
 * Main translation function
 */
export async function translateCanvas(inputPath, outputPath, targetLang) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Load canvas
  const canvas = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const sourceLang = canvas.canvas?.canvasLanguage || 'ko';

  console.log(`  Translating from ${sourceLang} to ${targetLang}`);

  // Extract translatable content
  const extractedContent = extractContent(canvas);
  console.log(`  Extracted ${extractedContent.length} translatable items`);

  // Translate in batches
  const batchSize = 20;
  const translatedContent = [];

  for (let i = 0; i < extractedContent.length; i += batchSize) {
    const batch = extractedContent.slice(i, i + batchSize);
    console.log(`  Translating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(extractedContent.length / batchSize)}...`);

    const translated = await translateBatch(client, batch, sourceLang, targetLang);
    translatedContent.push(...translated);
  }

  // Merge translations back
  const translatedCanvas = mergeTranslations(canvas, translatedContent, targetLang);

  // Update canvas language
  translatedCanvas.canvas.canvasLanguage = targetLang;

  // Save output
  fs.writeFileSync(outputPath, JSON.stringify(translatedCanvas, null, 2));

  return translatedCanvas;
}

/**
 * Extract translatable content from canvas
 */
function extractContent(canvas) {
  const items = [];

  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    const item = { uid, type: meta.type, fields: {} };
    let hasContent = false;

    switch (meta.type) {
      case 'character':
        if (meta.name) { item.fields.name = meta.name; hasContent = true; }
        if (meta.text) { item.fields.text = meta.text; hasContent = true; }
        break;

      case 'story':
        if (meta.coreContext) { item.fields.coreContext = meta.coreContext; hasContent = true; }
        if (meta.prologue) { item.fields.prologue = meta.prologue; hasContent = true; }
        if (meta.prologueGuide) { item.fields.prologueGuide = meta.prologueGuide; hasContent = true; }
        if (meta.text) { item.fields.text = meta.text; hasContent = true; }
        break;

      case 'text':
      case 'updateRule':
        if (meta.text) { item.fields.text = meta.text; hasContent = true; }
        break;

      case 'variable':
        if (meta.variableName) { item.fields.variableName = meta.variableName; hasContent = true; }
        // Only translate string initialValue if not English
        if (typeof meta.initialValue === 'string' && meta.initialValue.trim() && !isEnglish(meta.initialValue)) {
          item.fields.initialValue = meta.initialValue;
          hasContent = true;
        }
        break;

      case 'user':
        if (meta.text) { item.fields.text = meta.text; hasContent = true; }
        break;

      case 'lorebook':
        if (meta.entries && meta.entries.length > 0) {
          item.fields.entries = meta.entries;
          hasContent = true;
        }
        break;

      case 'achievement':
        if (meta.achievementName) { item.fields.achievementName = meta.achievementName; hasContent = true; }
        if (meta.description) { item.fields.description = meta.description; hasContent = true; }
        break;

      case 'statusView':
        if (meta.statusTitle) { item.fields.statusTitle = meta.statusTitle; hasContent = true; }
        if (meta.htmlContent) { item.fields.htmlContent = meta.htmlContent; hasContent = true; }
        break;

      case 'image':
        if (meta.images) {
          const explains = meta.images.filter(img => img.explain).map(img => img.explain);
          if (explains.length > 0) {
            item.fields.imageExplains = explains;
            hasContent = true;
          }
        }
        break;
    }

    if (hasContent) {
      items.push(item);
    }
  }

  return items;
}

/**
 * Translate a batch of items using Claude
 */
async function translateBatch(client, items, sourceLang, targetLang) {
  const sourceName = LANG_CONFIG[sourceLang]?.name || sourceLang;
  const targetName = LANG_CONFIG[targetLang]?.name || targetLang;

  const prompt = `You are a professional translator specializing in interactive fiction and visual novels.

Translate the following content from ${sourceName} to ${targetName}.

IMPORTANT RULES:
1. Preserve all formatting, HTML tags, and special characters
2. Keep {{variable}} placeholders unchanged
3. Maintain the tone and style appropriate for interactive fiction
4. For character names, translate them naturally (e.g., Korean names to English phonetic equivalents)
5. For system prompts and instructions, translate the meaning while adapting to the target language
6. If text contains language instructions like "한국어로 작성", change them to "${LANG_CONFIG[targetLang]?.instruction || 'Write in ' + targetName}"

INPUT (JSON array):
${JSON.stringify(items, null, 2)}

OUTPUT (same JSON structure with translated content):`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });

  // Parse response
  const responseText = response.content[0].text;

  // Extract JSON from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('  Warning: Could not parse translation response, using original');
    return items;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('  Warning: Invalid JSON in response, using original');
    return items;
  }
}

/**
 * Merge translated content back into canvas
 */
function mergeTranslations(canvas, translatedContent, targetLang) {
  // Build lookup map
  const translationMap = {};
  for (const item of translatedContent) {
    translationMap[item.uid] = item;
  }

  // Apply translations
  for (const [uid, meta] of Object.entries(canvas.metadataSet)) {
    const translated = translationMap[uid];
    if (!translated) continue;

    const fields = translated.fields;

    if (fields.name) meta.name = fields.name;
    if (fields.text) meta.text = transformLanguageInstruction(fields.text, targetLang);
    if (fields.coreContext) meta.coreContext = fields.coreContext;
    if (fields.prologue) meta.prologue = fields.prologue;
    if (fields.prologueGuide) meta.prologueGuide = fields.prologueGuide;
    if (fields.variableName) meta.variableName = fields.variableName;
    if (fields.initialValue) meta.initialValue = fields.initialValue;
    if (fields.achievementName) meta.achievementName = fields.achievementName;
    if (fields.description) meta.description = fields.description;
    if (fields.statusTitle) meta.statusTitle = fields.statusTitle;
    if (fields.htmlContent) meta.htmlContent = fields.htmlContent;

    if (fields.entries && meta.entries) {
      meta.entries = fields.entries;
    }

    if (fields.imageExplains && meta.images) {
      for (let i = 0; i < fields.imageExplains.length && i < meta.images.length; i++) {
        if (fields.imageExplains[i]) {
          meta.images[i].explain = fields.imageExplains[i];
        }
      }
    }
  }

  // Translate tagCategorization
  if (canvas.canvas.tagCategorization) {
    // This would need another Claude call for proper translation
    // For now, keep as-is
  }

  return canvas;
}

/**
 * Check if text is primarily English
 */
function isEnglish(text) {
  if (!text) return false;
  const englishChars = text.match(/[a-zA-Z]/g) || [];
  const totalChars = text.replace(/[\s\d\p{P}]/gu, '').length;
  return totalChars > 0 && (englishChars.length / totalChars) > 0.7;
}

/**
 * Transform language instructions in text to target language
 */
function transformLanguageInstruction(text, targetLang) {
  if (!text) return text;

  const patterns = [
    { regex: /한국어로\s*(작성|출력|생성|응답)/gi, lang: 'ko' },
    { regex: /한글로\s*(작성|출력|생성|응답)/gi, lang: 'ko' },
    { regex: /日本語で\s*(書く|出力|生成|応答)/gi, lang: 'ja' },
    { regex: /(?:write|output|respond|generate)\s+(?:in|using)\s+(?:korean|japanese|english)/gi, lang: 'en' },
  ];

  let result = text;
  const targetInstruction = LANG_CONFIG[targetLang]?.instruction;

  for (const { regex } of patterns) {
    result = result.replace(regex, targetInstruction);
  }

  return result;
}
