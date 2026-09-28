#!/usr/bin/env node
/**
 * package.json gate. A manifest is the one file every tool reads and nobody
 * rereads, so it drifts quietly — and in a packaged desktop app three of its
 * fields decide whether the installer produces something that opens at all. The
 * rules live in @larrydarko/lint-config/gates/package-json.
 *
 * What stays here is this repo's answers.
 *
 * `rootRequired` — identity, provenance and the toolchain facts. There is one
 * manifest: no workspaces, so `workspaceRequired` has nothing to describe.
 * `private: true` is the guard against a stray `npm publish` of the desktop app,
 * and `build`, `main` and `os` are required because the packaging rules below are
 * only as good as the fields they read.
 *
 * `tildeAllowed` — a `~` is a deliberate decision, so it costs a line of prose.
 * TypeScript is the only one: its minor releases introduce new type errors, which
 * makes a minor bump a code change.
 *
 * The packaging rules — entry point, `build.files`, `os`/target parity — take no
 * options. They read the `build` block and electron.vite.config.ts directly.
 */
import { checkPackageJson } from '@larrydarko/lint-config/gates/package-json';

checkPackageJson({
    rootRequired: [
        'name',
        'version',
        'description',
        'keywords',
        'homepage',
        'bugs',
        'license',
        'author',
        'repository',
        'type',
        'main',
        'engines',
        'os',
        'private',
        'packageManager',
        'build',
    ],
    tildeAllowed: {
        typescript:
            'Its minor releases introduce new type errors, so a minor bump is a code change, not a dependency bump.',
    },
});
