import * as path from "path";

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
      if (!pattern.substring(beforeIndex, match.index).includes("$$")) {
        metavars.add(match[1]);
      }
    }

    return metavars;
  }

  /**
   * Detect invalid metavariable placements within identifiers or strings
   * @param pattern - The pattern to check
   * @returns Array of problematic patterns found
   */
  private static detectInvalidMetavariablePlacement(pattern: string): string[] {
    const problems = new Set<string>();

    // Check for lowercase identifier before $ (catches "use$HOOK" but not "LOG($ARG)")
    // Using lowercase ensures we detect embedded patterns, not function names followed by args
    const beforeRegex = /[a-z][a-z0-9_]*\$[A-Z_][A-Z0-9_]*/g;
    let match;
    while ((match = beforeRegex.exec(pattern)) !== null) {
      problems.add(match[0]);
    }

    // Check for lowercase letter immediately after metavariable (catches "$VARname" but not "$VAR1" or "$VAR)")
    // Using lowercase (not digit) ensures we detect embedded patterns while allowing valid digit suffixes
    const afterRegex = /\$[A-Z_][A-Z0-9_]*[a-z]/g;
    while ((match = afterRegex.exec(pattern)) !== null) {
      problems.add(match[0]);
    }

    // Check for metavariables inside string literals (separate regex for each quote type)
    // Require at least 2 consecutive letters to avoid false positives with Rust lifetimes ('a)
    const singleQuoteRegex = /'[^'\n]*[a-zA-Z]{2,}[^'\n]*\$[A-Z_][A-Z0-9_]*[^'\n]*'/g;
    while ((match = singleQuoteRegex.exec(pattern)) !== null) {
      problems.add(match[0]);
    }

    const doubleQuoteRegex = /"[^"\n]*[a-zA-Z]{2,}[^"\n]*\$[A-Z_][A-Z0-9_]*[^"\n]*"/g;
    while ((match = doubleQuoteRegex.exec(pattern)) !== null) {
      problems.add(match[0]);
    }

    const backtickRegex = /`[^`\n]*[a-zA-Z]{2,}[^`\n]*\$[A-Z_][A-Z0-9_]*[^`\n]*`/g;
    while ((match = backtickRegex.exec(pattern)) !== null) {
      problems.add(match[0]);
    }

    return Array.from(problems);
  }

  /**
   * Detect patterns requiring exact AST structure
   * @param pattern - The pattern to check
   * @returns Array of warnings with specific guidance
   */
  private static detectASTStructureRequirements(pattern: string): string[] {
    const warnings: string[] = [];

    // Check for decorators
    const decoratorRegex = /@[A-Za-z_][\w.]*/g;
    if (decoratorRegex.test(pattern)) {
      warnings.push(
        "Pattern contains decorators (@Component, @decorator, etc.). Decorators require exact AST structure matching. " +
          "Consider using structural rules with 'kind' and 'has' constraints instead of simple patterns. " +
          "See: https://ast-grep.github.io/guide/rule-config.html"
      );
    }

    // Check for type annotations
    const typeRegex = /:\s*[^=,\)\n]+/g;
    if (typeRegex.test(pattern)) {
      warnings.push(
        "Pattern contains type annotations. Type hints require exact AST structure. " +
          "Consider using 'kind' rules to match type nodes. " +
          "See: https://ast-grep.github.io/reference/rule.html#kind"
      );
    }

    // Check for modifiers
    const modifierRegex = /(public|private|protected|static|final|const|readonly)\s+\$[A-Z_]/g;
    if (modifierRegex.test(pattern)) {
      warnings.push(
        "Pattern contains modifiers with metavariables. Modifiers may not parse correctly in simple patterns. " +
          "Use structural rules with 'kind' and 'has' constraints. " +
          "See: https://ast-grep.github.io/guide/rule-config/atomic-rule.html#kind"
      );
    }

    return warnings;
  }

  /**
   * Calculate pattern complexity score based on metavariables and length
   * @param pattern - The pattern to analyze
   * @returns Complexity result with score, counts, and classification
   */
  private static calculateComplexityScore(pattern: string): {
    score: number;
    metavarCount: number;
    multiNodeCount: number;
    complexity: "simple" | "moderate" | "complex" | "very_complex";
  } {
    // Extract actual metavariables
    const metavars = this.extractMetavariables(pattern);
    const metavarCount = metavars.size;

    // Count multi-node metavariables
    const multiNodeRegex = /\$\$\$[A-Z_][A-Z0-9_]*/g;
    const multiNodeMatches = pattern.match(multiNodeRegex) || [];
    const multiNodeCount = multiNodeMatches.length;

    // Calculate score
    const score = metavarCount * 1 + multiNodeCount * 2 + pattern.length / 100;

    // Classify complexity
    let complexity: "simple" | "moderate" | "complex" | "very_complex";
    if (score < 5) {
      complexity = "simple";
    } else if (score < 8) {
      complexity = "moderate";
    } else if (score < 11) {
      complexity = "complex";
    } else {
      complexity = "very_complex";
    }

    return { score, metavarCount, multiNodeCount, complexity };
  }

  /**
   * Get language-specific validation warnings
   * @param pattern - The pattern to check
   * @param language - The target programming language (optional)
   * @returns Array of language-specific warnings
   */
  private static getLanguageSpecificWarnings(pattern: string, language?: string): string[] {
    if (!language) return [];

    const warnings: string[] = [];

    // Normalize language aliases to match tool mappings
    const langMap: Record<string, string> = {
      javascript: "js",
      typescript: "ts",
      jsx: "jsx",
      tsx: "tsx",
      python: "py",
      py: "py",
      rust: "rs",
      rs: "rs",
      golang: "go",
      go: "go",
      java: "java",
      "c++": "cpp",
      cpp: "cpp",
      c: "c",
      kotlin: "kt",
      kt: "kt",
    };
    const lower = language.toLowerCase();
    const normalizedLang = langMap[lower] || language.toLowerCase();

    // Python-specific checks
    if (normalizedLang === "py") {
      if (/@[a-zA-Z$_]/.test(pattern)) {
        warnings.push(
          "Python decorators (@decorator) require exact AST structure. " +
            "Use structural rules for reliable matching. " +
            "See: https://ast-grep.github.io/guide/rule-config.html"
        );
      }
      if (/:\s*[A-Z][a-zA-Z0-9_\[\]|]+/.test(pattern)) {
        warnings.push(
          "Python type hints require exact AST structure. " +
            "Consider using 'kind' rules to match type annotation nodes."
        );
      }
    }

    // TypeScript/TSX-specific checks
    if (normalizedLang === "ts" || normalizedLang === "tsx") {
      if (/@[A-Z][a-zA-Z0-9_]*/.test(pattern)) {
        warnings.push(
          "TypeScript decorators require exact AST structure. " +
            "Use structural rules with 'kind' and 'has' constraints for reliable matching."
        );
      }
      if (/<[A-Z$][a-zA-Z0-9_$]*>/.test(pattern) && !pattern.includes("</")) {
        warnings.push(
          "Generic type parameters may require structural rules for complex cases. " +
            "Test pattern thoroughly to ensure it matches intended constructs."
        );
      }
    }

    // Java-specific checks
    if (normalizedLang === "java") {
      if (/@[A-Z][a-zA-Z0-9_]*/.test(pattern)) {
        warnings.push(
          "Java annotations require exact AST structure. " +
            "Use structural rules with 'kind' and 'has' constraints instead of simple patterns."
        );
      }
      if (/(public|private|protected|static|final)\s+\$/.test(pattern)) {
        warnings.push(
          "Java modifiers with metavariables may not parse correctly. " +
            "Use structural rules to match field or method declarations reliably."
        );
      }
    }

    // Rust-specific checks
    if (normalizedLang === "rs") {
      if (/#\[[a-zA-Z]/.test(pattern)) {
        warnings.push(
          "Rust attributes (#[attribute]) require exact AST structure. " +
            "Use structural rules for reliable matching."
        );
      }
      if (/'[a-z]/.test(pattern)) {
        warnings.push("Rust lifetime parameters may require structural rules for complex cases.");
      }
    }

    return warnings;
  }

  /**
   * Detect if pattern is a simple text search that should use grep instead
   * @param pattern - The pattern to check
   * @returns Warning message if pattern is better suited for grep, undefined otherwise
   */
  private static detectSimpleTextSearch(pattern: string): string | undefined {
    // Check if pattern has no metavariables
    const hasMetavariables = /\$+[A-Z_][A-Z0-9_]*/.test(pattern);
    
    // Pattern with only string literals (no code structure)
    const isOnlyStringLiteral = /^["'`][^"'`]*["'`]$/.test(pattern.trim());
    if (isOnlyStringLiteral) {
      return (
        `Pattern is a string literal without code structure. ` +
        `Use grep for string searches: grep "${pattern.replace(/["'`]/g, '')}" ` +
        `ast-grep is for matching code patterns, not string content.`
      );
    }
    
    // Check if pattern has structural elements (excluding quotes for string detection)
    const hasStructuralElements = /[(){}\[\]<>]/.test(pattern);
    
    // Simple string without metavariables or structure
    if (!hasMetavariables && !hasStructuralElements) {
      return (
        `Pattern "${pattern}" appears to be a simple text search without AST structure. ` +
        `For plain text searches, use grep/ripgrep instead - they are faster and more appropriate. ` +
        `ast-grep is designed for structural code patterns with metavariables (e.g., $VAR) or syntax matching. ` +
        `Use ast-grep only when you need to match code structure, not plain text.`
      );
    }
    
    return undefined;
  }

  /**
   * Validate an ast-grep pattern for common issues
   * @param pattern - The pattern to validate
   * @param language - Optional language for language-specific validation
   * @returns Validation result with errors and warnings
   */
  static validatePattern(pattern: string, language?: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for empty pattern
    if (!pattern || pattern.trim().length === 0) {
      errors.push("Pattern cannot be empty");
      return { valid: false, errors, warnings };
    }

    // Detect simple text searches that should use grep instead
    const textSearchWarning = this.detectSimpleTextSearch(pattern);
    if (textSearchWarning) {
      warnings.push(textSearchWarning);
    }

    // Detect invalid metavariable placements
    const invalidPlacements = this.detectInvalidMetavariablePlacement(pattern);
    for (const placement of invalidPlacements) {
      errors.push(
        `Invalid metavariable placement: "${placement}". ` +
          `Metavariables must be complete AST nodes, not embedded in identifiers or strings. ` +
          `Examples of invalid patterns: "obj.on$EVENT", "use$HOOK", "\"Hello $WORLD\"". ` +
          `See: https://ast-grep.github.io/guide/pattern-syntax.html#meta-variable`
      );
    }

    // Check for bare $$$ (multi-node metavariable without name)
    const bareMultiRegex = /\$\$\$(?![A-Z_][A-Z0-9_]*)/g;
    if (bareMultiRegex.test(pattern)) {
      errors.push(
        "Use named multi-node metavariables like $$$BODY instead of bare $$$. " +
          "Bare $$$ is ambiguous and not supported by ast-grep. " +
          "See: https://ast-grep.github.io/guide/pattern-syntax.html#multi-meta-variable"
      );
    }

    // Check for invalid metavariable names
    const allMetavarMatches = pattern.match(/\$+[A-Za-z0-9_]+/g) || [];
    for (const metavar of allMetavarMatches) {
      // Extract the name part (after $ or $$$)
      const name = metavar.replace(/^\$+/, "");

      // Detect anonymous multi-node metavariable $$$_
      if (metavar.startsWith("$$$") && name === "_") {
        errors.push(
          "Anonymous multi-node metavariable `$$$_` is not allowed. Use a named metavariable (e.g., `$$$ARGS`)."
        );
        continue;
      }

      // Skip single-node anonymous metavariable $_
      if (name === "_") continue;

      // Check naming convention
      if (!this.validateMetavariableName(name)) {
        errors.push(
          `Invalid metavariable name: ${metavar}. ` +
            `Metavariables must be UPPER_CASE (e.g., $VAR, $MY_VAR, $ARGS). ` +
            `Found: ${metavar}. ` +
            `Valid examples: $NAME, $VALUE, $PARAMS. ` +
            `See: https://ast-grep.github.io/guide/pattern-syntax.html#meta-variable-capturing`
        );
      }
    }

    // Detect AST structure requirements
    const astWarnings = this.detectASTStructureRequirements(pattern);
    warnings.push(...astWarnings);

    // Add language-specific warnings if language is provided
    if (language) {
      const langWarnings = this.getLanguageSpecificWarnings(pattern, language);
      warnings.push(...langWarnings);
    }

    // Check for common mistakes
    if (pattern.includes("$$$)") && !pattern.includes("($$$")) {
      warnings.push(
        "Multi-node metavariable $$$ appears at end of expression. " +
          "Ensure it is properly named (e.g., $$$ARGS) and positioned correctly. " +
          "Multi-node metavariables match zero or more nodes and should be used in contexts that accept multiple elements. " +
          "See: https://ast-grep.github.io/guide/pattern-syntax.html#multi-meta-variable"
      );
    }

    // Calculate accurate complexity score
    const complexityResult = this.calculateComplexityScore(pattern);

    // Explicit count-based warning for patterns with >10 metavariables
    if (complexityResult.metavarCount > 10) {
      warnings.push(
        `Pattern contains ${complexityResult.metavarCount} metavariables (threshold: 10). ` +
          `Patterns with more than 10 metavariables are considered overly complex and hard to maintain. ` +
          `Consider using multiple rules, adding constraints to narrow matches, or breaking the pattern into smaller components. ` +
          `See: https://ast-grep.github.io/guide/rule-config.html`
      );
    }

    if (complexityResult.complexity === "complex") {
      warnings.push(
        `Pattern complexity: ${complexityResult.complexity} (${complexityResult.metavarCount} metavariables, score: ${complexityResult.score.toFixed(1)}). ` +
          `complex patterns may be harder to maintain and debug. Consider breaking into smaller rules.`
      );
    } else if (complexityResult.complexity === "very_complex") {
      warnings.push(
        `Pattern complexity: ${complexityResult.complexity} (${complexityResult.metavarCount} metavariables, score: ${complexityResult.score.toFixed(1)}). ` +
          `very complex patterns are difficult to maintain. Strongly consider using composite rules with 'all' or 'any'. ` +
          `See: https://ast-grep.github.io/reference/rule.html#all`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
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
            `${
              Array.from(patternMetavars)
                .map((m) => `$${m}`)
                .join(", ") || "none"
            }`
        );
      }
    }

    // Warn if pattern has metavariables not used in replacement (might be intentional)
    const unusedMetavars = Array.from(patternMetavars).filter((m) => !replacementMetavars.has(m));
    if (unusedMetavars.length > 0) {
      warnings.push(
        `Pattern metavariables not used in replacement: ` +
          `${unusedMetavars.map((m) => `$${m}`).join(", ")}. ` +
          `This may be intentional if you're removing or ignoring parts of the match.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
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
      str.includes("\n") ||
      str.includes("\r") ||
      str.includes("\t");

    if (!needsQuoting) {
      return str;
    }

    // Use double quotes and escape special characters
    return (
      '"' +
      str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t") +
      '"'
    );
  }

  /**
   * Validate rule ID format (should be kebab-case)
   */
  static validateRuleId(id: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!id || id.trim().length === 0) {
      errors.push("Rule ID cannot be empty");
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
      warnings.push(
        `Rule ID is very long (${id.length} characters). Consider using a shorter, more concise ID.`
      );
    }

    // Warn about starting/ending with hyphen
    if (id.startsWith("-") || id.endsWith("-")) {
      warnings.push("Rule ID should not start or end with a hyphen");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate severity value
   */
  static validateSeverity(severity: string): ValidationResult {
    const validSeverities = ["error", "warning", "info"];

    if (!validSeverities.includes(severity)) {
      return {
        valid: false,
        errors: [
          `Invalid severity: "${severity}". ` + `Must be one of: ${validSeverities.join(", ")}`,
        ],
      };
    }

    return { valid: true, errors: [] };
  }
}

/**
 * Path normalization and validation utilities for cross-platform path handling.
 *
 * Provides utilities for normalizing Windows paths to forward-slash format
 * (ast-grep preferred format), detecting Windows absolute paths, and handling
 * paths with spaces that require quoting for shell execution.
 *
 * Key Features:
 * - Windows backslash to forward-slash conversion
 * - Windows absolute path detection (drive letters)
 * - UNC path support
 * - Safe POSIX handling (preserves backslashes in filenames on Unix)
 */
export class PathValidator {
  /**
   * Normalize path separators to forward slashes for ast-grep compatibility.
   * Converts Windows backslashes to forward slashes while preserving path structure.
   * Normalizes all backslashes since ast-grep expects forward slashes on all platforms.
   *
   * Handles:
   * - Windows absolute paths: C:\Users -> C:/Users
   * - UNC paths: \\server\share -> //server/share
   * - Mixed separators: C:\Users/project -> C:/Users/project
   * - Unix paths: /home/user -> /home/user (unchanged)
   * - Relative paths with backslashes: src\fixtures -> src/fixtures
   *
   * Usage Contexts:
   * This method is primarily used for internal binary/cache/temp paths created by the
   * binary manager to ensure cross-platform compatibility. User-provided paths from
   * MCP agents are validated by WorkspaceManager and may be normalized separately by
   * individual tools as needed before passing to ast-grep.
   *
   * Note: Node.js fs methods accept both separators on Windows, so normalization
   * is primarily for ast-grep CLI which expects forward slashes on all platforms.
   */
  static normalizePath(inputPath: string): string {
    if (!inputPath || inputPath === "" || inputPath === ".") {
      return inputPath;
    }

    // Always normalize backslashes to forward slashes for ast-grep compatibility
    // ast-grep expects forward slashes on all platforms
    return inputPath.replace(/\\/g, "/");
  }

  /**
   * Detect if a path is a Windows absolute path with drive letter.
   * Matches patterns like C:/, D:\, etc.
   */
  static isWindowsAbsolutePath(inputPath: string): boolean {
    return /^[a-zA-Z]:[/\\]/.test(inputPath);
  }

  /**
   * Detect if a path is absolute across all platforms.
   *
   * This method validates absolute paths for:
   * - Unix/Linux/macOS: Paths starting with `/` (e.g., `/home/user/project`)
   * - Windows: Paths with drive letters (e.g., `C:/Users/project` or `C:\Users\project`)
   * - Windows UNC: Network paths (e.g., `//server/share` or `\\server\share`)
   *
   * Edge cases handled:
   * - Empty strings return false
   * - Relative paths like `.` and `..` return false
   *
   * @param inputPath - The path to check
   * @returns true if the path is absolute on any platform, false otherwise
   *
   * @example
   * isAbsolutePath('/home/user/project')     // true (Unix)
   * isAbsolutePath('C:/Users/project')       // true (Windows)
   * isAbsolutePath('//server/share')         // true (UNC)
   * isAbsolutePath('./relative/path')        // false
   * isAbsolutePath('')                       // false
   */
  static isAbsolutePath(inputPath: string): boolean {
    // Handle edge cases
    if (!inputPath || inputPath === "" || inputPath === "." || inputPath === "..") {
      return false;
    }

    // Check for Windows absolute paths with drive letters (e.g., C:\, D:/)
    // This must be checked before path.isAbsolute() to ensure Windows paths
    // are detected as absolute even on non-Windows platforms
    if (this.isWindowsAbsolutePath(inputPath)) {
      return true;
    }

    // Use Node.js built-in for Unix absolute paths
    // On Unix/Linux, this checks for leading slash (/)
    // On Windows, this handles drive letters and UNC paths
    const isAbsolute = path.isAbsolute(inputPath);
    if (isAbsolute) {
      return true;
    }

    // Additional check for UNC paths (\\server\share or //server/share)
    // path.isAbsolute() on Windows handles UNC paths, but we check explicitly for cross-platform compatibility
    if (inputPath.startsWith("//") || inputPath.startsWith("\\\\")) {
      return true;
    }

    return false;
  }
}

/**
 * Parameter validation utilities
 */
export class ParameterValidator {
  /**
   * Validate context parameter
   */
  static validateContext(context: unknown): ValidationResult {
    const errors: string[] = [];

    if (context === undefined || context === null) {
      return { valid: true, errors: [] };
    }

    if (typeof context !== "number") {
      errors.push(
        `context must be a number. Received type: ${typeof context}. Example: context: 3`
      );
      return { valid: false, errors };
    }

    if (!Number.isFinite(context)) {
      errors.push(`context must be a finite number. Received: ${context}. Example: context: 3`);
      return { valid: false, errors };
    }

    if (context < 0) {
      errors.push(
        `context must be non-negative (0 or greater). Received: ${context}. Valid range: 0-100. Example: context: 3`
      );
    }

    if (context > 100) {
      errors.push(
        `context cannot exceed 100 lines. Received: ${context}. Valid range: 0-100. Example: context: 10`
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate maxMatches parameter
   */
  static validateMaxMatches(maxMatches: unknown): ValidationResult {
    const errors: string[] = [];

    if (maxMatches === undefined || maxMatches === null) {
      return { valid: true, errors: [] };
    }

    if (typeof maxMatches !== "number") {
      errors.push(
        `maxMatches must be a number. Received type: ${typeof maxMatches}. Example: maxMatches: 100`
      );
      return { valid: false, errors };
    }

    if (!Number.isFinite(maxMatches)) {
      errors.push(
        `maxMatches must be a finite number. Received: ${maxMatches}. Example: maxMatches: 100`
      );
      return { valid: false, errors };
    }

    if (maxMatches <= 0) {
      errors.push(
        `maxMatches must be a positive number (greater than 0). Received: ${maxMatches}. Valid range: 1-10000. Example: maxMatches: 100`
      );
    }

    if (maxMatches > 10000) {
      errors.push(
        `maxMatches cannot exceed 10000. Received: ${maxMatches}. Valid range: 1-10000. Consider using a smaller value for better performance. Example: maxMatches: 1000`
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate timeout parameter
   */
  static validateTimeout(timeoutMs: unknown): ValidationResult {
    const errors: string[] = [];

    if (timeoutMs === undefined || timeoutMs === null) {
      return { valid: true, errors: [] };
    }

    if (typeof timeoutMs !== "number") {
      errors.push(
        `timeoutMs must be a number. Received type: ${typeof timeoutMs}. Example: timeoutMs: 30000`
      );
      return { valid: false, errors };
    }

    if (!Number.isFinite(timeoutMs)) {
      errors.push(
        `timeoutMs must be a finite number. Received: ${timeoutMs}. Example: timeoutMs: 30000`
      );
      return { valid: false, errors };
    }

    if (timeoutMs < 1000) {
      errors.push(
        `timeoutMs must be at least 1000 (1 second). Received: ${timeoutMs}. Valid range: 1000-300000. Example: timeoutMs: 30000`
      );
    }

    if (timeoutMs > 300000) {
      errors.push(
        `timeoutMs cannot exceed 300000 (5 minutes). Received: ${timeoutMs}. Valid range: 1000-300000. For large codebases, consider narrowing the search scope instead. Example: timeoutMs: 60000`
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate code parameter
   */
  static validateCode(code: unknown): ValidationResult {
    const errors: string[] = [];

    if (code === undefined || code === null) {
      return { valid: true, errors: [] };
    }

    if (typeof code !== "string") {
      errors.push(
        `code must be a string. Received type: ${typeof code}. Example: code: "function foo() { return 42; }"`
      );
      return { valid: false, errors };
    }

    if (code.trim().length === 0) {
      errors.push(
        'code parameter cannot be empty. Received empty string or whitespace only. Provide actual code to search or replace. Example: code: "console.log(\\"hello\\")"'
      );
    }

    const bytes = Buffer.byteLength(code, "utf8");
    if (bytes > 1048576) {
      const kb = Math.round(bytes / 1024);
      const mb = (bytes / (1024 * 1024)).toFixed(2);
      errors.push(
        `code parameter cannot exceed 1MB (1,048,576 bytes). Received: ${bytes} bytes (${kb}KB / ${mb}MB). Consider using file paths instead of inline code for large code snippets.`
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate constraint kind parameter
   */
  static validateConstraintKind(kind: unknown): ValidationResult {
    const errors: string[] = [];

    if (kind === undefined || kind === null) {
      return { valid: true, errors: [] };
    }

    if (typeof kind !== "string") {
      errors.push(
        `kind must be a string. Received type: ${typeof kind}. Example: kind: "function_declaration"`
      );
      return { valid: false, errors };
    }

    if (kind.trim().length === 0) {
      errors.push(
        'kind parameter cannot be empty. Provide a valid AST node type. Example: kind: "identifier"'
      );
      return { valid: false, errors };
    }

    if (!/^[a-z_]+$/.test(kind)) {
      errors.push(
        `Invalid kind: "${kind}". Must be lowercase with underscores (e.g., 'function_declaration', 'string_literal', 'identifier'). See AST_GREP_DOCUMENTS.md for valid node types.`
      );
    }

    return { valid: errors.length === 0, errors };
  }
}
