#!/usr/bin/env node
/**
 * Error handling at this app's boundaries. What it checks — IPC handler
 * containment, the process-level backstops, shutdown, and swallows that state a
 * reason — lives in @larrydarko/lint-config/gates/error-handling/electron.
 *
 * `cleanupRequired` is the one thing the gate cannot know, and here it is empty:
 * Slate's main process opens a dialog, reads or writes one .slate file and
 * returns — nothing survives the call. Add a service the day one owns a watcher,
 * a socket or a native session, and the gate will insist `before-quit` releases
 * it. The hook itself is still required, so that service finds somewhere to be
 * released.
 */
import { checkElectronErrorHandling } from '@larrydarko/lint-config/gates/error-handling/electron';

checkElectronErrorHandling({ cleanupRequired: [] });
