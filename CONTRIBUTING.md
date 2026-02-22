# Contributing to Caraca

Thanks for your interest in contributing! We love getting help from the community, whether it's fixing a bug, adding a feature, or improving the docs.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before getting started.

## Table of Contents

- [Getting Started](#getting-started)
- [Branching Strategy](#branching-strategy)
- [Making Changes](#making-changes)
- [Secret Scanning with Gitleaks](#secret-scanning-with-gitleaks)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

## Getting Started

**Prerequisites:**
- Node.js v18+
- npm

**Setup:**
1. Fork and clone the repo
2. `npm install`
3. Copy `.env.example` to `.env` and fill in your API keys (see the file for details)
4. `npm run dev` to start the development server

## Branching Strategy

We use a trunk-based workflow:

- `main` is the primary branch (production-ready)
- Create feature branches from `main` using these prefixes:
  - `feat/short-description` for new features
  - `fix/short-description` for bug fixes
  - `docs/short-description` for documentation
- Keep branches short-lived -- rebase on `main` before opening a PR
- Release tags use the `v` prefix: `v1.0.0`, `v1.1.0`

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run build` and `npm run lint` pass
4. Commit using conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`)
5. Push and open a PR against `main`

### Secret Scanning with Gitleaks

We use [gitleaks](https://github.com/gitleaks/gitleaks) to prevent secrets from being committed. To set up the pre-commit hook locally:

1. Install the pre-commit framework: `pip install pre-commit`
2. Install hooks: `pre-commit install`
3. Verify: `pre-commit run gitleaks --all-files`

Add this to your `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.24.2
    hooks:
      - id: gitleaks
```

Run `pre-commit autoupdate` periodically to get the latest version. See the [gitleaks docs](https://github.com/gitleaks/gitleaks#pre-commit) for advanced configuration.

## Pull Request Process

- Fill out the [PR template](.github/PULL_REQUEST_TEMPLATE.md) checklist
- PRs require at least 1 review before merging
- Keep PRs focused -- one feature or fix per PR
- Link related issues using "Closes #N" or "Fixes #N"

## Reporting Issues

- Use the issue templates (bug report or feature request)
- Search existing issues before creating a new one

---

*Caraca v0.1.0 | Last updated: 2026-02-22*
