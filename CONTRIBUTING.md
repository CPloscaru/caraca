# Contributing to Caraca

Thanks for your interest in contributing! Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before getting started.

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
- Keep branches short-lived — rebase on `main` before opening a PR
- Release tags use the `v` prefix: `v1.0.0`, `v1.1.0`

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run build` and `npm run lint` pass
4. Commit using conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`)
5. Push and open a PR against `main`

## Pull Request Process

- Fill out the PR template checklist
- PRs require at least 1 review before merging
- Keep PRs focused — one feature or fix per PR
- Link related issues using "Closes #N" or "Fixes #N"

## Reporting Issues

- Use the issue templates (bug report or feature request)
- Search existing issues before creating a new one
