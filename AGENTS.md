# Repository Guidelines

## Project Structure & Module Organization
The repository is a Chrome Extension built with React, TypeScript, and Vite.
- **src/background**: Service worker entries (e.g., index.ts).
- **src/content**: Content scripts injected into pages (scanner.ts).
- **src/popup**: React Application UI.
- **src/shared**: Utilities, types, and messaging logic.
- **dist/**: Build artifacts.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server.
- `npm run build`: Typecheck and build for production.
- `npm run typecheck`: Run TypeScript checks.

## Coding Style & Naming Conventions
- **Language**: TypeScript/ESNext.
- **Naming**: camelCase for functions, PascalCase for components.
- **Indentation**: 2 spaces (implied by typical standard).

## Testing Guidelines
- Automated tests are currently not configured.
- **Manual Testing**: Load `dist` folder in chrome://extensions.

## Commit & Pull Request Guidelines
- Use conventional commits (feat, fix, chore).
- PRs should describe the changes and verification steps.
