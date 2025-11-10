export type JsonStyle = "pretty" | "stream" | "compact";

export type InspectGranularity = "nothing" | "summary" | "entity";

export type NoIgnoreOption = "hidden" | "dot" | "exclude" | "global" | "parent" | "vcs";

export type SeverityOverrideValue = true | string[];

export interface SeverityOverrideConfig {
  error?: SeverityOverrideValue;
  warning?: SeverityOverrideValue;
  info?: SeverityOverrideValue;
  hint?: SeverityOverrideValue;
  off?: SeverityOverrideValue;
}
