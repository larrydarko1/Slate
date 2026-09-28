#!/usr/bin/env node
/**
 * Electron security gate — the process-model invariants: webPreferences on every
 * window, navigation containment, permission handlers that deny by default, the
 * boundary of any custom scheme, HTML sinks, RegExp inputs, certificate overrides.
 * The rules live in @larrydarko/lint-config/gates/electron-security.
 *
 * Nothing here needs an option: the renderer has no `v-html` binding and no
 * sanitizer of its own, and the app registers no custom protocol, so the scheme
 * rules are dormant until one appears. The first `v-html` fails until an entry
 * under `vHtml` states why it is safe.
 */
import { checkElectronSecurity } from '@larrydarko/lint-config/gates/electron-security';

checkElectronSecurity({});
