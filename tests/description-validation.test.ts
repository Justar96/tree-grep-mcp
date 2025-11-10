import { describe, test, expect } from "bun:test";
import { SearchTool } from "../src/tools/search.js";
import { ReplaceTool } from "../src/tools/replace.js";
import { ScanTool } from "../src/tools/scan.js";
import { ExplainTool } from "../src/tools/explain.js";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";

describe("Tool Description Length Limits", () => {
  test("SearchTool description under 250 lines", () => {
    const schema = SearchTool.getSchema();
    const lines = schema.description.split("\n").length;
    console.log(`SearchTool description: ${lines} lines`);
    expect(lines).toBeLessThanOrEqual(250);
  });

  test("ReplaceTool description under 250 lines", () => {
    const schema = ReplaceTool.getSchema();
    const lines = schema.description.split("\n").length;
    console.log(`ReplaceTool description: ${lines} lines`);
    expect(lines).toBeLessThanOrEqual(250);
  });

  test("ScanTool description under 300 lines", () => {
    const schema = ScanTool.getSchema();
    const lines = schema.description.split("\n").length;
    console.log(`ScanTool description: ${lines} lines`);
    expect(lines).toBeLessThanOrEqual(300);
  });

  test("ExplainTool description under 200 lines", () => {
    const schema = ExplainTool.getSchema();
    const lines = schema.description.split("\n").length;
    console.log(`ExplainTool description: ${lines} lines`);
    expect(lines).toBeLessThanOrEqual(200);
  });
});

describe("Tool Description Completeness", () => {
  test("SearchTool documents all schema parameters", () => {
    const schema = SearchTool.getSchema();
    const schemaProps = Object.keys(schema.inputSchema.properties);
    const description = schema.description;

    console.log("SearchTool schema parameters:", schemaProps);

    for (const prop of schemaProps) {
      expect(description).toContain(prop);
    }
  });

  test("ReplaceTool documents all schema parameters", () => {
    const schema = ReplaceTool.getSchema();
    const schemaProps = Object.keys(schema.inputSchema.properties);
    const description = schema.description;

    console.log("ReplaceTool schema parameters:", schemaProps);

    for (const prop of schemaProps) {
      expect(description).toContain(prop);
    }
  });

  test("ScanTool documents all schema parameters", () => {
    const schema = ScanTool.getSchema();
    const schemaProps = Object.keys(schema.inputSchema.properties);
    const description = schema.description;

    console.log("ScanTool schema parameters:", schemaProps);

    for (const prop of schemaProps) {
      expect(description).toContain(prop);
    }
  });

  test("ExplainTool documents all schema parameters", () => {
    const schema = ExplainTool.getSchema();
    const schemaProps = Object.keys(schema.inputSchema.properties);
    const description = schema.description;

    console.log("ExplainTool schema parameters:", schemaProps);

    for (const prop of schemaProps) {
      expect(description).toContain(prop);
    }
  });
});

describe("Tool Description Structure", () => {
  test("SearchTool has required sections", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("REQUIRED PARAMETERS");
    expect(description).toContain("QUICK START");
    expect(description).toContain("TROUBLESHOOTING");
    expect(description).toContain("PATTERN SYNTAX");
    expect(description).toContain("WHEN TO USE");
    expect(description).toContain("WHEN NOT TO USE");
    expect(description).toContain("ADVANCED OPTIONS");
    expect(description).toContain("CLI FLAG MAPPING");
  });

  test("ReplaceTool has required sections", () => {
    const schema = ReplaceTool.getSchema();
    const description = schema.description;

    expect(description).toContain("SAFETY FIRST");
    expect(description).toContain("REQUIRED PARAMETERS");
    expect(description).toContain("QUICK START");
    expect(description).toContain("TROUBLESHOOTING");
    expect(description).toContain("METAVARIABLE RULES");
    expect(description).toContain("WHEN TO USE");
    expect(description).toContain("WHEN NOT TO USE");
    expect(description).toContain("ADVANCED OPTIONS");
    expect(description).toContain("CLI FLAG MAPPING");
  });

  test("ScanTool has required sections", () => {
    const schema = ScanTool.getSchema();
    const description = schema.description;

    expect(description).toContain("REQUIRED PARAMETERS");
    expect(description).toContain("QUICK START");
    expect(description).toContain("TROUBLESHOOTING");
    expect(description).toContain("CONSTRAINT SYNTAX");
    expect(description).toContain("WHEN TO USE");
    expect(description).toContain("WHEN NOT TO USE");
    expect(description).toContain("ADVANCED OPTIONS");
    expect(description).toContain("CLI FLAG MAPPING");
  });
});

describe("Advanced Parameters Documentation", () => {
  test("SearchTool documents advanced file filtering parameters", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("globs");
    expect(description).toContain("noIgnore");
    expect(description).toContain("followSymlinks");
  });

  test("SearchTool documents advanced performance parameters", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("threads");
    expect(description).toContain("timeoutMs");
  });

  test("SearchTool documents advanced debugging parameters", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("inspect");
  });

  test("SearchTool documents context parameters", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("context");
    expect(description).toContain("before");
    expect(description).toContain("after");
  });

  test("SearchTool documents output parameters", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("jsonStyle");
    expect(description).toContain("maxMatches");
    expect(description).toContain("verbose");
  });

  test("SearchTool documents pattern control parameters", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("strictness");
    expect(description).toContain("selector");
  });
});

describe("CLI Flag Reference Completeness", () => {
  test("SearchTool CLI reference includes all core flags", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("--pattern");
    expect(description).toContain("--lang");
    expect(description).toContain("--stdin");
    expect(description).toContain("positional arguments");
  });

  test("SearchTool CLI reference includes context flags", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("--context");
    expect(description).toContain("--before");
    expect(description).toContain("--after");
  });

  test("SearchTool CLI reference includes file filtering flags", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("--globs");
    expect(description).toContain("--no-ignore");
    expect(description).toContain("--follow");
  });

  test("SearchTool CLI reference includes performance flags", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("--threads");
  });

  test("SearchTool CLI reference includes debugging flags", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("--inspect");
  });

  test("SearchTool CLI reference includes language normalization", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("javascript→js");
    expect(description).toContain("typescript→ts");
    expect(description).toContain("python→py");
  });

  test("SearchTool CLI reference includes example command", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("Example:");
    expect(description).toContain("ast-grep run");
  });

  test("SearchTool CLI reference includes documentation reference", () => {
    const schema = SearchTool.getSchema();
    const description = schema.description;

    expect(description).toContain("AST_GREP_DOCUMENTS.md");
  });
});

