# Contributing to tree-ast-grep MCP Server

Thank you for considering contributing to tree-ast-grep! This project provides a direct ast-grep wrapper for the Model Context Protocol.

## Development Setup

### Prerequisites
- Node.js >= 18.0.0 or Bun >= 1.0.0
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/justar96/tree-grep-mcp.git
cd tree-grep-mcp

# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun test
```

## Code Standards

### Core Principles
1. **Zero abstractions** - Direct ast-grep CLI wrapper, no custom DSL
2. **Complete implementations** - No partial code or TODO comments
3. **No code duplication** - Reuse existing functions
4. **Type safety** - Strict TypeScript with full type coverage

### Code Style
- Use TypeScript strict mode
- Follow existing patterns in the codebase
- All functions must have JSDoc comments (Google style)
- Use meaningful variable names
- Maximum line length: 120 characters

### Testing Requirements
- All new features require tests
- No mocking - use real services only
- Tests must be in `tests/` directory
- Follow existing test patterns:
  - `validation.test.ts` - Unit tests
  - `integration.test.ts` - End-to-end tests

### Path Handling
- Never assume `process.cwd()` equals project root
- Always use `WorkspaceManager` for path validation
- Normalize Windows paths to forward slashes

## Pull Request Process

1. **Fork the repository** and create a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following code standards above

3. **Add tests** for new functionality

4. **Run tests** to ensure everything passes
   ```bash
   bun test
   ```

5. **Build the project** to verify compilation
   ```bash
   bun run build
   ```

6. **Commit your changes** with clear messages
   ```bash
   git commit -m "feat: add support for X"
   ```
   Use conventional commits format:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test additions/changes
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

7. **Push to your fork** and create a Pull Request
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Describe your changes** in the PR:
   - What problem does it solve?
   - How does it work?
   - Any breaking changes?
   - Related issues?

## What to Contribute

### Welcome Contributions
- Bug fixes
- Performance improvements
- Documentation improvements
- Test coverage improvements
- Support for additional programming languages
- Enhanced error messages

### Not Accepting
- Custom pattern DSLs (breaks zero-abstraction principle)
- Mocking frameworks in tests
- External API dependencies
- Breaking changes to core CLI compatibility

## Questions or Issues?

- **Bug reports**: Open an issue with reproduction steps
- **Feature requests**: Open an issue describing the use case
- **Questions**: Open a discussion on GitHub

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
