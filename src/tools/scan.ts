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
import type {
  InspectGranularity,
  JsonStyle,
  NoIgnoreOption,
  SeverityOverrideConfig,
} from "../types/cli.js";

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
  context?: number;
  before?: number;
  after?: number;
  timeoutMs?: number;
  verbose?: boolean;
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
  globs?: string[];
  noIgnore?: NoIgnoreOption[];
  followSymlinks?: boolean;
  threads?: number;
  inspect?: InspectGranularity;
  jsonStyle?: JsonStyle;
  includeMetadata?: boolean;
  format?: "github";
  config?: string;
  filter?: string;
  severityOverrides?: SeverityOverrideConfig;
  maxDepth?: number;
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

    if (paramsRaw.strictness !== undefined) {
      const validStrictness = ["cst", "smart", "ast", "relaxed", "signature"] as const;
      if (
        typeof paramsRaw.strictness !== "string" ||
        !validStrictness.includes(paramsRaw.strictness as (typeof validStrictness)[number])
      ) {
        throw new ValidationError(
          `strictness must be one of: ${validStrictness.join(", ")}`
        );
      }
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

    if (paramsRaw.config !== undefined && typeof paramsRaw.config !== "string") {
      throw new ValidationError("config must be a string path to sgconfig.yml");
    }

    if (paramsRaw.filter !== undefined && typeof paramsRaw.filter !== "string") {
      throw new ValidationError("filter must be a string (regular expression)");
    }

    if (
      paramsRaw.severityOverrides !== undefined &&
      (typeof paramsRaw.severityOverrides !== "object" ||
        paramsRaw.severityOverrides === null ||
        Array.isArray(paramsRaw.severityOverrides))
    ) {
      throw new ValidationError("severityOverrides must be an object");
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
      strictness: paramsRaw.strictness as ScanParams["strictness"],
      context: paramsRaw.context as number | undefined,
      before: paramsRaw.before as number | undefined,
      after: paramsRaw.after as number | undefined,
      globs: paramsRaw.globs as string[] | undefined,
      noIgnore: paramsRaw.noIgnore as NoIgnoreOption[] | undefined,
      followSymlinks: paramsRaw.followSymlinks as boolean | undefined,
      threads: paramsRaw.threads as number | undefined,
      inspect: paramsRaw.inspect as InspectGranularity | undefined,
      jsonStyle: paramsRaw.jsonStyle as JsonStyle | undefined,
      includeMetadata: paramsRaw.includeMetadata as boolean | undefined,
      format: paramsRaw.format as "github" | undefined,
      config: paramsRaw.config as string | undefined,
      filter: paramsRaw.filter as string | undefined,
      severityOverrides: paramsRaw.severityOverrides as SeverityOverrideConfig | undefined,
    };

    const contextValidation = ParameterValidator.validateContext(params.context);
    if (!contextValidation.valid) {
      throw new ValidationError(contextValidation.errors.join("; "), {
        errors: contextValidation.errors,
      });
    }

    const beforeValidation = ParameterValidator.validateContextWindow("before", params.before);
    if (!beforeValidation.valid) {
      throw new ValidationError(beforeValidation.errors.join("; "), {
        errors: beforeValidation.errors,
      });
    }

    const afterValidation = ParameterValidator.validateContextWindow("after", params.after);
    if (!afterValidation.valid) {
      throw new ValidationError(afterValidation.errors.join("; "), {
        errors: afterValidation.errors,
      });
    }

    const contextComboValidation = ParameterValidator.validateContextCombination(
      params.context,
      params.before,
      params.after
    );
    if (!contextComboValidation.valid) {
      throw new ValidationError(contextComboValidation.errors.join("; "), {
        errors: contextComboValidation.errors,
      });
    }

    const globsValidation = ParameterValidator.validateGlobs(params.globs);
    if (!globsValidation.valid) {
      throw new ValidationError(globsValidation.errors.join("; "), {
        errors: globsValidation.errors,
      });
    }

    const noIgnoreValidation = ParameterValidator.validateNoIgnore(params.noIgnore);
    if (!noIgnoreValidation.valid) {
      throw new ValidationError(noIgnoreValidation.errors.join("; "), {
        errors: noIgnoreValidation.errors,
      });
    }

    const followValidation = ParameterValidator.validateBooleanOption(
      params.followSymlinks,
      "followSymlinks"
    );
    if (!followValidation.valid) {
      throw new ValidationError(followValidation.errors.join("; "), {
        errors: followValidation.errors,
      });
    }

    const includeMetadataValidation = ParameterValidator.validateBooleanOption(
      params.includeMetadata,
      "includeMetadata"
    );
    if (!includeMetadataValidation.valid) {
      throw new ValidationError(includeMetadataValidation.errors.join("; "), {
        errors: includeMetadataValidation.errors,
      });
    }

    const threadsValidation = ParameterValidator.validateThreads(params.threads);
    if (!threadsValidation.valid) {
      throw new ValidationError(threadsValidation.errors.join("; "), {
        errors: threadsValidation.errors,
      });
    }

    const inspectValidation = ParameterValidator.validateInspect(params.inspect);
    if (!inspectValidation.valid) {
      throw new ValidationError(inspectValidation.errors.join("; "), {
        errors: inspectValidation.errors,
      });
    }

    const jsonStyleValidation = ParameterValidator.validateJsonStyle(params.jsonStyle);
    if (!jsonStyleValidation.valid) {
      throw new ValidationError(jsonStyleValidation.errors.join("; "), {
        errors: jsonStyleValidation.errors,
      });
    }

    const formatValidation = ParameterValidator.validateFormat(params.format);
    if (!formatValidation.valid) {
      throw new ValidationError(formatValidation.errors.join("; "), {
        errors: formatValidation.errors,
      });
    }

    const severityOverridesValidation = ParameterValidator.validateSeverityOverrides(
      params.severityOverrides
    );
    if (!severityOverridesValidation.valid) {
      throw new ValidationError(severityOverridesValidation.errors.join("; "), {
        errors: severityOverridesValidation.errors,
      });
    }

    // Validate maxDepth early if provided (needed for config path validation)
    if (params.maxDepth !== undefined) {
      if (typeof params.maxDepth !== "number" || !Number.isFinite(params.maxDepth)) {
        throw new ValidationError("maxDepth must be a finite number");
      }
      if (params.maxDepth < 1 || params.maxDepth > 20) {
        throw new ValidationError("maxDepth must be between 1 and 20");
      }
    }

    // Create workspace manager with custom maxDepth if provided
    const workspaceManager = params.maxDepth !== undefined
      ? new WorkspaceManager({
          explicitRoot: this.workspaceManager.getWorkspaceRoot(),
          maxDepth: params.maxDepth
        })
      : this.workspaceManager;

    const configValue = typeof params.config === "string" ? params.config.trim() : undefined;
    const hasConfig = Boolean(configValue);
    let normalizedConfigPath: string | undefined;
    if (hasConfig && configValue) {
      if (!path.isAbsolute(configValue)) {
        throw new ValidationError("config path must be absolute (e.g., /workspace/app/sgconfig.yml)");
      }
      normalizedConfigPath = PathValidator.normalizePath(configValue);
      const { valid, errors } = workspaceManager.validatePaths([normalizedConfigPath]);
      if (!valid) {
        throw new ValidationError(errors[0] || "Invalid config path", { errors });
      }
      params.config = normalizedConfigPath;
    } else {
      params.config = undefined;
    }

    const filterValue = typeof params.filter === "string" ? params.filter.trim() : undefined;
    const hasFilter = Boolean(filterValue);
    if (hasFilter && filterValue) {
      params.filter = filterValue;
    } else {
      params.filter = undefined;
    }

    // Support two modes:
    // Mode 1 (existing): Simple pattern string + optional where constraints
    // Mode 2 (new): Complex rule object with kind, has, inside, all, any, not, matches, etc.
    const hasPattern = !!(params.pattern && typeof params.pattern === "string");
    const hasRule = !!(params.rule && typeof params.rule === "object" && !Array.isArray(params.rule));
    const hasConfigMode = hasConfig || hasFilter;

    if (!hasPattern && !hasRule && !hasConfigMode) {
      throw new ValidationError(
        "Provide either pattern/rule inputs or config/filter parameters to select rules."
      );
    }

    if ((hasPattern || hasRule) && hasConfigMode) {
      throw new ValidationError(
        "Cannot combine config/filter scanning with inline pattern or rule parameters."
      );
    }

    if (hasPattern && hasRule) {
      throw new ValidationError(
        "Cannot specify both pattern and rule parameters. " +
          "Use pattern for simple matching, or rule for structural rules."
      );
    }

    if (hasConfigMode) {
      if (params.where && params.where.length > 0) {
        throw new ValidationError("where constraints are only supported for inline pattern/rule mode");
      }
      if (params.fix) {
        throw new ValidationError("fix templates require inline pattern/rule mode");
      }
      if (params.strictness) {
        throw new ValidationError("strictness is only applicable when using inline pattern mode");
      }
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

    const verboseValidation = ParameterValidator.validateVerbose(params.verbose);
    if (!verboseValidation.valid) {
      throw new ValidationError(verboseValidation.errors.join("; "), {
        errors: verboseValidation.errors,
      });
    }

    // Set default verbose value to true
    const isVerbose = params.verbose !== false;

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
              `Constraint on metavariable '${constraint.metavariable}' must specify at least one operator: regex, equals, not_regex, not_equals, or kind`
            );
          }

          // Validate kind format early if present
          if (hasKind && constraint.kind) {
            const kindValidation = ParameterValidator.validateConstraintKind(constraint.kind);
            if (!kindValidation.valid) {
              throw new ValidationError(kindValidation.errors.join("; "));
            }
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

    // Determine execution mode
    // - Run mode: simple pattern-only rules (no constraints/fix) and no config/filter
    // - Rule mode: dynamically generated YAML rule (-rule)
    // - Config mode: use existing sgconfig/filters (no temporary files)
    const useRunMode =
      hasPattern && !hasConfigMode && !params.rule && !params.where && !params.fix;
    const useRuleMode = !useRunMode && !hasConfigMode;

    if (params.includeMetadata && useRunMode) {
      throw new ValidationError("--include-metadata requires scan mode. Provide rule/constraints/fix.");
    }

    if (params.format && useRunMode) {
      throw new ValidationError("--format is only available in scan mode.");
    }

    if (useRunMode && params.severityOverrides) {
      throw new ValidationError("severityOverrides apply only to scan mode");
    }

    // Generate YAML rule (only needed for rule mode)
    const yaml = useRuleMode
      ? this.buildYaml({ ...params, language: normalizeLang(params.language) })
      : "";

    // Create temporary rule file with unique name (only for rule mode)
    const tempDir = os.tmpdir();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const rulesFile = useRuleMode
      ? path.join(tempDir, `rule-${Date.now()}-${randomSuffix}.yml`)
      : "";
    try {
      if (useRuleMode) {
        await fs.writeFile(rulesFile, yaml, "utf8");
      }

      const args: string[] = [];
      const jsonStyle = params.jsonStyle || "stream";

      if (useRunMode) {
        args.push(
          "run",
          "--pattern",
          params.pattern!.trim(),
          "--lang",
          normalizeLang(params.language)
        );
        if (params.strictness) {
          args.push("--strictness", params.strictness);
        }
      } else if (useRuleMode) {
        args.push("scan", "--rule", PathValidator.normalizePath(rulesFile));
      } else {
        args.push("scan");
        if (hasConfig && normalizedConfigPath) {
          args.push("--config", normalizedConfigPath);
        }
        if (hasFilter && params.filter) {
          args.push("--filter", params.filter);
        }
      }

      args.push(`--json=${jsonStyle}`);

      if (params.context && params.context > 0) {
        args.push("--context", params.context.toString());
      }

      if (typeof params.before === "number" && params.before > 0) {
        args.push("--before", params.before.toString());
      }

      if (typeof params.after === "number" && params.after > 0) {
        args.push("--after", params.after.toString());
      }

      if (params.globs && params.globs.length > 0) {
        for (const glob of params.globs) {
          args.push("--globs", glob);
        }
      }

      if (params.noIgnore && params.noIgnore.length > 0) {
        for (const ignoreType of params.noIgnore) {
          args.push("--no-ignore", ignoreType);
        }
      }

      if (params.followSymlinks) {
        args.push("--follow");
      }

      if (typeof params.threads === "number") {
        args.push("--threads", params.threads.toString());
      }

      if (params.inspect) {
        args.push("--inspect", params.inspect);
      }

      if (!useRunMode && params.includeMetadata) {
        args.push("--include-metadata");
      }

      if (!useRunMode && params.format) {
        args.push("--format", params.format);
      }

      if (!useRunMode && params.severityOverrides) {
        const pushOverride = (flag: string, value?: SeverityOverrideConfig[keyof SeverityOverrideConfig]) => {
          if (value === undefined) return;
          if (value === true) {
            args.push(`--${flag}`);
            return;
          }
          for (const ruleId of value) {
            args.push(`--${flag}=${ruleId}`);
          }
        };
        pushOverride("error", params.severityOverrides.error);
        pushOverride("warning", params.severityOverrides.warning);
        pushOverride("info", params.severityOverrides.info);
        pushOverride("hint", params.severityOverrides.hint);
        pushOverride("off", params.severityOverrides.off);
      }

      const executeOptions: {
        cwd: string;
        timeout: number;
        stdin?: string;
      } = {
        cwd: workspaceManager.getWorkspaceRoot(),
        timeout: params.timeoutMs || 60000,
      };

      if (params.code) {
        if (useRunMode && !params.language) {
          throw new ValidationError("Language required for inline code");
        }
        args.push("--stdin");
        executeOptions.stdin = params.code;
      } else {
        const pathsProvided =
          params.paths && Array.isArray(params.paths) && params.paths.length > 0;
        const inputPaths: string[] = pathsProvided && params.paths ? params.paths : ["."];

        if (!pathsProvided) {
          const workspaceRoot = workspaceManager.getWorkspaceRoot();
          const home = process.env.HOME || process.env.USERPROFILE || "";

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

        for (const p of inputPaths) {
          if (!path.isAbsolute(p)) {
            if (p === "." || p === "") {
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

        const normalizedPaths = inputPaths.map((p) =>
          p === "" ? "." : PathValidator.normalizePath(p)
        );

        if (pathsProvided) {
          const { valid, errors } = workspaceManager.validatePaths(normalizedPaths);
          if (!valid) {
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

        args.push(...normalizedPaths);
      }

      const result = await this.binaryManager.executeAstGrep(args, executeOptions);

      const { findings, skippedLines } = this.parseFindings(result.stdout);

      // Create result object based on verbose mode
      if (!isVerbose) {
        return {
          yaml: useRunMode
            ? `# Pattern-only rule (using run mode)\npattern: ${params.pattern}\nlanguage: ${normalizeLang(params.language)}`
            : yaml,
          skippedLines,
          scan: {
            findings: [], // Empty findings array for non-verbose mode
            summary: {
              totalFindings: findings.length,
              errors: findings.filter((f) => f.severity === "error").length,
              warnings: findings.filter((f) => f.severity === "warning").length,
              skippedLines,
            },
          },
        };
      }

      const resultObj = {
        yaml: useRunMode
          ? `# Pattern-only rule (using run mode)\npattern: ${params.pattern}\nlanguage: ${normalizeLang(params.language)}`
          : yaml,
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

      if (useRuleMode && rulesFile) {
        try {
          await fs.unlink(rulesFile);
        } catch (e) {
          cleanupErrors.push(
            `Failed to cleanup rule file: ${e instanceof Error ? e.message : String(e)}`
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
      description: `Generate and execute ast-grep YAML rules with constraints, fix suggestions, and severity levels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ REQUIRED PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• id (string) - Rule identifier (kebab-case, e.g., "no-console-log")
• language (string) - Programming language (js/ts/py/rust/go/java/cpp)
• pattern (string) OR rule (object) - Choose ONE:
  - pattern: Simple AST pattern string (e.g., "console.log($ARG)")
  - rule: Complex structural rule object (e.g., { kind: "function_declaration" })
• paths (array) - Absolute paths to scan (e.g., ["/workspace/src/"])

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 QUICK START (Copy & Modify)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Simple pattern with constraint:
   { "id": "no-var", "language": "javascript", "pattern": "var $NAME = $VALUE", "where": [{ "metavariable": "NAME", "regex": "^test" }], "paths": ["/workspace/src/"] }

2. Pattern with fix suggestion:
   { "id": "modernize", "language": "javascript", "pattern": "var $N = $V", "fix": "const $N = $V", "severity": "warning", "paths": ["/workspace/src/"] }

3. Structural rule (match by AST node type):
   { "id": "match-expr", "language": "rust", "rule": { "kind": "match_expression" }, "paths": ["/workspace/src/"] }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 TROUBLESHOOTING FAILURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ❌ "Metavariable $VAR in constraint not found in pattern"
   → Ensure constraint metavariables exist in pattern
   → Example: pattern="foo($A)" where=[{metavariable: "B", ...}] is INVALID
   → Fix: pattern="foo($A)" where=[{metavariable: "A", ...}]

2. ❌ "Metavariable $VAR in fix not found in pattern"
   → Ensure fix metavariables exist in pattern
   → Example: pattern="foo($A)" fix="bar($B)" is INVALID
   → Fix: pattern="foo($A)" fix="bar($A)"

3. ❌ "Invalid rule ID format"
   → Use kebab-case: "no-console-log" not "noConsoleLog" or "no_console_log"

4. ❌ "Provide either pattern or rule, not both"
   → Choose ONE: pattern (simple) OR rule (structural)

5. ✓ No error but findings: [] (empty array)
   → Rule is valid but matched nothing
   → Test pattern with ast_search first to verify matches
   → Check constraint logic (too restrictive?)

WHEN TO USE THIS TOOL:
• Need constraints on metavariables (filter by name, pattern, value)
• Want automated fix suggestions
• Need severity levels (error/warning/info)
• Building reusable code quality rules

WHEN NOT TO USE:
• Simple search without constraints → Use ast_search (faster)
• Want to apply changes immediately → Use ast_replace
• Quick codebase exploration → Use ast_search

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 CONSTRAINT SYNTAX (where parameter)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Constraints filter metavariables by regex, exact value, or AST node type:

1. Match by regex:
   where: [{ metavariable: "NAME", regex: "^test" }]
   ✓ Matches: const testVar = 1
   ✗ Doesn't match: const myVar = 1

2. Match exact value:
   where: [{ metavariable: "OBJ", equals: "console" }]
   ✓ Matches: console.log(...)
   ✗ Doesn't match: logger.log(...)

3. Exclude by regex:
   where: [{ metavariable: "NAME", not_regex: "^_" }]
   ✓ Matches: const publicVar = 1
   ✗ Doesn't match: const _privateVar = 1

4. Exclude exact value:
   where: [{ metavariable: "METHOD", not_equals: "log" }]
   ✓ Matches: console.error(...)
   ✗ Doesn't match: console.log(...)

5. Match by AST node type:
   where: [{ metavariable: "ARG", kind: "identifier" }]
   ✓ Matches: console.log(myVar)
   ✗ Doesn't match: console.log("string")

6. Combine constraints (AND logic):
   where: [{ metavariable: "NAME", regex: "^[a-z]", kind: "identifier" }]
   Matches identifiers starting with lowercase letter

CRITICAL: All constraint metavariables MUST exist in pattern!
✓ pattern="foo($A)" where=[{metavariable: "A", ...}]
✗ pattern="foo($A)" where=[{metavariable: "B", ...}] (validation error)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔨 FIX TEMPLATES (fix parameter)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fix templates provide automated fix suggestions (not applied automatically):

pattern: "var $NAME = $VALUE"
fix: "const $NAME = $VALUE"
→ Suggests replacing var with const

CRITICAL: All fix metavariables MUST exist in pattern!
✓ pattern="foo($A)" fix="bar($A)"
✗ pattern="foo($A)" fix="bar($B)" (validation error)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏗️ STRUCTURAL RULES (rule parameter)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Advanced matching beyond simple patterns:

1. Kind Rules - Match by AST node type:
   rule: { kind: "match_expression" }
   Matches Rust match expressions

2. Relational Rules - Match based on relationships:
   rule: { kind: "function_declaration", has: { pattern: "await $E", stopBy: "end" } }
   Matches functions containing await

   ⚠️ CRITICAL: Always use stopBy: "end" for relational rules!
   Without it, search stops too early and misses matches.

3. Pattern Objects - Disambiguate with selector/context:
   rule: { pattern: { selector: "type_parameters", context: "function $F<$T>()" } }
   Matches TypeScript generic function type parameters

4. Composite Rules - Combine conditions (all=AND, any=OR, not=NOT):
   rule: { all: [{ kind: "call_expression" }, { pattern: "console.log($M)" }] }
   Matches nodes satisfying ALL sub-rules

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 METAVARIABLE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$VAR - Single AST node (expression, identifier, statement)
  Examples: $ARG, $NAME, $VALUE, $OBJ, $PROP
  Usage: "console.log($ARG)" matches console.log(anything)

$$$NAME - Multiple nodes (MUST be named, bare $$$ rejected)
  Examples: $$$ARGS, $$$PARAMS, $$$BODY
  Usage: "foo($$$ARGS)" matches foo(), foo(1), foo(1,2,3)

$_ - Anonymous match (cannot reference in constraints/fix)
  Usage: "foo($_, $_, $_)" matches exactly 3 arguments

Rules:
• Must be complete AST nodes: "$OBJ.$PROP" not "$VAR.prop"
• Multi-node must be named: "$$$ARGS" not "$$$"
• Case-sensitive: $VAR and $var are different
• All metavariables in constraints/fix must exist in pattern

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ ADVANCED OPTIONS (Optional)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Severity Levels:
• severity: "error" - Critical bugs or runtime failures
• severity: "warning" - Should be changed but won't break (default)
• severity: "info" - Suggestions for improvement, style issues

File Filtering:
• globs: ["**/*.test.ts", "!**/node_modules/**"] - Include/exclude patterns
• noIgnore: ["hidden", "dot"] - Search hidden files
• followSymlinks: true - Follow symbolic links (default: false)

Performance:
• threads: 4 - Parallel threads (default: 0 = auto-detect)
• timeoutMs: 60000 - Timeout in ms (default: 30000, max: 300000)
• maxDepth: 15 - Max directory depth from workspace root (1-20, default: 10)

Context:
• context: 3 - Lines around finding (0-100)
• before: 2, after: 5 - Asymmetric context (conflicts with context)

Output:
• jsonStyle: "stream" - Format: stream/pretty/compact
• includeMetadata: true - Include rule metadata (default: false)
• format: "github" - GitHub Actions annotations

Configuration:
• config: "/path/to/sgconfig.yml" - Project-wide rule configuration
• filter: "^no-" - Filter rules by ID regex
• severityOverrides: { error: ["rule-id"], warning: ["other-id"] }

Debugging:
• inspect: "summary" - Show scan stats (nothing/summary/entity)
• verbose: false - Simplified output (default: true)
• strictness: "smart" - Match precision (cst/smart/ast/relaxed/signature)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 BEST PRACTICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ⚠️ ALWAYS use stopBy: "end" for relational rules (inside/has/precedes/follows)
2. Test rules on inline code before scanning large codebases
3. Start with simple patterns, add constraints to narrow matches
4. Use ast_search first to verify pattern matches correctly
5. Break complex rules into smaller, composable utility rules

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 OUTPUT STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  yaml: "Generated YAML rule (can be saved for reuse)",
  scan: {
    findings: [{ file, line, column, message, severity }],
    summary: { totalFindings, errors, warnings, info }
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 CLI FLAG MAPPING (For Reference)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP Parameter → ast-grep CLI Flag:
• pattern → Generates YAML rule with pattern field
• rule → Generates YAML rule with rule field
• where → Generates YAML constraints field
• fix → Generates YAML fix field
• severity → Generates YAML severity field
• language → --lang <normalized> (javascript→js, typescript→ts, python→py)
• code → --stdin (with stdin input)
• paths → positional arguments (absolute paths)
• config → --config <path>
• filter → --filter <regex>
• globs → --globs <pattern> (repeatable)
• noIgnore → --no-ignore <option> (repeatable)
• followSymlinks → --follow
• threads → --threads <number>
• inspect → --inspect <granularity>
• includeMetadata → --include-metadata
• format → --format <format>
• severityOverrides → --error/--warning/--info/--hint/--off <rule-id>
• context → --context <number>
• before/after → --before/--after <number>
• jsonStyle → --json=<style>

Example: { id: "no-var", language: "js", pattern: "var $N = $V", where: [{metavariable: "N", regex: "^test"}], paths: ["/workspace/src/"] }
→ Generates YAML rule file, then: ast-grep scan --rule <temp-rule-file> --lang js /workspace/src/

Reference: AST_GREP_DOCUMENTS.md lines 575-814`,

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
                  description:
                    "Regex pattern to match metavariable content. Mutually exclusive with 'equals'.",
                },
                equals: {
                  type: "string",
                  description:
                    "Exact string to match metavariable content. Mutually exclusive with 'regex'.",
                },
                not_regex: {
                  type: "string",
                  description:
                    "Exclude matches with regex pattern. Generates 'not: { regex: ... }' in YAML. Mutually exclusive with 'not_equals'.",
                },
                not_equals: {
                  type: "string",
                  description:
                    "Exclude exact matches. Generates 'not: { regex: ^value$ }' in YAML. Mutually exclusive with 'not_regex'.",
                },
                kind: {
                  type: "string",
                  description:
                    "Match specific AST node type (e.g., 'string_literal', 'function_declaration'). Must be lowercase with underscores. Can be combined with any positive or negative operator.",
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
          verbose: {
            type: "boolean",
            description:
              "Control output verbosity. Default: true. When false, returns simplified summary without detailed finding information. Useful in CLI to prevent excessive output.",
          },
          strictness: {
            type: "string",
            enum: ["cst", "smart", "ast", "relaxed", "signature"],
            description:
              "Pattern matching strictness (default: 'smart'). Only applies when using simple pattern mode (not structural rules). Controls how precisely patterns must match AST nodes:\n" +
              "- cst: Match exact CST nodes (most strict, includes all syntax)\n" +
              "- smart: Match AST nodes except trivial tokens like parentheses (default, recommended)\n" +
              "- ast: Match only named AST nodes (ignores unnamed nodes)\n" +
              "- relaxed: Match AST nodes except comments (good for commented code)\n" +
              "- signature: Match AST structure without text content (matches any identifier/literal)\n" +
              "Note: Ignored when using structural rules (rule parameter). See: https://ast-grep.github.io/advanced/match-algorithm.html",
          },
          maxDepth: {
            type: "number",
            description:
              "Maximum directory depth for path validation (1-20). Default: 10. Controls how deep paths can be from workspace root. Example: maxDepth=5 allows /workspace/a/b/c/d/e/ but rejects /workspace/a/b/c/d/e/f/.",
          },
        },
        required: ["id", "language"],
        additionalProperties: false,
      },
    };
  }
}
