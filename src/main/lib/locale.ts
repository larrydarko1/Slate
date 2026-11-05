/**
 * locale — the system locale the renderer reads and writes dates in.
 * Owns: turning the OS locale into a tag Intl formats dates by.
 * Does NOT own: date parsing and formatting (renderer engine/dates.ts).
 *
 * The renderer's own Intl default follows the UI language alone, so a Mac set to
 * English (US) with its region set to Malta formats dates as en-US does. macOS
 * reports such a region as an `@rg=mtzzzz` override, which Intl ignores, so the
 * region it names replaces the language's own: en_US@rg=mtzzzz becomes en-MT.
 */

const REGION_SUBTAG = /^(?:[A-Za-z]{2}|\d{3})$/;

/** `systemLocale` as a BCP 47 tag carrying its region, or '' if it is not one. */
export function regionalLocale(systemLocale: string): string {
    const [base = '', ...modifiers] = systemLocale.split('@');
    const rg = /(?:^|;)rg=([A-Za-z]{2})/.exec(modifiers.join(';'))?.[1];
    const [language = '', ...rest] = base.split(/[-_]/);
    const subtags = rg === undefined ? rest : [...rest.filter((s) => !REGION_SUBTAG.test(s)), rg.toUpperCase()];
    try {
        return Intl.getCanonicalLocales([language, ...subtags].join('-'))[0] ?? '';
    } catch {
        return '';
    }
}
