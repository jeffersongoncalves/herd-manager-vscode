# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**JSG Herd Manager** (`JeffersonGoncalves.jsg-herd-manager`) is a VS Code extension (TypeScript) for Laravel Herd: it manages the project's `herd.yml`, links/unlinks/secures the site through the `herd` CLI and keeps `.env` `APP_URL` in sync. It is the VS Code port of `../herd-manager-plugin` (JetBrains) and mirrors its behaviour.

## Commands

```bash
pnpm install
pnpm run compile   # esbuild -> dist/extension.js
pnpm test          # tsc -> out/, then node --test (pure core only, no VS Code host)
pnpm run lint
pnpm dlx @vscode/vsce package --no-dependencies
```

pnpm 11: build-script approval lives in `pnpm-workspace.yaml` (`allowBuilds`), never in `package.json`.

## Architecture

| File | Purpose |
|------|---------|
| `src/core/herdConfig.ts` | `herd.yml` parse/serialize (top-level scalars only, no YAML lib), site name rules, URL, `.env` APP_URL rewrite. No `vscode` import — unit tested |
| `src/core/herdDetector.ts` | Herd executable, PHP versions (`php.json`), TLD and linked sites (valet config/Sites) per platform, CLI output cleaning. `Env` is injectable for tests |
| `src/herd.ts` | Reads the workspace state, saves `herd.yml` + `.env`, runs the CLI (`exec` for `herd.bat`, `execFile` otherwise) |
| `src/extension.ts` | Commands, Herd tree view, status bar item, `herd.yml` watcher, startup hint |

Site names are validated (`[a-z0-9-]`) before reaching the CLI, which is what makes joining args for `cmd.exe` safe.

## Release

Bump `version` in `package.json`, publish a GitHub release: `.github/workflows/release.yml` packages the `.vsix`, attaches it to the release and publishes to the Marketplace when the `VSCE_PAT` secret exists. The CHANGELOG is updated by `update-changelog.yml` — don't edit it by hand.
