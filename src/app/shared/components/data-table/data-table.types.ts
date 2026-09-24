import { TemplateRef } from '@angular/core';

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
    /** Optional custom cell renderer; when set it replaces the default formatted value. */
    template?: TemplateRef<DataTableCellContext<T>>;
}

export interface DataTableCellContext<T> {
    $implicit: T;
    value: unknown;
    index: number;
    column: DataTableColumn<T>;
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
