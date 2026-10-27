/** Median of the jurors' awards. With three jurors it is simply the middle award. */
export function median(values: number[]) {
  if (!values.length) throw new Error("median of nothing");
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function clampPercent(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

const RECORD_TAGS = /<(\/?)(record|agreement|delivery|filing|file|timeline|note|statement|milestone|clauses|parties|summary|links|opinions|juror)\b/gi;

/**
 * Neutralise anything in party-written text that looks like one of the record's own tags, so a party cannot
 * close their filing early and forge a "tribunal instruction" or another party's evidence.
 */
export function fence(value: string) {
  return value.replace(RECORD_TAGS, "‹$1$2");
}
