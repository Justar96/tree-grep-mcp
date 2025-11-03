import { ValidationError } from '../types/errors.js';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Pattern validation utilities for ast-grep patterns
 * 
 * Validation utilities for ast-grep patterns including metavariable extraction,
 * naming convention validation, and pattern correctness checks.
 */
export class PatternValidator {
  /**
   * Validate metavariable naming convention (must be UPPER_CASE)
   */
  static validateMetavariableName(name: string): boolean {
    return /^[A-Z_][A-Z0-9_]*$/.test(name);
  }

  /**
   * Extract all metavariables from a pattern
   */
  static extractMetavariables(pattern: string): Set<string> {
    const metavars = new Set<string>();
    
    // Extract multi-node metavariables ($$$NAME)
    const multiRegex = /\$\$\$([A-Z_][A-Z0-9_]*)/g;
    let match;
    while ((match = multiRegex.exec(pattern)) !== null) {
      metavars.add(match[1]);
    }
    
    // Extract single-node metavariables ($NAME)
    const singleRegex = /\$([A-Z_][A-Z0-9_]*)/g;
    while ((match = singleRegex.exec(pattern)) !== null) {
      // Skip if it's part of a multi-metavar (check 2 chars before)
      const beforeIndex = Math.max(0, match.index - 2);
      if (!pattern.substring(beforeIndex, match.index).includes('$$')) {
        metavars.add(match[1]);
      }
    }
    
    return metavars;
  }

  /**
   * Validate an ast-grep pattern for common issues
   */
  static validatePattern(pattern: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for empty pattern
    if (!pattern || pattern.trim().length === 0) {
      errors.push('Pattern cannot be empty');
      return { valid: false, errors, warnings };
    }
    
    // Check for bare $$$ (multi-node metavariable without name)
    const bareMultiRegex = /\$\$\$(?![A-Z_][A-Z0-9_]*)/g;
    if (bareMultiRegex.test(pattern)) {
      errors.push('Use named multi-node metavariables like $$$BODY instead of bare $$$');
    }
    
    // Check for invalid metavariable names
    const allMetavarMatches = pattern.match(/\$+[A-Za-z0-9_]+/g) || [];
    for (const metavar of allMetavarMatches) {
      // Extract the name part (after $ or $$$)
      const name = metavar.replace(/^\$+/, '');
      
      // Detect anonymous multi-node metavariable $$$_
      if (metavar.startsWith('$$$') && name === '_') {
        errors.push('Anonymous multi-node metavariable `$$$_` is not allowed. Use a named metavariable (e.g., `$$$ARGS`).');
        continue;
      }
      
      // Skip single-node anonymous metavariable $_
      if (name === '_') continue;
      
      // Check naming convention
      if (!this.validateMetavariableName(name)) {
        errors.push(
          `Invalid metavariable name: ${metavar}. ` +
          `Metavariables must be UPPER_CASE (e.g., $VAR, $MY_VAR, $$$ARGS). ` +
          `Found: ${metavar}`
        );
      }
    }
    
    // Check for common mistakes
    if (pattern.includes('$$$)') && !pattern.includes('($$$')) {
      warnings.push(
        'Multi-node metavariable $$$ appears at end of expression. ' +
        'Ensure it is properly named (e.g., $$$ARGS) and positioned correctly.'
      );
    }
    
    // Warn about very complex patterns
    const metavarCount = (pattern.match(/\$/g) || []).length;
    if (metavarCount > 10) {
      warnings.push(
        `Pattern contains ${metavarCount} metavariables. ` +
        `Very complex patterns may be harder to maintain and debug.`
      );
    }
    
    return { 
      valid: errors.length === 0, 
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Compare metavariables between pattern and replacement/fix
   * Ensures replacement only uses metavariables defined in pattern
   */
  static compareMetavariables(pattern: string, replacement: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const patternMetavars = this.extractMetavariables(pattern);
    const replacementMetavars = this.extractMetavariables(replacement);
    
    // Check for metavariables in replacement that don't exist in pattern
    for (const metavar of replacementMetavars) {
      if (!patternMetavars.has(metavar)) {
        errors.push(
          `Metavariable $${metavar} (or $$$${metavar}) used in replacement ` +
          `but not defined in pattern. Available metavariables: ` +
          `${Array.from(patternMetavars).map(m => `$${m}`).join(', ') || 'none'}`
        );
      }
    }
    
    // Warn if pattern has metavariables not used in replacement (might be intentional)
    const unusedMetavars = Array.from(patternMetavars).filter(m => !replacementMetavars.has(m));
    if (unusedMetavars.length > 0) {
      warnings.push(
        `Pattern metavariables not used in replacement: ` +
        `${unusedMetavars.map(m => `$${m}`).join(', ')}. ` +
        `This may be intentional if you're removing or ignoring parts of the match.`
      );
    }
    
    return { 
      valid: errors.length === 0, 
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
}

/**
 * YAML generation and validation utilities for ast-grep rule files.
 * 
 * Provides utilities for safe YAML string escaping to prevent YAML injection vulnerabilities,
 * and validation of rule format including rule IDs (kebab-case), severity values, and other
 * YAML structure requirements.
 * 
 * Key Features:
 * - Safe string escaping for special characters, YAML keywords, and whitespace
 * - Rule ID format validation (kebab-case convention)
 * - Severity value validation against allowed options (error, warning, info)
 * - Comprehensive error messages with examples and actionable guidance
 */
export class YamlValidator {
  /**
   * Escape a string for safe use in YAML
   */
  static escapeYamlString(str: string): string {
    // Check if string needs quoting
    const needsQuoting = 
      /[:\{\}\[\],&*#?|\-<>=!%@`"']/.test(str) || 
      str.trim() !== str ||
      /^(true|false|null|yes|no|on|off)$/i.test(str) ||
      str.includes('\n') ||
      str.includes('\r') ||
      str.includes('\t');
    
    if (!needsQuoting) {
      return str;
    }
    
    // Use double quotes and escape special characters
    return '"' + str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') + '"';
  }

  /**
   * Validate rule ID format (should be kebab-case)
   */
  static validateRuleId(id: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!id || id.trim().length === 0) {
      errors.push('Rule ID cannot be empty');
      return { valid: false, errors };
    }
    
    // Check for valid kebab-case format
    if (!/^[a-z0-9-]+$/.test(id)) {
      errors.push(
        `Rule ID must contain only lowercase letters, numbers, and hyphens (kebab-case). ` +
        `Found: "${id}". Example: "no-console-log"`
      );
    }
    
    // Warn about very long IDs
    if (id.length > 50) {
      warnings.push(`Rule ID is very long (${id.length} characters). Consider using a shorter, more concise ID.`);
    }
    
    // Warn about starting/ending with hyphen
    if (id.startsWith('-') || id.endsWith('-')) {
      warnings.push('Rule ID should not start or end with a hyphen');
    }
    
    return { 
      valid: errors.length === 0, 
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate severity value
   */
  static validateSeverity(severity: string): ValidationResult {
    const validSeverities = ['error', 'warning', 'info'];
    
    if (!validSeverities.includes(severity)) {
      return {
        valid: false,
        errors: [
          `Invalid severity: "${severity}". ` +
          `Must be one of: ${validSeverities.join(', ')}`
        ]
      };
    }
    
    return { valid: true, errors: [] };
  }
}

/**
 * Parameter validation utilities
 */
export class ParameterValidator {
  /**
   * Validate context parameter
   */
  static validateContext(context: any): ValidationResult {
    const errors: string[] = [];
    
    if (context === undefined || context === null) {
      return { valid: true, errors: [] };
    }
    
    if (typeof context !== 'number') {
      errors.push(`context must be a number. Received type: ${typeof context}. Example: context: 3`);
      return { valid: false, errors };
    }
    
    if (!Number.isFinite(context)) {
      errors.push(`context must be a finite number. Received: ${context}. Example: context: 3`);
      return { valid: false, errors };
    }
    
    if (context < 0) {
      errors.push(`context must be non-negative (0 or greater). Received: ${context}. Valid range: 0-100. Example: context: 3`);
    }
    
    if (context > 100) {
      errors.push(`context cannot exceed 100 lines. Received: ${context}. Valid range: 0-100. Example: context: 10`);
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate maxMatches parameter
   */
  static validateMaxMatches(maxMatches: any): ValidationResult {
    const errors: string[] = [];
    
    if (maxMatches === undefined || maxMatches === null) {
      return { valid: true, errors: [] };
    }
    
    if (typeof maxMatches !== 'number') {
      errors.push(`maxMatches must be a number. Received type: ${typeof maxMatches}. Example: maxMatches: 100`);
      return { valid: false, errors };
    }
    
    if (!Number.isFinite(maxMatches)) {
      errors.push(`maxMatches must be a finite number. Received: ${maxMatches}. Example: maxMatches: 100`);
      return { valid: false, errors };
    }
    
    if (maxMatches <= 0) {
      errors.push(`maxMatches must be a positive number (greater than 0). Received: ${maxMatches}. Valid range: 1-10000. Example: maxMatches: 100`);
    }
    
    if (maxMatches > 10000) {
      errors.push(`maxMatches cannot exceed 10000. Received: ${maxMatches}. Valid range: 1-10000. Consider using a smaller value for better performance. Example: maxMatches: 1000`);
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate timeout parameter
   */
  static validateTimeout(timeoutMs: any): ValidationResult {
    const errors: string[] = [];
    
    if (timeoutMs === undefined || timeoutMs === null) {
      return { valid: true, errors: [] };
    }
    
    if (typeof timeoutMs !== 'number') {
      errors.push(`timeoutMs must be a number. Received type: ${typeof timeoutMs}. Example: timeoutMs: 30000`);
      return { valid: false, errors };
    }
    
    if (!Number.isFinite(timeoutMs)) {
      errors.push(`timeoutMs must be a finite number. Received: ${timeoutMs}. Example: timeoutMs: 30000`);
      return { valid: false, errors };
    }
    
    if (timeoutMs < 1000) {
      errors.push(`timeoutMs must be at least 1000 (1 second). Received: ${timeoutMs}. Valid range: 1000-300000. Example: timeoutMs: 30000`);
    }
    
    if (timeoutMs > 300000) {
      errors.push(`timeoutMs cannot exceed 300000 (5 minutes). Received: ${timeoutMs}. Valid range: 1000-300000. For large codebases, consider narrowing the search scope instead. Example: timeoutMs: 60000`);
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate code parameter
   */
  static validateCode(code: any): ValidationResult {
    const errors: string[] = [];
    
    if (code === undefined || code === null) {
      return { valid: true, errors: [] };
    }
    
    if (typeof code !== 'string') {
      errors.push(`code must be a string. Received type: ${typeof code}. Example: code: "function foo() { return 42; }"`);
      return { valid: false, errors };
    }
    
    if (code.trim().length === 0) {
      errors.push('code parameter cannot be empty. Received empty string or whitespace only. Provide actual code to search or replace. Example: code: "console.log(\\"hello\\")"');
    }
    
    const bytes = Buffer.byteLength(code, 'utf8');
    if (bytes > 1048576) {
      const kb = Math.round(bytes / 1024);
      const mb = (bytes / (1024 * 1024)).toFixed(2);
      errors.push(`code parameter cannot exceed 1MB (1,048,576 bytes). Received: ${bytes} bytes (${kb}KB / ${mb}MB). Consider using file paths instead of inline code for large code snippets.`);
    }
    
    return { valid: errors.length === 0, errors };
  }
}

