export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function matchesSearch(query: string, values: Array<string | null | undefined>) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return normalizeSearch(values.filter((value): value is string => Boolean(value)).join(' ')).includes(normalized);
}
