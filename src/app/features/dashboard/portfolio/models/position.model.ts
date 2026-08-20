export interface Position {
    sym: string;
    sub: string;
    type: 'CE' | 'PE' | 'EQ' | string;
    qty: number;
    avg: number;
    cmp: number;
    entryDate?: string;
}
