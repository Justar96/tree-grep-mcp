/**
 * Calculate token counts for all tool descriptions
 * 
 * This helps understand the context window cost when tools are registered with MCP hosts.
 * Uses a simple approximation: 1 token ≈ 4 characters (GPT standard estimate)
 */

import { SearchTool } from '../build/tools/search.js';
import { ScanTool } from '../build/tools/scan.js';
import { ReplaceTool } from '../build/tools/replace.js';

// Simple token counter (approximation)
function estimateTokens(text) {
  // GPT tokenization approximation: ~4 characters per token on average
  // More accurate would be to use tiktoken, but this gives a good estimate
  return Math.ceil(text.length / 4);
}

function analyzeToolSchema(toolName, schema) {
  const schemaJson = JSON.stringify(schema, null, 2);
  const descriptionOnly = schema.description || '';
  
  const totalChars = schemaJson.length;
  const descChars = descriptionOnly.length;
  const schemaChars = totalChars - descChars;
  
  const totalTokens = estimateTokens(schemaJson);
  const descTokens = estimateTokens(descriptionOnly);
  const schemaTokens = totalTokens - descTokens;
  
  return {
    name: toolName,
    totalChars,
    descChars,
    schemaChars,
    totalTokens,
    descTokens,
    schemaTokens,
    description: descriptionOnly
  };
}

function printToolAnalysis(analysis) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Tool: ${analysis.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`\nDescription:`);
  console.log(`  Characters: ${analysis.descChars.toLocaleString()}`);
  console.log(`  Tokens (est): ${analysis.descTokens.toLocaleString()}`);
  console.log(`\nSchema (properties, types, etc):`);
  console.log(`  Characters: ${analysis.schemaChars.toLocaleString()}`);
  console.log(`  Tokens (est): ${analysis.schemaTokens.toLocaleString()}`);
  console.log(`\nTotal (description + schema):`);
  console.log(`  Characters: ${analysis.totalChars.toLocaleString()}`);
  console.log(`  Tokens (est): ${analysis.totalTokens.toLocaleString()}`);
  
  // Token percentage breakdown
  const descPct = ((analysis.descTokens / analysis.totalTokens) * 100).toFixed(1);
  const schemaPct = ((analysis.schemaTokens / analysis.totalTokens) * 100).toFixed(1);
  console.log(`\nBreakdown:`);
  console.log(`  Description: ${descPct}%`);
  console.log(`  Schema: ${schemaPct}%`);
}

function printSummary(analyses) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`SUMMARY - All Tools`);
  console.log(`${'='.repeat(80)}`);
  
  const totalTokens = analyses.reduce((sum, a) => sum + a.totalTokens, 0);
  const totalDescTokens = analyses.reduce((sum, a) => sum + a.descTokens, 0);
  const totalSchemaTokens = analyses.reduce((sum, a) => sum + a.schemaTokens, 0);
  const totalChars = analyses.reduce((sum, a) => sum + a.totalChars, 0);
  
  console.log(`\nTotal Context Window Cost:`);
  console.log(`  All 3 tools: ~${totalTokens.toLocaleString()} tokens`);
  console.log(`  Descriptions only: ~${totalDescTokens.toLocaleString()} tokens`);
  console.log(`  Schemas only: ~${totalSchemaTokens.toLocaleString()} tokens`);
  console.log(`  Total characters: ${totalChars.toLocaleString()}`);
  
  console.log(`\nPer-tool average:`);
  console.log(`  ~${Math.round(totalTokens / 3).toLocaleString()} tokens per tool`);
  
  console.log(`\nTool ranking by token cost:`);
  const sorted = [...analyses].sort((a, b) => b.totalTokens - a.totalTokens);
  sorted.forEach((a, i) => {
    const pct = ((a.totalTokens / totalTokens) * 100).toFixed(1);
    console.log(`  ${i + 1}. ${a.name}: ${a.totalTokens.toLocaleString()} tokens (${pct}%)`);
  });
  
  console.log(`\nContext window impact:`);
  console.log(`  Claude 3.5 Sonnet (200K context): ${((totalTokens / 200000) * 100).toFixed(2)}%`);
  console.log(`  GPT-4 Turbo (128K context): ${((totalTokens / 128000) * 100).toFixed(2)}%`);
  console.log(`  GPT-4 (8K context): ${((totalTokens / 8000) * 100).toFixed(2)}%`);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Note: Token estimates use 4 chars/token approximation`);
  console.log(`Actual tokens may vary by ±20% depending on tokenizer`);
  console.log(`${'='.repeat(80)}\n`);
}

// Analyze all tools
console.log('\n🔍 Analyzing tool descriptions for context window cost...\n');

const searchSchema = SearchTool.getSchema();
const scanSchema = ScanTool.getSchema();
const replaceSchema = ReplaceTool.getSchema();

const analyses = [
  analyzeToolSchema('ast_search', searchSchema),
  analyzeToolSchema('ast_run_rule', scanSchema),
  analyzeToolSchema('ast_replace', replaceSchema)
];

// Print detailed analysis for each tool
analyses.forEach(printToolAnalysis);

// Print summary
printSummary(analyses);

// Export for programmatic use
console.log('\n📊 Detailed breakdown saved for analysis\n');
