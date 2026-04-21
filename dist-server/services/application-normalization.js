export function normalizeComparableText(value) {
    if (!value) {
        return undefined;
    }
    const normalized = value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase()
        .replace(/\b(the|inc|llc|ltd|corp|corporation|company|co|plc|gmbh)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return normalized || undefined;
}
export function normalizeCompanyName(value) {
    return normalizeComparableText(value);
}
export function normalizeJobTitle(value) {
    return normalizeComparableText(value);
}
