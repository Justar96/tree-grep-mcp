/**
 * TypeScript type definitions for ast-grep rule structures
 *
 * These types mirror the ast-grep YAML rule format and provide type safety
 * for constructing complex structural rules programmatically.
 *
 * Reference: https://ast-grep.github.io/reference/rule.html
 */

/**
 * Pattern can be a simple string or an object with selector/context/strictness
 */
export interface PatternObject {
  /** The sub-syntax node kind that is the actual matcher */
  selector?: string;
  /** Surrounding code context for correct parsing */
  context?: string;
  /** Matching algorithm strictness level */
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
}

export type Pattern = string | PatternObject;

/**
 * Controls search termination for relational rules
 */
export type StopBy = "neighbor" | "end" | Rule;

/**
 * Relational rule base properties
 */
export interface RelationalRuleBase {
  /** Controls when relational search stops */
  stopBy?: StopBy;
  /** Specifies a sub-node within the target node */
  field?: string;
}

/**
 * Atomic rules match individual AST nodes based on intrinsic properties
 */
export interface AtomicRule {
  /** Match AST node by code pattern */
  pattern?: Pattern;
  /** Match AST node by its tree-sitter kind name */
  kind?: string;
  /** Match node's text by Rust regex */
  regex?: string;
  /** Match nodes by their index within parent's children */
  nthChild?:
    | number
    | string
    | {
        position: number | string;
        reverse?: boolean;
        ofRule?: Rule;
      };
  /** Match node by character-based start/end positions */
  range?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * Relational rules define conditions based on node position/relationship
 */
export interface RelationalRule extends RelationalRuleBase {
  /** Target node must be inside node matching this rule */
  inside?: Rule;
  /** Target node must have descendant matching this rule */
  has?: Rule;
  /** Target node must appear before node matching this rule */
  precedes?: Rule;
  /** Target node must appear after node matching this rule */
  follows?: Rule;
}

/**
 * Composite rules combine other rules using logical operations
 */
export interface CompositeRule {
  /** Matches if all sub-rules match (AND logic) */
  all?: Rule[];
  /** Matches if any sub-rule matches (OR logic) */
  any?: Rule[];
  /** Matches if sub-rule does not match (NOT logic) */
  not?: Rule;
  /** Matches if predefined utility rule matches */
  matches?: string;
}

/**
 * Complete ast-grep rule object
 * A rule can combine atomic, relational, and composite properties
 * All fields are optional, but at least one "positive" key must be present
 */
export type Rule = AtomicRule & RelationalRule & CompositeRule;

/**
 * Constraint on metavariables captured in pattern matching
 */
export interface Constraint {
  /** The metavariable name to constrain (without $ prefix) */
  metavariable: string;
  /** Rust regex pattern the metavariable must match */
  regex?: string;
  /** Exact string the metavariable must equal */
  equals?: string;
  /** Constraint kind (default: 'regex') */
  kind?: "regex" | "pattern";
}

/**
 * Transformation to apply to metavariables in fix
 */
export interface Transform {
  [newVarName: string]: {
    /** Replace operation */
    replace?: {
      source: string;
      replace: string;
      by: string;
    };
    /** Substring operation */
    substring?: {
      source: string;
      startChar: number;
      endChar: number;
    };
    /** Case conversion operation */
    convert?: {
      source: string;
      toCase:
        | "lowerCase"
        | "upperCase"
        | "capitalize"
        | "camelCase"
        | "pascalCase"
        | "snakeCase"
        | "kebabCase";
    };
    /** Rewrite operation */
    rewrite?: {
      source: string;
      rewriters: Record<string, unknown>[];
    };
  };
}

/**
 * Complete rule configuration for ast-grep scan
 * This is the top-level structure in YAML rule files
 */
export interface RuleConfig {
  /** Unique identifier for the rule (required) */
  id: string;
  /** Programming language (required) */
  language: string;
  /** Human-readable message describing the issue */
  message?: string;
  /** Severity level */
  severity?: "error" | "warning" | "info" | "hint" | "off";
  /** The matching rule (required) */
  rule: Rule;
  /** Constraints on captured metavariables */
  constraints?: Constraint[];
  /** Fix template for code rewriting */
  fix?: string;
  /** Transformations for metavariables */
  transform?: Transform;
  /** Utility rules for reuse */
  utils?: Record<string, Rule>;
  /** Metadata (documentation, note, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Helper type guards for discriminating rule types
 */
export function isPatternObject(pattern: Pattern): pattern is PatternObject {
  return typeof pattern === "object" && pattern !== null;
}

export function hasKindRule(rule: Rule): boolean {
  return typeof rule.kind === "string";
}

export function hasRelationalRule(rule: Rule): boolean {
  return !!(rule.inside || rule.has || rule.precedes || rule.follows);
}

export function hasCompositeRule(rule: Rule): boolean {
  return !!(rule.all || rule.any || rule.not || rule.matches);
}

/**
 * Validation helper: Check if rule has at least one positive key
 */
export function hasPositiveKey(rule: Rule): boolean {
  return !!(
    rule.pattern ||
    rule.kind ||
    rule.regex ||
    rule.nthChild ||
    rule.range ||
    rule.inside ||
    rule.has ||
    rule.precedes ||
    rule.follows ||
    rule.all ||
    rule.any ||
    rule.matches
  );
}
