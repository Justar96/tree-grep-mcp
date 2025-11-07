# Quick Setup Guide for npm Publishing

## 🚀 5-Minute Setup

### Step 1: Get Your NPM Token (2 minutes)

1. Go to https://www.npmjs.com/login
2. Log in to your account (or create one)
3. Click your profile icon → **Access Tokens**
4. Click **Generate New Token** → Select **Automation**
5. Copy the token (looks like: `npm_xxxxxxxxxxx`)

### Step 2: Add Token to GitHub (1 minute)

1. Go to your repo: https://github.com/justar96/tree-grep-mcp
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Paste your token
6. Click **Add secret**

### Step 3: Publish Your First Version (2 minutes)

```bash
# Make sure you're on main branch with latest code
git checkout main
git pull

# Update version in package.json (currently 1.0.0)
npm version 1.0.1

# Push the version commit and tag
git push origin main --tags

# That's it! GitHub Actions will automatically:
# ✅ Run tests
# ✅ Build the project
# ✅ Publish to npm
# ✅ Create GitHub release
```

## 📦 What You Get

After setup, every time you push a tag:

1. **Automatic Testing** - All tests run before publish
2. **Automatic Build** - TypeScript compiled to JavaScript
3. **npm Publish** - Package published with provenance
4. **GitHub Release** - Auto-generated release notes
5. **Bun Support** - Optional Bun registry publishing

## 🔍 Verify It Worked

Wait ~5 minutes, then check:

```bash
# Check on npm
npm view @cabbages/tree-grep

# Test installation
npx -y @cabbages/tree-grep --version

# Check GitHub
# Visit: https://github.com/justar96/tree-grep-mcp/releases
```

## 🎯 Publishing Workflow

```bash
# For bug fixes (1.0.0 → 1.0.1)
npm version patch
git push origin main --tags

# For new features (1.0.0 → 1.1.0)
npm version minor
git push origin main --tags

# For breaking changes (1.0.0 → 2.0.0)
npm version major
git push origin main --tags
```

## ⚠️ Common Issues

### "NPM_TOKEN not found"
→ Did you add the secret to GitHub? Check Step 2 above.

### "Version already exists"
→ You need to increment the version. Use `npm version patch/minor/major`.

### "Permission denied"
→ Make sure you have publish permissions for `@cabbages` scope on npm.

## 📚 Full Documentation

For detailed information, see [PUBLISHING.md](.github/PUBLISHING.md)

## ✅ Current Setup Status

- [x] GitHub Actions workflows configured
  - [x] `.github/workflows/publish.yaml` - Auto-publish on tag
  - [x] `.github/workflows/ci.yaml` - Test on PR/push
- [x] Package.json configured
  - [x] Name: `@cabbages/tree-grep`
  - [x] Version: `1.0.0` (ready for 1.0.1)
  - [x] Public access configured
- [ ] NPM_TOKEN secret (You need to add this!)
- [ ] Optional: BUN_REGISTRY_TOKEN secret

## 🎉 You're Ready!

Once you add the `NPM_TOKEN` secret, you're all set for automatic publishing!
