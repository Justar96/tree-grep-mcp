import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { AstGrepBinaryManager } from "../core/binary-manager.js";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { ValidationError } from "../types/errors.js";
import {
  PatternValidator,
  YamlValidator,
  ParameterValidator,
  PathValidator,
} from "../utils/validation.js";
import type { Rule } from "../types/rules.js";
import { hasPositiveKey } from "../types/rules.js";

interface WhereConstraint {
  metavariable: string;
  regex?: string;
  equals?: string;
  not_regex?: string;
  not_equals?: string;
  kind?: string;
}

interface ScanParams {
  id: string;
  language: string;
  pattern?: string;
  rule?: Record<string, unknown>;
  where?: WhereConstraint[];
  fix?: string;
  message?: string;
  severity?: "error" | "warning" | "info";
  paths?: string[];
  code?: string;
  timeoutMs?: number;
}

interface FindingLocation {
  file: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface Finding {
  file: string;
  range: FindingLocation;
  line: number;
  column: number;
  message?: string;
  severity?: string;
  ruleId?: string;
  fix?: string;
}

interface ScanResult {
  yaml: string;
  skippedLines: number;
  scan: {
    findings: Finding[];
    summary: {
      totalFindings: number;
      errors: number;
      warnings: number;
      skippedLines: number;
    };
  };
}

/**
 * Rule builder that generates YAML and runs ast-grep scan
 */
export class ScanTool {
  constructor(
    private workspaceManager: WorkspaceManager,
    private binaryManager: AstGrepBinaryManager
  ) {}

  async execute(paramsRaw: Record<string, unknown>): Promise<ScanResult> {
    // Runtime parameter validation with explicit type checking for all fields
    // Validate required parameters
    if (!paramsRaw.id || typeof paramsRaw.id !== "string") {
      throw new ValidationError("id is required and must be a string");
    }
    if (!paramsRaw.language || typeof paramsRaw.language !== "string") {
      throw new ValidationError("language is required and must be a string");
    }

    // Validate optional parameters with explicit type checks
    if (paramsRaw.pattern !== undefined && typeof paramsRaw.pattern !== "string") {
      throw new ValidationError("pattern must be a string");
    }
    if (
      paramsRaw.rule !== undefined &&
      (typeof paramsRaw.rule !== "object" ||
        paramsRaw.rule === null ||
        Array.isArray(paramsRaw.rule))
    ) {
      throw new ValidationError("rule must be an object");
    }
    if (paramsRaw.message !== undefined && typeof paramsRaw.message !== "string") {
      throw new ValidationError("message must be a string");
    }
    if (
      paramsRaw.severity !== undefined &&
      (typeof paramsRaw.severity !== "string" ||
        !["error", "warning", "info"].includes(paramsRaw.severity))
    ) {
      throw new ValidationError('severity must be one of: "error", "warning", "info"');
    }
    if (paramsRaw.fix !== undefined && typeof paramsRaw.fix !== "string") {
      throw new ValidationError("fix must be a string");
    }
    if (paramsRaw.code !== undefined && typeof paramsRaw.code !== "string") {
      throw new ValidationError("code must be a string");
    }
    if (paramsRaw.timeoutMs !== undefined && typeof paramsRaw.timeoutMs !== "number") {
      throw new ValidationError("timeoutMs must be a number");
    }

    // Validate paths array
    if (paramsRaw.paths !== undefined) {
      if (!Array.isArray(paramsRaw.paths)) {
        throw new ValidationError("paths must be an array");
      }
      for (let i = 0; i < paramsRaw.paths.length; i++) {
        if (typeof paramsRaw.paths[i] !== "string") {
          throw new ValidationError(`paths[${i}] must be a string`);
        }
      }
    }

    // Validate where array
    if (paramsRaw.where !== undefined) {
      if (!Array.isArray(paramsRaw.where)) {
        throw new ValidationError("where must be an array");
      }
      for (let i = 0; i < paramsRaw.where.length; i++) {
        const constraint = paramsRaw.where[i];
        if (typeof constraint !== "object" || constraint === null || Array.isArray(constraint)) {
          throw new ValidationError(`where[${i}] must be an object`);
        }
        if (typeof constraint.metavariable !== "string") {
          throw new ValidationError(`where[${i}].metavariable is required and must be a string`);
        }
        if (constraint.regex !== undefined && typeof constraint.regex !== "string") {
          throw new ValidationError(`where[${i}].regex must be a string`);
        }
        if (constraint.equals !== undefined && typeof constraint.equals !== "string") {
          throw new ValidationError(`where[${i}].equals must be a string`);
        }
        if (constraint.not_regex !== undefined && typeof constraint.not_regex !== "string") {
          throw new ValidationError(`where[${i}].not_regex must be a string`);
        }
        if (constraint.not_equals !== undefined && typeof constraint.not_equals !== "string") {
          throw new ValidationError(`where[${i}].not_equals must be a string`);
        }
        if (constraint.kind !== undefined && typeof constraint.kind !== "string") {
          throw new ValidationError(`where[${i}].kind must be a string`);
        }
        
        // Early validation for kind format if present
        if (constraint.kind !== undefined && typeof constraint.kind === "string") {
          const kindValidation = ParameterValidator.validateConstraintKind(constraint.kind);
          if (!kindValidation.valid) {
            throw new ValidationError(`where[${i}].kind: ${kindValidation.errors.join("; ")}`);
          }
        }
      }
    }

    // After validation, safely cast to ScanParams
    const params: ScanParams = {
      id: paramsRaw.id,
      language: paramsRaw.language,
      pattern: paramsRaw.pattern as string | undefined,
      rule: paramsRaw.rule as Record<string, unknown> | undefined,
      message: paramsRaw.message as string | undefined,
      severity: paramsRaw.severity as "error" | "warning" | "info" | undefined,
      fix: paramsRaw.fix as string | undefined,
      code: paramsRaw.code as string | undefined,
      timeoutMs: paramsRaw.timeoutMs as number | undefined,
      paths: paramsRaw.paths as string[] | undefined,
      where: paramsRaw.where as WhereConstraint[] | undefined,
    };

    // Support two modes:
    // Mode 1 (existing): Simple pattern string + optional where constraints
    // Mode 2 (new): Complex rule object with kind, has, inside, all, any, not, matches, etc.
    const hasPattern = params.pattern && typeof params.pattern === "string";
    const hasRule = params.rule && typeof params.rule === "object" && !Array.isArray(params.rule);

    if (!hasPattern && !hasRule) {
      throw new ValidationError(
        "Either pattern (string) or rule (object) is required. " +
          "Use pattern for simple matching, or rule for structural rules with kind, has, inside, etc."
      );
    }

    if (hasPattern && hasRule) {
      throw new ValidationError(
        "Cannot specify both pattern and rule parameters. " +
          "Use pattern for simple matching, or rule for structural rules."
      );
    }

    // Validate rule ID format
    const ruleIdValidation = YamlValidator.validateRuleId(params.id);
    if (!ruleIdValidation.valid) {
      throw new ValidationError(`Invalid rule ID: ${ruleIdValidation.errors.join("; ")}`, {
        errors: ruleIdValidation.errors,
      });
    }

    // Validate pattern (only in simple pattern mode)
    if (hasPattern && params.pattern) {
      const patternValidation = PatternValidator.validatePattern(params.pattern, params.language);
      if (!patternValidation.valid) {
        throw new ValidationError(`Invalid pattern: ${patternValidation.errors.join("; ")}`, {
          errors: patternValidation.errors,
        });
      }

      // Log pattern warnings if any - log each warning individually for better test assertions
      if (patternValidation.warnings && patternValidation.warnings.length > 0) {
        for (const warning of patternValidation.warnings) {
          console.error(`Warning: ${warning}`);
        }
      }
    }

    // Validate rule object (in structural rule mode)
    if (hasRule && params.rule) {
      // Basic validation: rule must have at least one positive key
      if (!hasPositiveKey(params.rule as Rule)) {
        throw new ValidationError(
          "Rule object must have at least one positive key (pattern, kind, regex, inside, has, precedes, follows, all, any, or matches)"
        );
      }

      // If rule has a pattern property, validate it
      if (params.rule.pattern) {
        const pattern = params.rule.pattern as string | Record<string, unknown>;
        if (typeof pattern === "string") {
          const patternValidation = PatternValidator.validatePattern(pattern, params.language);
          if (!patternValidation.valid) {
            throw new ValidationError(
              `Invalid pattern in rule: ${patternValidation.errors.join("; ")}`,
              { errors: patternValidation.errors }
            );
          }
          // Log warnings for rule pattern
          if (patternValidation.warnings && patternValidation.warnings.length > 0) {
            for (const warning of patternValidation.warnings) {
              console.error(`Warning: ${warning}`);
            }
          }
        } else if (typeof pattern === "object" && pattern !== null) {
          // Pattern object validation (selector, context, strictness)
          const patternObj = pattern as Record<string, unknown>;
          if (patternObj.selector && typeof patternObj.selector !== "string") {
            throw new ValidationError("Pattern object selector must be a string");
          }
          if (patternObj.context && typeof patternObj.context !== "string") {
            throw new ValidationError("Pattern object context must be a string");
          }
          if (patternObj.strictness) {
            const validStrictness = ["cst", "smart", "ast", "relaxed", "signature"];
            if (
              typeof patternObj.strictness === "string" &&
              !validStrictness.includes(patternObj.strictness)
            ) {
              throw new ValidationError(
                `Invalid strictness: ${patternObj.strictness}. Must be one of: ${validStrictness.join(", ")}`
              );
            }
          }
        } else {
          throw new ValidationError("Rule pattern must be a string or pattern object");
        }
      }

      // Validate kind if present
      if (params.rule.kind && typeof params.rule.kind !== "string") {
        throw new ValidationError("Rule kind must be a string (tree-sitter node type)");
      }

      // Validate regex if present
      if (params.rule.regex && typeof params.rule.regex !== "string") {
        throw new ValidationError("Rule regex must be a string");
      }
    }

    // Validate severity if provided
    if (params.severity) {
      const severityValidation = YamlValidator.validateSeverity(params.severity);
      if (!severityValidation.valid) {
        throw new ValidationError(severityValidation.errors.join("; "));
      }
    }

    // Validate optional parameters with actionable error messages
    const timeoutValidation = ParameterValidator.validateTimeout(params.timeoutMs);
    if (!timeoutValidation.valid) {
      throw new ValidationError(timeoutValidation.errors.join("; "), {
        errors: timeoutValidation.errors,
      });
    }

    const codeValidation = ParameterValidator.validateCode(params.code);
    if (!codeValidation.valid) {
      throw new ValidationError(codeValidation.errors.join("; "), {
        errors: codeValidation.errors,
      });
    }

    const normalizeLang = (lang: string) => {
      const map: Record<string, string> = {
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
        csharp: "cs",
        cs: "cs",
        kotlin: "kt",
        kt: "kt",
      };
      const lower = (lang || "").toLowerCase();
      return map[lower] || lang;
    };

    // Validate constraints and fix template before mode selection
    // This validation must happen for both run and scan modes
    if (params.where || params.fix) {
      // Extract metavariables from pattern or rule
      let patternMetavars: Set<string> = new Set();
      if (params.pattern) {
        patternMetavars = PatternValidator.extractMetavariables(params.pattern);
      } else if (params.rule) {
        patternMetavars = this.extractAllMetavariables(params.rule);
      }

      // Validate constraints
      if (params.where && params.where.length > 0) {
        for (const constraint of params.where) {
          // Check metavariable exists
          if (!patternMetavars.has(constraint.metavariable)) {
            throw new ValidationError(
              `Constraint references metavariable '${constraint.metavariable}' which is not in the pattern. ` +
                `Available metavariables: ${Array.from(patternMetavars).join(", ") || "none"}`
            );
          }

          // Validate constraint has at least one operator
          const hasRegex = constraint.hasOwnProperty("regex") && typeof constraint.regex === "string" && constraint.regex.trim().length > 0;
          const hasEquals = constraint.hasOwnProperty("equals") && typeof constraint.equals === "string" && constraint.equals.trim().length > 0;
          const hasNotRegex = constraint.hasOwnProperty("not_regex") && typeof constraint.not_regex === "string" && constraint.not_regex.trim().length > 0;
          const hasNotEquals = constraint.hasOwnProperty("not_equals") && typeof constraint.not_equals === "string" && constraint.not_equals.trim().length > 0;

          if (!hasRegex && !hasEquals && !hasNotRegex && !hasNotEquals) {
            throw new ValidationError(
              `Constraint on metavariable '${constraint.metavariable}' must specify at least one operator: regex, equals, not_regex, not_equals, or kind`
            );
          }

          // Validate only one positive operator
          const positiveOps = [hasRegex, hasEquals].filter(Boolean).length;
          if (positiveOps > 1) {
            throw new ValidationError(
              `Constraint on metavariable '${constraint.metavariable}' cannot specify both 'regex' and 'equals'`
            );
          }
        }
      }

      // Validate fix template
      if (params.fix) {
        const fixMetavars = PatternValidator.extractMetavariables(params.fix);
        for (const metavar of fixMetavars) {
          if (!patternMetavars.has(metavar)) {
            throw new ValidationError(
              `Fix template uses metavariable '${metavar}' which is not in the pattern. ` +
                `Available metavariables: ${Array.from(patternMetavars).join(", ") || "none"}`
            );
          }
        }
      }
    }

    // Determine if we should use 'run' or 'scan' mode
    // ast-grep v0.39.7+ requires scan rules to have AST kind specification
    // For simple pattern-only rules without constraints/fix, use 'run' mode
    // Note: run mode doesn't support constraints or fix, so use scan mode if those are present
    const useRunMode = params.pattern && !params.rule && !params.where && !params.fix;
    
    // Generate YAML rule (only needed for scan mode)
    const yaml = useRunMode ? "" : this.buildYaml({ ...params, language: normalizeLang(params.language) });

    // Create temporary rule file with unique name (only for scan mode)
    const tempDir = os.tmpdir();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const rulesFile = useRunMode ? "" : path.join(tempDir, `rule-${Date.now()}-${randomSuffix}.yml`);

    let tempCodeFileForCleanup: string | null = null;
    try {
      if (!useRunMode) {
        await fs.writeFile(rulesFile, yaml, "utf8");
      }

      // Build command based on mode
      const args: string[] = [];
      if (useRunMode) {
        // Use 'run' mode for simple patterns
        args.push("run", "--pattern", params.pattern!.trim(), "--lang", normalizeLang(params.language), "--json=stream");
      } else {
        // Use 'scan' mode for structural rules
        args.push("scan", "--rule", PathValidator.normalizePath(rulesFile), "--json=stream");
      }

      // Add paths or inline code via temp file
      let tempCodeFile: string | null = null;
      if (params.code) {
        const extMap: Record<string, string> = {
          js: "js",
          ts: "ts",
          jsx: "jsx",
          tsx: "tsx",
          py: "py",
          rs: "rs",
          go: "go",
          java: "java",
          cpp: "cpp",
          c: "c",
          kt: "kt",
        };
        const ext = extMap[normalizeLang(params.language)] || "js";
        const randomSuffix = Math.random().toString(36).substring(2, 15);
        tempCodeFile = path.join(
          os.tmpdir(),
          `astgrep-inline-${Date.now()}-${randomSuffix}.${ext}`
        );
        await fs.writeFile(tempCodeFile, params.code, "utf8");
        args.push(PathValidator.normalizePath(tempCodeFile));
        tempCodeFileForCleanup = tempCodeFile;
      } else {
        // Only use "." as default when paths are omitted
        const pathsProvided =
          params.paths && Array.isArray(params.paths) && params.paths.length > 0;
        const inputPaths: string[] = pathsProvided && params.paths ? params.paths : ["."];

        // Warn when scanning entire workspace with default path
        if (!pathsProvided) {
          const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
          const home = process.env.HOME || process.env.USERPROFILE || "";
          
          // Prevent scanning from home directory or common user directories
          if (home && path.resolve(workspaceRoot) === path.resolve(home)) {
            throw new ValidationError(
              `Cannot scan from home directory without explicit paths. Please provide absolute paths to specific directories.`
            );
          }
          
          const normalizedRoot = workspaceRoot.toLowerCase();
          const userDirPatterns = [
            /[/\\]downloads[/\\]?$/i,
            /[/\\]documents[/\\]?$/i,
            /[/\\]desktop[/\\]?$/i,
          ];
          if (userDirPatterns.some((pattern) => pattern.test(normalizedRoot))) {
            throw new ValidationError(
              `Cannot scan from user directory without explicit paths. Please provide absolute paths to specific directories.`
            );
          }
          
          console.error(
            `Warning: No paths provided, scanning entire workspace from root: ${workspaceRoot}`
          );
        }

        // Validate that paths are absolute
        // Only allow "." when it's the default (paths not provided by client)
        for (const p of inputPaths) {
          if (!path.isAbsolute(p)) {
            if (p === "." || p === "") {
              // "." or "" only allowed when paths were not provided (default case)
              if (pathsProvided) {
                throw new ValidationError(
                  `Path must be absolute. Use '/workspace/src/' or 'C:/workspace/src/'`
                );
              }
            } else {
              throw new ValidationError(
                `Path must be absolute. Use '/workspace/src/' or 'C:/workspace/src/'`
              );
            }
          }
        }

        // Normalize paths for ast-grep compatibility (Windows -> forward slashes)
        // Empty strings should be treated as current directory
        const normalizedPaths = inputPaths.map((p) =>
          p === "" ? "." : PathValidator.normalizePath(p)
        );

        // Validate paths for security (but skip validation for default "." path)
        // The "." path is relative and will be resolved by ast-grep in the workspace root
        if (pathsProvided) {
          const { valid, errors } = this.workspaceManager.validatePaths(normalizedPaths);
          if (!valid) {
            // Replace normalized paths in error messages with original paths
            const originalErrors = errors.map((err) => {
              let modifiedErr = err;
              for (let i = 0; i < normalizedPaths.length; i++) {
                if (normalizedPaths[i] !== inputPaths[i]) {
                  modifiedErr = modifiedErr.replace(normalizedPaths[i], inputPaths[i]);
                }
              }
              return modifiedErr;
            });
            throw new ValidationError("Invalid paths", { errors: originalErrors });
          }
        }

        // Pass normalized paths to ast-grep (not absolute resolved paths)
        args.push(...normalizedPaths);
      }

      const result = await this.binaryManager.executeAstGrep(args, {
        cwd: this.workspaceManager.getWorkspaceRoot(),
        timeout: params.timeoutMs || 30000,
      });

      const { findings, skippedLines } = this.parseFindings(result.stdout);

      const resultObj = {
        yaml: useRunMode ? `# Pattern-only rule (using run mode)\npattern: ${params.pattern}\nlanguage: ${normalizeLang(params.language)}` : yaml,
        skippedLines,
        scan: {
          findings,
          summary: {
            totalFindings: findings.length,
            errors: findings.filter((f) => f.severity === "error").length,
            warnings: findings.filter((f) => f.severity === "warning").length,
            skippedLines,
          },
        },
      };

      return resultObj;
    } finally {
      // Cleanup with logging
      const cleanupErrors: string[] = [];

      if (!useRunMode && rulesFile) {
        try {
          await fs.unlink(rulesFile);
        } catch (e) {
          cleanupErrors.push(
            `Failed to cleanup rule file: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      if (tempCodeFileForCleanup) {
        try {
          await fs.unlink(tempCodeFileForCleanup);
        } catch (e) {
          cleanupErrors.push(
            `Failed to cleanup temp code file: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      if (cleanupErrors.length > 0) {
        console.error("Cleanup warnings:", cleanupErrors.join("; "));
      }
    }
  }

  private buildYaml(params: ScanParams): string {
    const lines = [
      `id: ${params.id}`,
      `message: ${YamlValidator.escapeYamlString(params.message || params.id)}`,
      `severity: ${params.severity || "warning"}`,
      `language: ${params.language}`,
      "rule:",
    ];

    // Mode 1: Simple pattern string
    let patternMetavars: Set<string> = new Set();
    if (params.pattern) {
      patternMetavars = PatternValidator.extractMetavariables(params.pattern);
      lines.push(`  pattern: ${YamlValidator.escapeYamlString(params.pattern)}`);
    }
    // Mode 2: Structural rule object
    else if (params.rule) {
      const ruleLines = this.serializeRule(params.rule, 1);
      lines.push(...ruleLines);

      // Extract metavariables from all patterns in the rule (including nested patterns)
      patternMetavars = this.extractAllMetavariables(params.rule);
    }

    // Add simple constraints if provided
    if (params.where && params.where.length > 0) {
      lines.push("constraints:");
      for (const constraint of params.where) {
        // Validate that metavariable exists in pattern
        if (!patternMetavars.has(constraint.metavariable)) {
          throw new ValidationError(
            `Constraint references metavariable '${constraint.metavariable}' which is not in the pattern. ` +
              `Available metavariables: ${Array.from(patternMetavars).join(", ") || "none"}`
          );
        }

        // Validate that constraint provides at least one operator
        const hasRegex =
          constraint.hasOwnProperty("regex") &&
          typeof constraint.regex === "string" &&
          constraint.regex.trim().length > 0;
        const hasEquals =
          constraint.hasOwnProperty("equals") &&
          typeof constraint.equals === "string" &&
          constraint.equals.trim().length > 0;
        const hasNotRegex =
          constraint.hasOwnProperty("not_regex") &&
          typeof constraint.not_regex === "string" &&
          constraint.not_regex.trim().length > 0;
        const hasNotEquals =
          constraint.hasOwnProperty("not_equals") &&
          typeof constraint.not_equals === "string" &&
          constraint.not_equals.trim().length > 0;
        const hasKind =
          constraint.hasOwnProperty("kind") &&
          typeof constraint.kind === "string" &&
          constraint.kind.trim().length > 0;

        if (!hasRegex && !hasEquals && !hasNotRegex && !hasNotEquals && !hasKind) {
          throw new ValidationError(
            `Constraint for metavariable '${constraint.metavariable}' must specify at least one operator: regex, equals, not_regex, not_equals, or kind`
          );
        }

        // Validate kind format early if present
        if (hasKind && constraint.kind) {
          const kindValidation = ParameterValidator.validateConstraintKind(constraint.kind);
          if (!kindValidation.valid) {
            throw new ValidationError(kindValidation.errors.join("; "));
          }
        }

        // Enforce mutual exclusivity for positive operators (regex and equals)
        if (hasRegex && hasEquals) {
          throw new ValidationError(
            `Constraint for metavariable '${constraint.metavariable}' cannot specify both 'regex' and 'equals'. Use one or the other.`
          );
        }

        // Enforce mutual exclusivity for negative operators (not_regex and not_equals)
        if (hasNotRegex && hasNotEquals) {
          throw new ValidationError(
            `Constraint for metavariable '${constraint.metavariable}' cannot specify both 'not_regex' and 'not_equals'. Use one or the other.`
          );
        }

        lines.push(`  ${constraint.metavariable}:`);
        
        // Output positive constraints (at most one due to mutual exclusivity validation)
        if (hasRegex && constraint.regex) {
          lines.push(`    regex: ${YamlValidator.escapeYamlString(constraint.regex)}`);
        } else if (hasEquals && constraint.equals) {
          const trimmed = constraint.equals.trim();
          const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          lines.push(`    regex: ${YamlValidator.escapeYamlString("^" + escaped + "$")}`);
        }
        
        // Output negative constraints with nested not: structure (at most one due to mutual exclusivity)
        if (hasNotRegex && constraint.not_regex) {
          lines.push("    not:");
          lines.push(`      regex: ${YamlValidator.escapeYamlString(constraint.not_regex)}`);
        } else if (hasNotEquals && constraint.not_equals) {
          const trimmed = constraint.not_equals.trim();
          const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          lines.push("    not:");
          lines.push(`      regex: ${YamlValidator.escapeYamlString("^" + escaped + "$")}`);
        }
        
        // Output kind constraint (can be combined with either positive or negative operator)
        if (hasKind && constraint.kind) {
          lines.push(`    kind: ${YamlValidator.escapeYamlString(constraint.kind)}`);
        }
      }
    }

    // Add fix if provided
    if (params.fix) {
      // Validate that fix metavariables exist in pattern
      const fixMetavars = PatternValidator.extractMetavariables(params.fix);
      for (const metavar of fixMetavars) {
        if (!patternMetavars.has(metavar)) {
          throw new ValidationError(
            `Fix template uses metavariable '${metavar}' which is not in the pattern. ` +
              `Available metavariables: ${Array.from(patternMetavars).join(", ") || "none"}`
          );
        }
      }

      lines.push(`fix: ${YamlValidator.escapeYamlString(params.fix)}`);
    }

    return lines.join("\n");
  }

  /**
   * Extract all metavariables from a rule object, including nested patterns
   *
   * @param rule - The rule object to extract metavariables from
   * @returns Set of all metavariables found in the rule
   */
  private extractAllMetavariables(rule: Rule): Set<string> {
    const metavars = new Set<string>();

    // Extract from pattern (string or object with selector)
    if (rule.pattern !== undefined) {
      if (typeof rule.pattern === "string") {
        const extracted = PatternValidator.extractMetavariables(rule.pattern);
        for (const metavar of extracted) {
          metavars.add(metavar);
        }
      } else if (typeof rule.pattern === "object" && rule.pattern !== null) {
        // Pattern object may have selector field
        const patternObj = rule.pattern as Record<string, unknown>;
        if (patternObj.selector && typeof patternObj.selector === "string") {
          const extracted = PatternValidator.extractMetavariables(patternObj.selector);
          for (const metavar of extracted) {
            metavars.add(metavar);
          }
        }
        if (patternObj.context && typeof patternObj.context === "string") {
          const extracted = PatternValidator.extractMetavariables(patternObj.context);
          for (const metavar of extracted) {
            metavars.add(metavar);
          }
        }
      }
    }

    // Extract from regex (may contain metavariables in capture groups, though rare)
    // Note: ast-grep regex typically doesn't use $VAR syntax, but we check for consistency
    if (rule.regex !== undefined && typeof rule.regex === "string") {
      const extracted = PatternValidator.extractMetavariables(rule.regex);
      for (const metavar of extracted) {
        metavars.add(metavar);
      }
    }

    // Extract from relational rules (inside, has, precedes, follows)
    const relationalRules = [rule.inside, rule.has, rule.precedes, rule.follows];
    for (const relRule of relationalRules) {
      if (relRule !== undefined && typeof relRule === "object" && relRule !== null) {
        const nested = this.extractAllMetavariables(relRule as Rule);
        for (const metavar of nested) {
          metavars.add(metavar);
        }
      }
    }

    // Extract from composite rules (all, any)
    if (rule.all !== undefined && Array.isArray(rule.all)) {
      for (const subRule of rule.all) {
        if (typeof subRule === "object" && subRule !== null) {
          const nested = this.extractAllMetavariables(subRule as Rule);
          for (const metavar of nested) {
            metavars.add(metavar);
          }
        }
      }
    }

    if (rule.any !== undefined && Array.isArray(rule.any)) {
      for (const subRule of rule.any) {
        if (typeof subRule === "object" && subRule !== null) {
          const nested = this.extractAllMetavariables(subRule as Rule);
          for (const metavar of nested) {
            metavars.add(metavar);
          }
        }
      }
    }

    // Extract from not rule
    if (rule.not !== undefined && typeof rule.not === "object" && rule.not !== null) {
      const nested = this.extractAllMetavariables(rule.not as Rule);
      for (const metavar of nested) {
        metavars.add(metavar);
      }
    }

    // Extract from matches (may contain metavariables in pattern strings)
    if (rule.matches !== undefined && typeof rule.matches === "string") {
      const extracted = PatternValidator.extractMetavariables(rule.matches);
      for (const metavar of extracted) {
        metavars.add(metavar);
      }
    }

    return metavars;
  }

  /**
   * Serialize a rule object to YAML format with proper indentation
   *
   * @param rule - The rule object to serialize (can contain nested rules)
   * @param indentLevel - Current indentation level (0 = top level, 1 = inside rule:, etc.)
   * @returns Array of YAML lines with proper indentation
   */
  private serializeRule(rule: Rule, indentLevel: number): string[] {
    const lines: string[] = [];
    const indent = "  ".repeat(indentLevel);

    // Atomic rules
    if (rule.pattern !== undefined) {
      const pattern = rule.pattern;
      if (typeof pattern === "string") {
        lines.push(`${indent}pattern: ${YamlValidator.escapeYamlString(pattern)}`);
      } else if (typeof pattern === "object" && pattern !== null) {
        // Pattern object with selector, context, strictness
        lines.push(`${indent}pattern:`);
        if (pattern.selector) {
          lines.push(`${indent}  selector: ${YamlValidator.escapeYamlString(pattern.selector)}`);
        }
        if (pattern.context) {
          lines.push(`${indent}  context: ${YamlValidator.escapeYamlString(pattern.context)}`);
        }
        if (pattern.strictness) {
          lines.push(`${indent}  strictness: ${pattern.strictness}`);
        }
      }
    }

    if (rule.kind !== undefined) {
      lines.push(`${indent}kind: ${rule.kind}`);
    }

    if (rule.regex !== undefined) {
      lines.push(`${indent}regex: ${YamlValidator.escapeYamlString(rule.regex)}`);
    }

    // Relational rules (inside, has, precedes, follows)
    const relationalRules: Array<{ key: string; value: unknown }> = [
      { key: "inside", value: rule.inside },
      { key: "has", value: rule.has },
      { key: "precedes", value: rule.precedes },
      { key: "follows", value: rule.follows },
    ];

    for (const { key, value } of relationalRules) {
      if (value !== undefined) {
        lines.push(`${indent}${key}:`);

        // Serialize nested rule
        const nestedLines = this.serializeRule(value as Rule, indentLevel + 1);
        lines.push(...nestedLines);

        // Add stopBy and field if present in the relational rule
        if (typeof value === "object" && value !== null) {
          const valueObj = value as Record<string, unknown>;
          if (valueObj.stopBy !== undefined) {
            const stopBy = valueObj.stopBy;
            if (typeof stopBy === "string") {
              lines.push(`${indent}  stopBy: ${stopBy}`);
            } else if (typeof stopBy === "object") {
              lines.push(`${indent}  stopBy:`);
              lines.push(...this.serializeRule(stopBy as Rule, indentLevel + 2));
            }
          }
          if (valueObj.field !== undefined) {
            lines.push(`${indent}  field: ${String(valueObj.field)}`);
          }
        }
      }
    }

    // Composite rules (all, any, not, matches)
    if (rule.all !== undefined && Array.isArray(rule.all)) {
      lines.push(`${indent}all:`);
      for (const subRule of rule.all) {
        lines.push(`${indent}  -`);
        const subLines = this.serializeRule(subRule as Rule, indentLevel + 2);
        // Adjust first line to be on same line as dash
        if (subLines.length > 0) {
          const firstLine = subLines[0].trim();
          lines[lines.length - 1] = `${indent}  - ${firstLine}`;
          lines.push(...subLines.slice(1));
        }
      }
    }

    if (rule.any !== undefined && Array.isArray(rule.any)) {
      lines.push(`${indent}any:`);
      for (const subRule of rule.any) {
        lines.push(`${indent}  -`);
        const subLines = this.serializeRule(subRule as Rule, indentLevel + 2);
        if (subLines.length > 0) {
          const firstLine = subLines[0].trim();
          lines[lines.length - 1] = `${indent}  - ${firstLine}`;
          lines.push(...subLines.slice(1));
        }
      }
    }

    if (rule.not !== undefined) {
      lines.push(`${indent}not:`);
      const notLines = this.serializeRule(rule.not as Rule, indentLevel + 1);
      lines.push(...notLines);
    }

    if (rule.matches !== undefined) {
      lines.push(`${indent}matches: ${rule.matches}`);
    }

    return lines;
  }

  /**
   * Resolves file paths to absolute paths.
   * Since input paths are absolute, ast-grep returns absolute paths.
   * STDIN and empty strings are returned as-is.
   */
  private resolveFilePath(filePath: string): string {
    // STDIN and empty paths stay as-is
    if (filePath === "STDIN" || filePath === "") {
      return filePath;
    }
    // If path is already absolute, return as-is
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    // Return unchanged if not absolute (contract: ast-grep returns absolute paths when given absolute inputs)
    return filePath;
  }

  private parseFindings(stdout: string): { findings: Finding[]; skippedLines: number } {
    const findings: Finding[] = [];
    let skippedLines = 0;

    if (!stdout.trim()) return { findings, skippedLines: 0 };

    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const finding = JSON.parse(line) as {
          ruleId?: string;
          severity?: string;
          message?: string;
          file?: string;
          range?: {
            start?: { line?: number; column?: number };
            end?: { line?: number; column?: number };
          };
          fix?: string;
        };
        const startLine = (finding.range?.start?.line || 0) + 1;
        const startColumn = finding.range?.start?.column || 0;
        const resolvedFile = this.resolveFilePath(finding.file || "");
        findings.push({
          ruleId: finding.ruleId || "unknown",
          severity: finding.severity || "info",
          message: finding.message || "",
          file: resolvedFile,
          line: startLine,
          column: startColumn,
          range: {
            file: resolvedFile,
            start: {
              line: startLine,
              column: startColumn,
            },
            end: {
              line: (finding.range?.end?.line || 0) + 1,
              column: finding.range?.end?.column || 0,
            },
          },
          fix: finding.fix,
        });
      } catch {
        skippedLines++;
        console.error(`Warning: Skipped malformed JSON line: ${line.substring(0, 100)}...`);
      }
    }

    if (skippedLines > 0) {
      console.error(
        `Warning: Skipped ${skippedLines} malformed finding lines out of ${lines.length} total lines`
      );
    }

    return { findings, skippedLines };
  }

  static getSchema() {
    return {
      name: "ast_run_rule",
      description: `Generate and execute ast-grep YAML rules. Supports simple patterns with constraints, structural rules (kind/has/inside/all/any/not), fix suggestions, and severity levels. Returns generated YAML and scan findings.

QUICK START:
Simple pattern with constraint:
{ "id": "no-var", "language": "javascript", "pattern": "var $NAME = $VALUE", "where": [{ "metavariable": "NAME", "regex": "^test" }] }

Structural rule with kind:
{ "id": "match-expr", "language": "rust", "rule": { "kind": "match_expression" } }

Pattern with fix suggestion:
{ "id": "modernize", "language": "javascript", "pattern": "var $N = $V", "fix": "const $N = $V", "severity": "warning" }

WHEN TO USE:
• Need constraints on metavariables (filter by name, pattern, exact value)
• Want to provide automated fix suggestions
• Need to categorize findings by severity (error/warning/info)
• Building reusable code quality rules
• Structural matching with kind, has, inside, all, any, not operators
• Pattern objects with selector/context/strictness for disambiguation

WHEN NOT TO USE:
• Simple search without constraints → Use ast_search
• Want to apply changes immediately → Use ast_replace
• Quick codebase exploration → Use ast_search
• Simple text matching → Use grep/ripgrep instead
• Regex-only patterns → ast-grep requires AST structure, use grep with regex
• Control flow analysis (complex if/with/try blocks) → Limited support

RULE MODES (Automatic Detection):
This tool automatically detects rule complexity based on parameters provided:

1. Simple Pattern Mode: Provide 'pattern' parameter
   - AST pattern string with optional constraints
   - Example: { pattern: "console.log($ARG)", where: [{ metavariable: "ARG", regex: ".*" }] }

2. Structural Rule Mode: Provide 'rule' parameter
   - Complex rule object with kind, relational, or composite operators
   - Example: { rule: { kind: "function_declaration", has: { pattern: "await $E", stopBy: "end" } } }

NOTE: Provide either 'pattern' OR 'rule', not both

STRUCTURAL RULES:
Structural rules enable advanced matching beyond simple patterns:

1. Kind Rules - Match by AST node type:
   { rule: { kind: "match_expression" } }
   Matches Rust match expressions by tree-sitter node type.

2. Relational Rules - Match based on relationships (inside, has, precedes, follows):
   { rule: { kind: "function_declaration", has: { pattern: "await $E", stopBy: "end" } } }
   Matches functions containing await. IMPORTANT: Use stopBy: "end" for relational rules.

3. Pattern Objects - Disambiguate with selector/context/strictness:
   { rule: { pattern: { selector: "type_parameters", context: "function $F<$T>()" } } }
   Matches TypeScript generic function type parameters.

4. Composite Rules - Combine conditions (all=AND, any=OR, not=NOT):
   { rule: { all: [{ kind: "call_expression" }, { pattern: "console.log($M)" }] } }
   Matches nodes satisfying ALL sub-rules.

METAVARIABLE RULES:
• $VAR - Single node, must be complete AST node ($OBJ.$PROP not $VAR.prop)
• $$$NAME - Multiple nodes, must be named (bare $$$ rejected)
• $_ - Anonymous match (cannot reference in constraints/fix)
• All metavariables in constraints/fix must exist in pattern
• Multi-node metavariables must always be named

CONSTRAINT EXAMPLES:

1. Regex pattern matching:
   where: [{ metavariable: "NAME", regex: "^test" }]
   Matches: const testVar = 1  |  Doesn't match: const myVar = 1

2. Exact value matching:
   where: [{ metavariable: "OBJ", equals: "console" }, { metavariable: "METHOD", equals: "log" }]
   Matches: console.log(...)  |  Doesn't match: logger.log(...)

3. Numeric values only:
   where: [{ metavariable: "DURATION", regex: "^[0-9]+$" }]
   Matches: timeout(5000)  |  Doesn't match: timeout(CONSTANT)

4. Exclude with not_regex:
   where: [{ metavariable: "NAME", not_regex: "^_" }]
   Matches: const publicVar = 1  |  Doesn't match: const _privateVar = 1

5. Exclude exact values with not_equals:
   where: [{ metavariable: "METHOD", not_equals: "log" }]
   Matches: console.error(...)  |  Doesn't match: console.log(...)

6. AST node type matching with kind:
   where: [{ metavariable: "ARG", kind: "identifier" }]
   Matches: console.log(myVar)  |  Doesn't match: console.log("string")

7. Combining constraints:
   where: [{ metavariable: "NAME", regex: "^[a-z]", kind: "identifier" }]
   Matches identifiers starting with lowercase letter

FIX TEMPLATE EXAMPLES:

1. Simple replacement: pattern="console.log($A)" fix="logger.info($A)"
2. Reordering: pattern="assertEquals($E, $A)" fix="assertEquals($A, $E)"
3. Adding context: pattern="throw new Error($M)" fix="throw new Error(\`[MODULE] \${$M}\`)"

PATTERN LIBRARY:
For more pattern examples, see: https://github.com/justar96/tree-grep-mcp/blob/main/PATTERN_LIBRARY.md

SEVERITY LEVELS:
• error: Critical bugs or runtime failures
• warning: Should be changed but won't break (default)
• info: Suggestions for improvement, style issues

ERROR RECOVERY:

If rule execution fails, check these common issues:

1. "Either pattern (string) or rule (object) is required"
   → Provide either pattern parameter OR rule parameter, not both
   → Example (pattern mode): { pattern: "console.log($A)", ... }
   → Example (rule mode): { rule: { kind: "function_declaration" }, ... }

2. "Rule object must have at least one positive key"
   → Rule object needs pattern, kind, regex, inside, has, all, any, or matches
   → Example: { rule: { kind: "match_expression" } }

3. "Metavariable $X used in constraint/fix but not in pattern"
   → All constraint/fix metavariables must be defined in pattern
   → Fix: Add $X to pattern or remove from constraint/fix

4. "Invalid pattern: Use named multi-node metavariables like $$ARGS"
   → Replace "$$$" with "$$$NAME"
   → Bare $$$ is rejected

5. "Language required for inline code"
   → Language is always required parameter (for both inline and file modes)
   → Example: { id: "r", language: "javascript", pattern: "...", code: "..." }

6. "Invalid paths"
   → Use absolute paths like '/workspace/src/' or 'C:/workspace/src/'
   → Relative paths are not supported (will be rejected with validation error)
   → Paths validated against workspace root for security
   → Omit paths to scan entire workspace (defaults to current directory)

7. Empty scan.findings array (no matches)
   → Rule is valid but matched nothing (not an error)
   → Test with inline code first to verify rule logic
   → Check pattern syntax matches language AST

8. Timeout errors
   → Increase timeoutMs (default: 30000ms, max: 300000ms)
   → Narrow paths to specific directories
   → Simplify pattern or constraints
   → Recommended by repo size:
     Small (<1K files): 30000ms (default)
     Medium (1K-10K): 60000-120000ms
     Large (>10K): 120000-300000ms

OUTPUT STRUCTURE:
• yaml: Generated YAML rule (can be saved for reuse)
• scan.findings: Array of { file, line, column, message, severity }
• scan.summary: { totalFindings, errors, warnings, info }
• All findings returned (no truncation)

OPERATION MODES:

Inline Code Mode (testing):
• Use code parameter to test rules on snippets
• Language parameter REQUIRED
• Example: { id: "r", language: "js", pattern: "var $N = $V", code: "var x = 1;" }

File Mode (scanning):
• Use paths or omit for entire workspace
• Language parameter REQUIRED
• Example: { id: "r", language: "js", pattern: "var $N = $V", paths: ["/workspace/src/"] }

JSX/TSX Patterns:
• Set language to 'jsx' or 'tsx'
• Element matching: "<$COMPONENT $$$ATTRS>" or "<$TAG>$$$CHILDREN</$TAG>"
• Attribute matching: "<Button onClick={$HANDLER}>"
• WARNING: Broad patterns like "<$TAG>" match thousands of elements - add constraints

CONSTRAINT OPERATORS:
• regex - Match with regular expression pattern
• equals - Match exact string value
• not_regex - Exclude matches with regular expression pattern
• not_equals - Exclude exact string value
• kind - Match specific AST node type (e.g., identifier, string_literal)

CONSTRAINT RULES:
• Each constraint must specify at least one operator
• Mutually exclusive: Cannot combine 'regex' and 'equals' for same metavariable
• Mutually exclusive: Cannot combine 'not_regex' and 'not_equals' for same metavariable
• 'kind' can be combined with any positive or negative operator
• Multiple constraints can target different metavariables
• kind values must be lowercase with underscores (e.g., function_declaration)

BEST PRACTICES:
• Use for code quality enforcement and architectural analysis
• Test rules on inline code before scanning large codebases
• Start with simple patterns, add constraints to narrow matches
• Use structural rules (kind/has/inside) for complex matching
• Always use stopBy: "end" for relational rules (inside/has)
• Specify language for better parsing and validation
• Break complex rules into smaller, composable utility rules

LIMITATIONS:
• Paths must be within workspace root (security constraint)
• Path depth limited to 6 levels from workspace root (use parent directories for deep paths)
• Fix templates cannot perform complex transformations
• Temporary YAML files created and cleaned up automatically
• Control flow patterns (if/with/try blocks) have limited support
• Multi-line patterns with newlines may not match - prefer single-line or structural rules
• Not suitable for simple text matching - use grep/ripgrep instead
• Constraints support regex and equals only (no complex logic)
• Indentation-sensitive for multi-line patterns

REFERENCE - MCP to ast-grep CLI Mapping:
id, language, pattern/rule, severity, message, where, fix → YAML file (temp)
paths → positional arguments
code → temp file with extension
timeoutMs → process timeout (not a CLI flag)

Example: { id: "no-var", pattern: "var $N = $V", language: "js", paths: ["/workspace/src/"] }
CLI: ast-grep scan --rule <temp-rule.yml> --json=stream /workspace/src/`,

      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              'Unique rule identifier in kebab-case. Example: "no-console-log", "prefer-const"',
          },
          language: {
            type: "string",
            description:
              "Programming language (js/ts/py/rust/go/java/cpp/kotlin/csharp). Required for all rules.",
          },
          pattern: {
            type: "string",
            description: "Simple AST pattern string. Use either pattern OR rule, not both.",
          },
          rule: {
            type: "object",
            description:
              "Structural rule object (kind/has/inside/all/any/not). Use either pattern OR rule, not both.",
          },
          message: {
            type: "string",
            description: "Human-readable issue description. Defaults to rule ID if omitted.",
          },
          severity: {
            type: "string",
            enum: ["error", "warning", "info"],
            description: "Finding severity. error=critical, warning=default, info=suggestion.",
          },
          where: {
            type: "array",
            items: {
              type: "object",
              properties: {
                metavariable: {
                  type: "string",
                  description: "Metavariable name from pattern (without $ prefix)",
                },
                regex: {
                  type: "string",
                  description: "Regex pattern to match metavariable content. Mutually exclusive with 'equals'.",
                },
                equals: {
                  type: "string",
                  description: "Exact string to match metavariable content. Mutually exclusive with 'regex'.",
                },
                not_regex: {
                  type: "string",
                  description: "Exclude matches with regex pattern. Generates 'not: { regex: ... }' in YAML. Mutually exclusive with 'not_equals'.",
                },
                not_equals: {
                  type: "string",
                  description: "Exclude exact matches. Generates 'not: { regex: ^value$ }' in YAML. Mutually exclusive with 'not_regex'.",
                },
                kind: {
                  type: "string",
                  description: "Match specific AST node type (e.g., 'string_literal', 'function_declaration'). Must be lowercase with underscores. Can be combined with any positive or negative operator.",
                },
              },
              required: ["metavariable"],
            },
            description:
              "Constraints on pattern metavariables. Supports: regex (match pattern), equals (exact match), not_regex (exclude pattern), not_equals (exclude exact), kind (AST node type). Constraint rules: (1) Cannot combine 'regex' and 'equals' for same metavariable. (2) Cannot combine 'not_regex' and 'not_equals' for same metavariable. (3) 'kind' can be combined with any operator. Each must reference a metavariable from pattern.",
          },
          fix: {
            type: "string",
            description:
              "Fix template using pattern metavariables. Can reorder, duplicate, or omit variables.",
          },
          paths: {
            type: "array",
            items: { type: "string" },
            description:
              "ABSOLUTE file/directory paths to scan within workspace (e.g., '/workspace/src/', 'C:/workspace/src/'). Relative paths NOT supported. Omit for entire workspace. Security validated.",
          },
          code: {
            type: "string",
            description: "Inline code to scan. Use for testing rules before file scanning.",
          },
          timeoutMs: {
            type: "number",
            description:
              "Timeout in milliseconds (1000-300000). Default: 30000. Increase for large repos.",
          },
        },
        required: ["id", "language"],
        additionalProperties: false,
      },
    };
  }
}
