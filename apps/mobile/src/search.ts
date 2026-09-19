export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').trim();
}

export function matchesSearch(query: string, values: Array<string | null | undefined>) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return normalizeSearch(values.filter((value): value is string => Boolean(value)).join(' ')).includes(normalized);
}

export function searchMatchLabel(query: string, fields: Array<{ label: string; value: string | null | undefined }>) {
  const normalized = normalizeSearch(query);
  if (!normalized) return null;
  const field = fields.find(item => normalizeSearch(item.value ?? '').includes(normalized));
  if (!field) return null;
  return field.label === 'ad' ? null : field.label;
}
