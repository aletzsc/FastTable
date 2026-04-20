export function tableImageUrl(tableCode: string, tableHeroImageUrl?: string | null): string {
  if (tableHeroImageUrl && tableHeroImageUrl.trim().length > 0) {
    return tableHeroImageUrl;
  }
  return `https://picsum.photos/seed/${encodeURIComponent(tableCode)}-mesa/900/480`;
}
