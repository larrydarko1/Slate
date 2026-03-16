# Contributing to Slate

Thank you for your interest in contributing to Slate! This guide will help you get started.

## How to Contribute

### Reporting Bugs

- Search [existing issues](https://github.com/larrydarko1/slate/issues) before opening a new one
- Use the **Bug Report** issue template
- Include steps to reproduce, expected vs actual behavior, and your OS/version

### Suggesting Features

- Open a [feature request](https://github.com/larrydarko1/slate/issues/new?template=feature_request.md)
- Describe the use case and why it would be valuable

### Submitting Code

1. **Fork** the repository
2. **Create a branch** from `main`:
    ```bash
    git checkout -b feature/your-feature-name
    ```
3. **Make your changes** — follow the coding style of the project
4. **Test your changes**:
    ```bash
    npm test     # run tests
    npm run dev  # manual testing
    ```
5. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) — commitlint enforces this via a git hook:
    ```bash
    git commit -m "feat: add your feature description"
    ```
6. **Push** and open a **Pull Request** against `main`

## Development Setup

```bash
git clone https://github.com/larrydarko1/slate.git
cd slate
npm install
npm run dev
```

## Commit Message Convention

We enforce [Conventional Commits](https://www.conventionalcommits.org/) via **commitlint** (git hook):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation changes
- `style:` — formatting, no code change
- `refactor:` — code restructuring
- `test:` — adding or updating tests
- `chore:` — maintenance tasks

## Code Style

- **TypeScript** (strict mode) for all source files — no `any` unless justified with a comment
- **Vue 3 Composition API** with `<script setup>`
- **SCSS** for styling, CSS variables for theming
- Single quotes, 4-space indent, 120 char line width, trailing commas (enforced by Prettier)
- ESLint flat config with `typescript-eslint` + `eslint-plugin-vue` + `eslint-config-prettier`
- **Git hooks** (Husky): `pre-commit` runs lint-staged (ESLint + Prettier), `commit-msg` runs commitlint

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Provide a clear description of what changed and why
- Link related issues (e.g., `Closes #123`)
- Ensure the full pipeline passes before submitting:
    ```bash
    npm run lint
    npm run format:check
    npx vue-tsc -b
    npm run build
    npm test
    ```

## Questions?

Open a [discussion](https://github.com/larrydarko1/slate/discussions) or an issue — happy to help!
