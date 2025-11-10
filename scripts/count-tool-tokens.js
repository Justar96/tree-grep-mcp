/**
 * Calculate token counts for all tool descriptions
 *
 * This helps understand the context window cost when tools are registered with MCP hosts.
 *
 * Latest AI Models (2025):
 * - GPT-5 (OpenAI): 400K context window, o200k_base encoding
 * - Claude Sonnet 4.5 (Anthropic): 200K context window (1M with beta header)
 * - Grok 4 (xAI): 2M context window
 * - Gemini 2.5 Pro (Google): 1M context window
 *
 * Token Counting Methods:
 * - OpenAI GPT-5: Uses tiktoken with o200k_base encoding
 * - Anthropic Claude: Uses native count_tokens API
 * - xAI Grok: Uses similar tokenization to GPT models
 * - Google Gemini: Uses SentencePiece tokenizer
 * - Approximation: ~4 characters per token (fallback, ±20% variance)
 *
 * For production use, install:
 * - npm install gpt-tokenizer (for OpenAI/xAI models)
 * - npm install @anthropic-ai/sdk (for Claude models with count_tokens API)
 * - npm install @google/generative-ai (for Gemini models)
 *
 * References:
 * - OpenAI GPT-5: https://platform.openai.com/docs/models/gpt-5
 * - Anthropic Claude: https://docs.anthropic.com/en/docs/build-with-claude/token-counting
 * - xAI Grok 4: https://docs.x.ai/docs/models
 * - Google Gemini: https://ai.google.dev/gemini-api/docs/models
 */

import { SearchTool } from '../build/tools/search.js';
import { ScanTool } from '../build/tools/scan.js';
import { ReplaceTool } from '../build/tools/replace.js';

// Token counter with multiple methods for latest 2025 models
function estimateTokens(text, method = 'approximation') {
  switch (method) {
    case 'gpt5':
    case 'openai':
      // For accurate GPT-5 token counting, install: npm install gpt-tokenizer
      // import { encode } from 'gpt-tokenizer/model/gpt-4o'; // GPT-5 uses o200k_base
      // return encode(text).length;
      console.warn('GPT-5 tiktoken not installed. Using approximation. Install: npm install gpt-tokenizer');
      return Math.ceil(text.length / 4);

    case 'claude':
    case 'anthropic':
      // For accurate Claude Sonnet 4.5 token counting, use the count_tokens API:
      // https://docs.anthropic.com/en/api/messages-count-tokens
      // This requires an API call, so we fall back to approximation for offline use
      console.warn('Claude count_tokens API requires online access. Using approximation.');
      return Math.ceil(text.length / 4);

    case 'grok':
      // Grok 4 uses similar tokenization to GPT models (o200k_base compatible)
      // For accurate counting, use gpt-tokenizer with o200k_base encoding
      console.warn('Grok 4 tokenizer not installed. Using approximation. Install: npm install gpt-tokenizer');
      return Math.ceil(text.length / 4);

    case 'gemini':
      // Gemini 2.5 Pro uses SentencePiece tokenizer
      // For accurate counting, install: npm install @google/generative-ai
      // const { GoogleGenerativeAI } = require('@google/generative-ai');
      // const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      // const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
      // return model.countTokens(text);
      console.warn('Gemini tokenizer not installed. Using approximation. Install: npm install @google/generative-ai');
      return Math.ceil(text.length / 4);

    case 'approximation':
    default:
      // Standard approximation: ~4 characters per token
      // This works reasonably well across all models with ±20% variance
      // GPT-5 (o200k_base), Claude Sonnet 4.5, Grok 4, Gemini 2.5 Pro
      return Math.ceil(text.length / 4);
  }
}

function analyzeToolSchema(toolName, schema, tokenMethod = 'approximation') {
  const schemaJson = JSON.stringify(schema, null, 2);
  const descriptionOnly = schema.description || '';

  const totalChars = schemaJson.length;
  const descChars = descriptionOnly.length;
  const schemaChars = totalChars - descChars;

  const totalTokens = estimateTokens(schemaJson, tokenMethod);
  const descTokens = estimateTokens(descriptionOnly, tokenMethod);
  const schemaTokens = totalTokens - descTokens;

  return {
    name: toolName,
    totalChars,
    descChars,
    schemaChars,
    totalTokens,
    descTokens,
    schemaTokens,
    description: descriptionOnly,
    tokenMethod
  };
}

function printToolAnalysis(analysis) {
  const descPct = ((analysis.descTokens / analysis.totalTokens) * 100).toFixed(1);
  const schemaPct = ((analysis.schemaTokens / analysis.totalTokens) * 100).toFixed(1);

  console.log(`\n┌─ ${analysis.name} ${'─'.repeat(70 - analysis.name.length)}`);
  console.log(`│ Total: ${analysis.totalTokens.toLocaleString()} tokens (${analysis.totalChars.toLocaleString()} chars)`);
  console.log(`│ ├─ Description: ${analysis.descTokens.toLocaleString()} tokens (${descPct}%)`);
  console.log(`│ └─ Schema: ${analysis.schemaTokens.toLocaleString()} tokens (${schemaPct}%)`);
  console.log(`└${'─'.repeat(75)}`);
}

function printSummary(analyses) {
  const totalTokens = analyses.reduce((sum, a) => sum + a.totalTokens, 0);
  const totalDescTokens = analyses.reduce((sum, a) => sum + a.descTokens, 0);
  const totalSchemaTokens = analyses.reduce((sum, a) => sum + a.schemaTokens, 0);
  const totalChars = analyses.reduce((sum, a) => sum + a.totalChars, 0);

  console.log(`\n╔${'═'.repeat(78)}╗`);
  console.log(`║ 📊 SUMMARY - All Tools${' '.repeat(52)}║`);
  console.log(`╠${'═'.repeat(78)}╣`);
  console.log(`║ Total: ${totalTokens.toLocaleString()} tokens (${totalChars.toLocaleString()} chars)${' '.repeat(78 - 30 - totalTokens.toLocaleString().length - totalChars.toLocaleString().length)}║`);
  console.log(`║ • Descriptions: ${totalDescTokens.toLocaleString()} tokens${' '.repeat(78 - 30 - totalDescTokens.toLocaleString().length)}║`);
  console.log(`║ • Schemas: ${totalSchemaTokens.toLocaleString()} tokens${' '.repeat(78 - 25 - totalSchemaTokens.toLocaleString().length)}║`);
  console.log(`║ • Average per tool: ~${Math.round(totalTokens / 3).toLocaleString()} tokens${' '.repeat(78 - 36 - Math.round(totalTokens / 3).toLocaleString().length)}║`);
  console.log(`╚${'═'.repeat(78)}╝`);

  // Tool ranking
  console.log(`\n┌─ Tool Ranking by Token Cost ${'─'.repeat(44)}`);
  const sorted = [...analyses].sort((a, b) => b.totalTokens - a.totalTokens);
  sorted.forEach((a, i) => {
    const pct = ((a.totalTokens / totalTokens) * 100).toFixed(1);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    console.log(`│ ${medal} ${a.name.padEnd(15)} ${a.totalTokens.toLocaleString().padStart(6)} tokens (${pct.padStart(4)}%)`);
  });
  console.log(`└${'─'.repeat(75)}`);

  // Latest models only (2025)
  console.log(`\n╔${'═'.repeat(78)}╗`);
  console.log(`║ 🚀 Context Window Impact - Latest 2025 Models${' '.repeat(31)}║`);
  console.log(`╠${'═'.repeat(78)}╣`);

  const models = [
    { name: 'GPT-5', provider: 'OpenAI', context: 400000, icon: '🤖' },
    { name: 'Claude Sonnet 4.5', provider: 'Anthropic', context: 200000, icon: '🧠', note: '(1M with beta)' },
    { name: 'Grok 4', provider: 'xAI', context: 2000000, icon: '⚡' },
    { name: 'Gemini 2.5 Pro', provider: 'Google', context: 1000000, icon: '💎' }
  ];

  models.forEach(model => {
    const pct = ((totalTokens / model.context) * 100).toFixed(2);
    const barLength = Math.min(Math.ceil(parseFloat(pct) * 2), 30);
    const bar = '█'.repeat(barLength) + '░'.repeat(30 - barLength);
    const contextStr = `${(model.context / 1000).toLocaleString()}K`;
    console.log(`║ ${model.icon} ${model.name.padEnd(20)} ${contextStr.padStart(6)} │ ${pct.padStart(5)}% ${bar} ║`);
  });

  console.log(`╚${'═'.repeat(78)}╝`);

  console.log(`\n💡 Token Counting: ${analyses[0]?.tokenMethod || 'approximation'} (±20% variance)`);
  console.log(`\n📦 For accurate counting, install:`);
  console.log(`   • GPT-5/Grok 4:      npm install gpt-tokenizer`);
  console.log(`   • Claude Sonnet 4.5: npm install @anthropic-ai/sdk`);
  console.log(`   • Gemini 2.5 Pro:    npm install @google/generative-ai`);
  console.log(`\n📚 References:`);
  console.log(`   • GPT-5:             https://platform.openai.com/docs/models/gpt-5`);
  console.log(`   • Claude Sonnet 4.5: https://www.anthropic.com/claude/sonnet`);
  console.log(`   • Grok 4:            https://docs.x.ai/docs/models`);
  console.log(`   • Gemini 2.5 Pro:    https://ai.google.dev/gemini-api/docs/models\n`);
}

// Analyze all tools
console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
console.log('║ 🔍 MCP Tool Token Analysis - Latest 2025 AI Models                           ║');
console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
console.log('║ 🤖 GPT-5 (OpenAI)           │ 400K context                                   ║');
console.log('║ 🧠 Claude Sonnet 4.5         │ 200K context (1M with beta)                   ║');
console.log('║ ⚡ Grok 4 (xAI)              │ 2M context                                     ║');
console.log('║ 💎 Gemini 2.5 Pro (Google)   │ 1M context                                     ║');
console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
console.log('║ Method: approximation (4 chars/token, ±20% variance)                         ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

const searchSchema = SearchTool.getSchema();
const scanSchema = ScanTool.getSchema();
const replaceSchema = ReplaceTool.getSchema();

// Token counting method options:
// 'approximation' (default) | 'gpt5' | 'claude' | 'grok' | 'gemini'
const tokenMethod = 'approximation';

const analyses = [
  analyzeToolSchema('ast_search', searchSchema, tokenMethod),
  analyzeToolSchema('ast_run_rule', scanSchema, tokenMethod),
  analyzeToolSchema('ast_replace', replaceSchema, tokenMethod)
];

// Print detailed analysis for each tool
analyses.forEach(printToolAnalysis);

// Print summary
printSummary(analyses);

// Export for programmatic use
console.log('✅ Analysis complete!\n');
