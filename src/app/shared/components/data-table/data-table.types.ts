export type DataTableCellType = 'text' | 'number' | 'currency' | 'date' | 'percentage' | 'change' | 'badge';
export type DataTableAlign = 'left' | 'center' | 'right';
export type DataTableActionVariant = 'default' | 'primary' | 'danger';

export interface DataTableColumn<T> {
    key: keyof T | string;
    label: string;
    type?: DataTableCellType;
    sortable?: boolean;
    align?: DataTableAlign;
    width?: string;
    formatter?: (value: unknown, row: T) => string;
    value?: (row: T) => unknown;
    secondaryFormatter?: (row: T) => string;
    rowClass?: (row: T) => string;
}

export interface DataTableAction<T> {
    id: string;
    label: string;
    icon?: string;
    variant?: DataTableActionVariant;
    visible?: (row: T) => boolean;
    disabled?: (row: T) => boolean;
}

export interface DataTableActionEvent<T> {
    action: DataTableAction<T>;
    row: T;
}
