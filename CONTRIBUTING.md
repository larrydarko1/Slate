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
   npm run test:run  # run tests
   npm run dev       # manual testing
   ```
5. **Commit** with a clear message:
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

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation changes
- `style:` — formatting, no code change
- `refactor:` — code restructuring
- `test:` — adding or updating tests
- `chore:` — maintenance tasks

## Code Style

- **TypeScript** for all source files
- **Vue 3 Composition API** with `<script setup>`
- **SCSS** for styling
- Use descriptive variable and function names
- Keep components focused and composable

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Provide a clear description of what changed and why
- Link related issues (e.g., `Closes # 123`)
- Ensure the app builds without errors: `vue-tsc -b && vite build`
- Ensure tests pass: `npm run test:run`

## Questions?

Open a [discussion](https://github.com/larrydarko1/slate/discussions) or an issue — happy to help!
