// Custom error types for the MCP server
/**
 * Base error type that carries a machine readable code and optional context.
 */
export abstract class AstGrepMCPError extends Error {
  abstract readonly code: string;
  abstract readonly recoverable: boolean;

  constructor(message: string, public readonly context?: any) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Signals invalid parameters or user input that callers can correct.
 */
export class ValidationError extends AstGrepMCPError {
  readonly code = 'VALIDATION_ERROR';
  readonly recoverable = true;
}

/**
 * Indicates binary discovery or execution failures that require operator action.
 */
export class BinaryError extends AstGrepMCPError {
  readonly code = 'BINARY_ERROR';
  readonly recoverable = false;
}

/**
 * Raised when a request violates workspace security constraints.
 */
export class SecurityError extends AstGrepMCPError {
  readonly code = 'SECURITY_ERROR';
  readonly recoverable = false;
}

export class TimeoutError extends AstGrepMCPError {
  readonly code = 'TIMEOUT_ERROR';
  readonly recoverable = true;
}

export class FileSystemError extends AstGrepMCPError {
  readonly code = 'FILESYSTEM_ERROR';
  readonly recoverable = true;
}

/**
 * Represents ast-grep runtime failures that may be transient or recoverable.
 */
export class ExecutionError extends AstGrepMCPError {
  readonly code = 'EXECUTION_ERROR';
  readonly recoverable = true;
}

// Enhanced diagnostics interface for QA improvements
export interface ValidationDiagnostics {
  patternType?: string;
  metavariables?: {
    single: string[];
    multi: string[];
    problematic: string[];
    reliable: string[];
  };
  languageCompatibility?: string[];
  complexity?: 'simple' | 'moderate' | 'complex' | 'very_complex' | 'nested';
  reliabilityScore?: number;
  patternReliabilityScore?: number;
  enhancedValidationApplied?: boolean;
  issues?: string[];
  warnings?: string[];
  patterns?: any;
}

// Validation result interface
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized?: any;
  diagnostics?: ValidationDiagnostics;
}

// Installation options for binary management
export interface InstallationOptions {
  platform?: 'win32' | 'darwin' | 'linux' | 'auto';
  useSystem?: boolean;
  autoInstall?: boolean;
  cacheDir?: string;
  customBinaryPath?: string;
}

