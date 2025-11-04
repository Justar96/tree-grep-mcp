# Publishing Guide

This document explains how to publish `@cabbages/tree-grep` to npm and Bun registries using GitHub Actions.

## Prerequisites

### 1. NPM Account and Token

1. Create an npm account at https://www.npmjs.com/signup
2. Enable 2FA (Two-Factor Authentication) for your account
3. Generate an automation token:
   - Go to https://www.npmjs.com/settings/[your-username]/tokens
   - Click "Generate New Token" → "Automation"
   - Copy the token (you won't see it again!)

### 2. Add NPM Token to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm automation token
6. Click **Add secret**

### 3. (Optional) Bun Registry Token

If you want to publish to Bun's JSR registry:

1. Create an account at https://jsr.io
2. Generate an API token
3. Add it as `BUN_REGISTRY_TOKEN` in GitHub secrets (same steps as above)

**Note:** Bun registry publishing is optional and won't fail the workflow if not configured.

## Publishing Process

### Method 1: Automatic Publishing (Recommended)

The workflow automatically publishes when you push a version tag:

1. **Update version in package.json:**
   ```bash
   # Edit package.json and change version to desired version
   npm version patch  # or minor, or major
   # This creates a commit and git tag
   ```

2. **Push the tag to GitHub:**
   ```bash
   git push origin main
   git push origin --tags
   ```

3. **Monitor the workflow:**
   - Go to GitHub → Actions tab
   - Watch the "Publish to npm and Bun" workflow
   - It will:
     - Install dependencies
     - Run tests
     - Build the project
     - Verify version matches tag
     - Publish to npm (and optionally Bun)
     - Create a GitHub Release

### Method 2: Manual Publishing

You can manually trigger a publish without creating a tag:

1. Go to GitHub → Actions tab
2. Select "Publish to npm and Bun" workflow
3. Click "Run workflow"
4. Enter the tag version (e.g., `v1.0.1`)
5. Click "Run workflow"

## Version Numbering

Follow semantic versioning (SemVer):

- **MAJOR** (1.x.x): Breaking changes
- **MINOR** (x.1.x): New features, backward compatible
- **PATCH** (x.x.1): Bug fixes, backward compatible

Examples:
```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch

# Minor release (1.0.0 → 1.1.0)
npm version minor

# Major release (1.0.0 → 2.0.0)
npm version major

# Specific version
npm version 1.2.3
```

## Workflow Details

### What the Publish Workflow Does

1. **Checkout code** with full git history
2. **Setup Node.js 20** with npm registry authentication
3. **Setup Bun** (latest version)
4. **Install dependencies** using Bun
5. **Run tests** - fails if tests don't pass
6. **Build project** - compiles TypeScript to JavaScript
7. **Verify build** - ensures build/index.js exists
8. **Extract version** from git tag
9. **Verify version match** - package.json version must match tag
10. **Publish to npm** with provenance (supply chain security)
11. **Publish to Bun** (optional, continues on error)
12. **Create GitHub Release** with auto-generated release notes

### CI Workflow (Continuous Integration)

Runs on every push and pull request to `main` or `develop`:

- **Matrix testing:** Tests on Ubuntu, Windows, and macOS
- **Node versions:** Tests with Node.js 18, 20, and 22
- **Steps:**
  - Linting (if configured)
  - Build verification
  - Unit tests
  - Integration tests
  - Package installation test
  - Coverage report (on Ubuntu only)

## Troubleshooting

### "Version mismatch" error

**Problem:** The version in package.json doesn't match the git tag.

**Solution:**
```bash
# Check current version
cat package.json | grep version

# Update to match tag
npm version 1.0.1 --no-git-tag-version

# Or create matching tag
git tag v1.0.1
git push origin v1.0.1
```

### "NPM_TOKEN not found" error

**Problem:** GitHub secret not configured.

**Solution:** Follow "Add NPM Token to GitHub Secrets" section above.

### "Permission denied" on npm publish

**Problem:** Your npm token doesn't have publish permissions.

**Solution:**
1. Generate a new **Automation** token (not Classic or Publish)
2. Ensure you have permissions for `@cabbages` scope
3. Update the `NPM_TOKEN` secret

### Build fails locally but passes in CI

**Problem:** Different Node/Bun versions or missing dependencies.

**Solution:**
```bash
# Clean install
rm -rf node_modules bun.lockb
bun install

# Rebuild
bun run build

# Test
bun test
```

### Tests fail in workflow

**Problem:** Tests passing locally but failing in CI.

**Solution:**
- Check test output in GitHub Actions logs
- Tests may be environment-specific
- Use `--bail` flag to stop on first failure
- Review test fixtures and paths

## Publishing Checklist

Before publishing a new version:

- [ ] All tests pass locally (`bun test`)
- [ ] Build succeeds (`bun run build`)
- [ ] CHANGELOG.md is updated with changes
- [ ] Version number follows SemVer
- [ ] Breaking changes are documented
- [ ] README.md is up to date
- [ ] No uncommitted changes
- [ ] On main/develop branch

## Post-Publishing

After successful publish:

1. **Verify on npm:**
   ```bash
   npm view @cabbages/tree-grep
   ```

2. **Test installation:**
   ```bash
   npm install -g @cabbages/tree-grep@latest
   npx @cabbages/tree-grep --version
   ```

3. **Check GitHub Release:**
   - Visit: https://github.com/justar96/tree-grep-mcp/releases
   - Verify release notes are correct

4. **Announce:**
   - Update project README
   - Notify users of changes
   - Tweet/social media (if desired)

## Security Notes

- ✅ **Provenance:** Workflow uses `--provenance` flag for supply chain security
- ✅ **2FA:** npm requires 2FA for publish operations
- ✅ **Automation tokens:** Use automation tokens, not personal tokens
- ✅ **Scoped package:** `@cabbages/` scope prevents name squatting
- ✅ **Public access:** Explicitly set with `--access public`

## Support

If you encounter issues:

1. Check GitHub Actions logs
2. Review this guide
3. Check npm documentation: https://docs.npmjs.com
4. Open an issue: https://github.com/justar96/tree-grep-mcp/issues
