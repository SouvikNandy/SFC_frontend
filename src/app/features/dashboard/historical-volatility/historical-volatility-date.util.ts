export function formatHistoricalVolatilityDate(value: string | Date | null | undefined): string {
    if (!value) return '';
    if (typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.test(value)) return value;

    const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}