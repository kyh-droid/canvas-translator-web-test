#!/usr/bin/env node
/**
 * Test Translation Script
 *
 * Tests the translation pipeline with a sample canvas.
 * Use this to verify your setup before deploying.
 *
 * Usage:
 *   node scripts/test-translation.js
 *   node scripts/test-translation.js --lang en    # Default target language
 *   node scripts/test-translation.js --lang ja    # Japanese
 *   node scripts/test-translation.js --full       # Full pipeline test (requires API keys)
 */

import { extractCanvas } from '../src/extract.js';
import { validateCanvas } from '../src/validate.js';
import { mergeTranslations } from '../src/merge.js';

// Sample canvas for testing
const SAMPLE_CANVAS = {
  exportVersion: 2,
  exportedAt: new Date().toISOString(),
  sourceContentOid: null,
  sourceCanvasOid: null,
  bucketRegion: 'ap-northeast-2',
  canvas: {
    canvasLanguage: 'ko',
    compilerVersion: 4,
    imageTaggingMethod: 2,
    embeddingService: 'gemini',
    embeddingModel: 'gemini-embedding-001',
    useKRJPGuidelines: false,
    tagCategorization: { categories: [] },
  },
  nodes: [
    { uid: 'story-001', type: 'story', coordinates: { x: 0, y: 0 } },
    { uid: 'char-001', type: 'character', coordinates: { x: 200, y: 0 } },
    { uid: 'text-001', type: 'text', coordinates: { x: 400, y: 0 } },
    { uid: 'var-001', type: 'variable', coordinates: { x: 0, y: 200 } },
    { uid: 'lore-001', type: 'lorebook', coordinates: { x: 200, y: 200 } },
  ],
  connections: [
    { sourceUid: 'story-001', targetUid: 'char-001' },
    { sourceUid: 'char-001', targetUid: 'text-001' },
  ],
  metadataSet: {
    'story-001': {
      type: 'story',
      name: '마법의 숲',
      coreContext: '이것은 마법의 숲에서 펼쳐지는 판타지 이야기입니다. 주인공은 용감한 모험가로서 다양한 캐릭터들을 만나게 됩니다.',
      prologue: '어느 날, 당신은 신비로운 숲의 입구에 서 있습니다. 바람이 나뭇잎을 스치며 속삭이는 소리가 들립니다.',
      prologueGuide: '캐릭터를 소개하고 첫 번째 선택을 제시하세요.',
      text: '마법의 숲에서 펼쳐지는 모험 이야기입니다.',
    },
    'char-001': {
      type: 'character',
      name: '엘라',
      text: '엘라는 숲의 요정입니다. 그녀는 친절하고 호기심이 많으며, 모험가들을 도와주는 것을 좋아합니다. 그녀의 목소리는 맑고 부드럽습니다.',
    },
    'text-001': {
      type: 'text',
      name: '엘라 말투',
      title: '엘라의 말투 가이드',
      text: '엘라는 항상 밝고 긍정적인 어조로 말합니다. "안녕하세요~" 처럼 물결표를 자주 사용합니다.',
    },
    'var-001': {
      type: 'variable',
      variableName: '호감도',
      initialValue: '0',
    },
    'lore-001': {
      type: 'lorebook',
      name: '세계관 설정',
      entries: [
        {
          key: '마법의 숲',
          text: '고대부터 존재하는 신비로운 숲. 다양한 마법 생물들이 살고 있다.',
          patterns: ['마법의 숲', '신비로운 숲'],
        },
        {
          key: '요정족',
          text: '숲에 사는 작은 날개를 가진 종족. 자연과 깊은 유대를 가지고 있다.',
          patterns: ['요정', '요정족'],
        },
      ],
    },
  },
};

// Mock translated batches (simulating Claude API response)
function createMockTranslation(batches, targetLang) {
  const translations = {
    en: {
      'story-001': {
        uid: 'story-001',
        type: 'story',
        name: 'The Enchanted Forest',
        coreContext: 'This is a fantasy story set in a magical forest. The protagonist is a brave adventurer who meets various characters.',
        prologue: 'One day, you find yourself standing at the entrance of a mysterious forest. You hear the wind whispering through the leaves.',
        prologueGuide: 'Introduce the character and present the first choice.',
        text: 'An adventure story in the magical forest.',
      },
      'char-001': {
        uid: 'char-001',
        type: 'character',
        name: 'Ella',
        text: 'Ella is a forest fairy. She is kind and curious, and loves helping adventurers. Her voice is clear and gentle.',
      },
      'text-001': {
        uid: 'text-001',
        type: 'text',
        name: 'Ella Speech Style',
        title: "Ella's Speech Guide",
        text: 'Ella always speaks in a bright and positive tone. She often uses tildes like "Hello~".',
      },
      'var-001': {
        uid: 'var-001',
        type: 'variable',
        variableName: 'Affection',
        initialValue: '0',
      },
      'lore-001': {
        uid: 'lore-001',
        type: 'lorebook',
        name: 'World Settings',
        entries: [
          {
            key: 'Enchanted Forest',
            text: 'A mysterious forest that has existed since ancient times. Various magical creatures live here.',
            patterns: ['enchanted forest', 'mysterious forest'],
          },
          {
            key: 'Fairy Folk',
            text: 'A small winged race living in the forest. They have a deep connection with nature.',
            patterns: ['fairy', 'fairy folk'],
          },
        ],
      },
    },
    ja: {
      'story-001': {
        uid: 'story-001',
        type: 'story',
        name: '魔法の森',
        coreContext: 'これは魔法の森で繰り広げられるファンタジー物語です。主人公は勇敢な冒険者として、様々なキャラクターと出会います。',
        prologue: 'ある日、あなたは神秘的な森の入り口に立っています。風が木の葉をかすめ、ささやく音が聞こえます。',
        prologueGuide: 'キャラクターを紹介し、最初の選択肢を提示してください。',
        text: '魔法の森で繰り広げられる冒険物語です。',
      },
      'char-001': {
        uid: 'char-001',
        type: 'character',
        name: 'エラ',
        text: 'エラは森の妖精です。彼女は親切で好奇心旺盛で、冒険者を助けることが好きです。彼女の声は澄んでいて柔らかいです。',
      },
      'text-001': {
        uid: 'text-001',
        type: 'text',
        name: 'エラの口調',
        title: 'エラの話し方ガイド',
        text: 'エラはいつも明るくポジティブな口調で話します。「こんにちは〜」のように波線をよく使います。',
      },
      'var-001': {
        uid: 'var-001',
        type: 'variable',
        variableName: '好感度',
        initialValue: '0',
      },
      'lore-001': {
        uid: 'lore-001',
        type: 'lorebook',
        name: '世界観設定',
        entries: [
          {
            key: '魔法の森',
            text: '古代から存在する神秘的な森。様々な魔法生物が住んでいる。',
            patterns: ['魔法の森', '神秘の森'],
          },
          {
            key: '妖精族',
            text: '森に住む小さな翼を持つ種族。自然と深い絆を持っている。',
            patterns: ['妖精', '妖精族'],
          },
        ],
      },
    },
  };

  // Build translated batches from mock data
  const mockTranslated = translations[targetLang] || translations.en;
  const result = {};

  for (const [batchName, nodes] of Object.entries(batches)) {
    result[batchName] = nodes.map(node => mockTranslated[node.uid] || node);
  }

  return result;
}

async function runTest() {
  const args = process.argv.slice(2);
  const targetLang = args.includes('--lang')
    ? args[args.indexOf('--lang') + 1] || 'en'
    : 'en';
  const fullTest = args.includes('--full');

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CANVAS TRANSLATION TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Source Language: Korean (ko)`);
  console.log(`  Target Language: ${targetLang}`);
  console.log(`  Mode: ${fullTest ? 'Full (requires API keys)' : 'Mock (no API calls)'}`);
  console.log('');

  try {
    // Step 1: Extract
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  Step 1: Extract');
    console.log('───────────────────────────────────────────────────────────────');

    const extracted = extractCanvas(SAMPLE_CANVAS);

    console.log('  ✓ Extraction complete');
    console.log(`    - Story core: ${extracted.batches.storyCore.length} nodes`);
    console.log(`    - Variables: ${extracted.batches.variables.length} nodes`);
    console.log(`    - Characters: ${extracted.batches.characters.length} nodes`);
    console.log(`    - Character text: ${extracted.batches.characterText.length} nodes`);
    console.log(`    - Content: ${extracted.batches.content.length} nodes`);
    console.log(`    - System: ${extracted.batches.system.length} nodes`);
    console.log('');

    // Step 2: Translate (mock or real)
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  Step 2: Translate');
    console.log('───────────────────────────────────────────────────────────────');

    let translatedBatches;

    if (fullTest) {
      console.log('  Calling Claude API...');
      const { translateAllBatches } = await import('../src/translate.js');
      const result = await translateAllBatches(extracted, targetLang, (batch, current, total) => {
        if (current === total) {
          console.log(`    ✓ ${batch}: ${total} nodes`);
        }
      });
      translatedBatches = result.translatedBatches;
    } else {
      console.log('  Using mock translations...');
      translatedBatches = createMockTranslation(extracted.batches, targetLang);
      console.log('  ✓ Mock translation complete');
    }
    console.log('');

    // Step 3: Merge
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  Step 3: Merge');
    console.log('───────────────────────────────────────────────────────────────');

    const { canvas: translatedCanvas, stats } = mergeTranslations(
      SAMPLE_CANVAS,
      translatedBatches,
      extracted.context,
      targetLang
    );

    console.log('  ✓ Merge complete');
    console.log(`    - Applied: ${stats.applied} nodes`);
    console.log(`    - Skipped: ${stats.skipped} nodes`);
    console.log(`    - Canvas language: ${translatedCanvas.canvas.canvasLanguage}`);
    console.log('');

    // Step 4: Validate
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  Step 4: Validate');
    console.log('───────────────────────────────────────────────────────────────');

    const validation = validateCanvas(translatedCanvas, 'ko');

    if (validation.passed) {
      console.log('  ✓ Validation PASSED');
    } else {
      console.log('  ⚠ Validation warnings:');
      for (const error of validation.errors) {
        console.log(`    - ${error.type}: ${error.message}`);
      }
    }
    console.log('');

    // Show sample output
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  Sample Output');
    console.log('───────────────────────────────────────────────────────────────');

    const storyMeta = translatedCanvas.metadataSet['story-001'];
    console.log(`  Story Name: ${storyMeta.name}`);
    console.log(`  Prologue: ${storyMeta.prologue?.substring(0, 80)}...`);

    const charMeta = translatedCanvas.metadataSet['char-001'];
    console.log(`  Character: ${charMeta.name}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    if (!fullTest) {
      console.log('  To run with actual Claude API:');
      console.log('    node scripts/test-translation.js --full');
      console.log('');
      console.log('  Make sure ANTHROPIC_API_KEY is set in your environment.');
      console.log('');
    }
  } catch (error) {
    console.error('');
    console.error('  ❌ Test failed:', error.message);
    console.error('');
    process.exit(1);
  }
}

runTest();
