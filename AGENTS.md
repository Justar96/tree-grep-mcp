## Important Development Patterns

it is important to always search for best reference from asy-grep `https://ast-grep.github.io/,https://ast-grep.github.io/guide/introduction.html` documentation and usage best practices.
>Programmatic Usage
ast-grep also provides node-js binding to access syntax trees programmatically. You can use jQuery like utility methods to traverse syntax tree nodes. Node API also has opt-in type safety.
 
### Error Handling Strategy

- **Fail fast** for critical configuration errors
- **Log and continue** for optional feature failures
- **Graceful degradation** when external services are unavailable
- **User-friendly messages** through proper error context

### Testing Philosophy

- Always check existing test patterns before adding new tests
- **Use real services only - no mocking**
- Complete each test fully before proceeding to the next
- Structure tests correctly before blaming the codebase
- Write verbose tests for debugging purposes
- Test every function with meaningful assertions

### Code Quality Standards (NON-NEGOTIABLE)

- Complete implementations only - no partial work or "TODO" comments
- No code duplication - reuse existing functions and constants
- No dead code - delete unused code entirely
- Clean separation of concerns
- No emojis - use ASCII characters or unicode if necessary
- Always use existing types and create only new meaningful type interfaces
- Never leave function stubs - stop and ask for requirements if unclear
- Never use rigid constants - always use config options or defined constants
- All docstrings must follow Google style conventions.

## Common Pitfalls

### Path Resolution
1. Don't assume `Path.cwd()` equals project root
2. Always use utilities from `***/utils/***`
3. Never hardcode paths like `"database/"` or `"models/"`
4. Create directories after resolving paths