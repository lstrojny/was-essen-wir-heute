/**
 * Fold a string for ingredient-name matching.
 *
 * Steps:
 * 1. NFC-normalize so "ö" (U+00F6) and "ö" (NFD: o + U+0308) collapse to one
 *    code point.
 * 2. Locale-aware lower-case under the German locale.
 * 3. **German digraph expansion** (ä↔ae, ö↔oe, ü↔ue, ß↔ss). This is the only
 *    language-specific rule — German conventions treat "Öl"/"Oel" and
 *    "Müller"/"Mueller" as the same word. Without this, neither Intl.Collator
 *    nor generic diacritic stripping would match them.
 * 4. Strip every remaining combining-mark character via the Unicode general
 *    category `\p{M}` (after NFD decomposition). This handles all other
 *    languages' diacritics generically: "é"→"e", "ñ"→"n", "č"→"c", and so on.
 *    Step 3 runs before this so the German digraphs are preserved instead of
 *    being collapsed to bare base letters.
 *
 * Use this on both sides of any ingredient-name equality or substring check.
 */
export function foldForMatch(s: string): string {
    const base = s.trim().normalize('NFC').toLocaleLowerCase('de-DE')
    const withDigraphs = base
        .replaceAll('ä', 'ae')
        .replaceAll('ö', 'oe')
        .replaceAll('ü', 'ue')
        .replaceAll('ß', 'ss')
    return withDigraphs.normalize('NFD').replace(/\p{M}+/gu, '')
}
