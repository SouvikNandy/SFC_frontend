const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,23,456 (rounded); negatives as -₹. */
export const money = (value: number): string => `${value < 0 ? '-' : ''}₹${nf0.format(Math.abs(value))}`;
export const money2 = (value: number): string => `${value < 0 ? '-' : ''}₹${nf2.format(Math.abs(value))}`;
export const price = (value: number): string => nf2.format(value);
/** Explicit sign so profit and loss never rely on colour alone. */
export const signed = (value: number): string => `${value > 0 ? '+' : ''}${money(value)}`;
export const tone = (value: number): 'pos' | 'neg' | '' => (value > 0 ? 'pos' : value < 0 ? 'neg' : '');
export const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
