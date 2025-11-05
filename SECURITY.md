# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in tree-ast-grep MCP server, please report it responsibly.

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security issues via:

1. **GitHub Security Advisories** (preferred)
   - Go to https://github.com/justar96/tree-grep-mcp/security/advisories
   - Click "Report a vulnerability"
   - Provide detailed information about the vulnerability

2. **Email** (alternative)
   - Contact the maintainer directly through GitHub profile
   - Include detailed reproduction steps
   - Wait for acknowledgment before public disclosure

### What to Include

Please include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)
- Your contact information

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Varies based on severity and complexity

### Security Best Practices

When using this MCP server:

1. **Workspace Isolation**
   - The server validates all file paths within detected workspace boundaries
   - System directories are blocked (`/etc`, `/bin`, `C:\Windows`)
   - Sensitive directories are blocked (`.ssh`, `.aws`)

2. **Binary Security**
   - ast-grep binaries are downloaded from official GitHub releases
   - Binary validation occurs before execution
   - Use `--use-system` flag to use your own ast-grep binary

3. **Path Validation**
   - All paths are normalized and validated
   - Maximum depth limit prevents traversal attacks
   - Windows paths are normalized to forward slashes

4. **Environment Variables**
   - `WORKSPACE_ROOT` - Override workspace detection
   - `AST_GREP_BINARY_PATH` - Custom binary path

### Known Security Considerations

- This tool executes ast-grep on your codebase
- File operations respect workspace boundaries
- `dryRun: false` on ast_replace will modify files
- Always review changes before applying with `dryRun: true`

### Disclosure Policy

- Security issues are disclosed after a fix is released
- CVE identifiers assigned when applicable
- Credit given to reporters (unless anonymity requested)

## Security Updates

Security patches are released as soon as possible after verification. Update to the latest version:

```bash
npm update @cabbages/tree-grep
```

or

```bash
npx -y @cabbages/tree-grep@latest
```
