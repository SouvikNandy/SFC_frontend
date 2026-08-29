import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
    DataTableAction,
    DataTableActionEvent,
    DataTableCellType,
    DataTableColumn,
    DataTableAlign,
} from './data-table.types';

@Component({
    selector: 'app-data-table',
    imports: [],
    templateUrl: './data-table.component.html',
    styleUrl: './data-table.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent<T extends object> {
    readonly columns = input<DataTableColumn<T>[]>([]);
    readonly data = input<T[]>([]);
    readonly loading = input(false);
    readonly emptyMessage = input('No data available.');
    readonly selectable = input(false);
    readonly rowClickable = input(false);
    readonly actions = input<DataTableAction<T>[]>([]);

    readonly actionClick = output<DataTableActionEvent<T>>();
    readonly rowClick = output<T>();
    readonly selectionChange = output<T[]>();

    private selectedRows = new Set<T>();

    getCellValue(row: T, column: DataTableColumn<T>): unknown {
        return column.value ? column.value(row) : (row as unknown as Record<string, unknown>)[String(column.key)];
    }

    formatCell(value: unknown, row: T, column: DataTableColumn<T>): string {
        if (column.formatter) return column.formatter(value, row);
        if (value === null || value === undefined) return '';

        switch (column.type) {
            case 'number':
                return this.formatNumber(value);
            case 'currency':
                return `₹${this.formatNumber(value)}`;
            case 'date':
                return this.formatDate(value);
            case 'percentage':
                return `${this.formatNumber(value)}%`;
            case 'change':
                return this.formatChange(value);
            default:
                return String(value);
        }
    }

    cellType(column: DataTableColumn<T>): DataTableCellType {
        return column.type ?? 'text';
    }

    alignClass(column: DataTableColumn<T>): DataTableAlign {
        return column.align ?? (column.type === 'number' || column.type === 'currency' || column.type === 'percentage' || column.type === 'change' ? 'left' : 'left');
    }

    changeClass(value: unknown): string {
        const numericValue = this.numericValue(value);
        if (numericValue > 0) return 'data-table__change--positive';
        if (numericValue < 0) return 'data-table__change--negative';
        return 'data-table__change--neutral';
    }

    numericValueForClass(value: unknown): number {
        return this.numericValue(value);
    }

    visibleActions(row: T): DataTableAction<T>[] {
        return this.actions().filter(action => !action.visible || action.visible(row));
    }

    isActionDisabled(action: DataTableAction<T>, row: T): boolean {
        return Boolean(action.disabled?.(row));
    }

    hasSelection(row: T): boolean {
        return this.selectedRows.has(row);
    }

    toggleSelection(row: T): void {
        if (this.selectedRows.has(row)) this.selectedRows.delete(row);
        else this.selectedRows.add(row);
        this.selectionChange.emit([...this.selectedRows]);
    }

    emitRowClick(row: T): void {
        this.rowClick.emit(row);
    }

    emitAction(action: DataTableAction<T>, row: T, event: Event): void {
        event.stopPropagation();
        this.actionClick.emit({ action, row });
    }

    trackColumn(_index: number, column: DataTableColumn<T>): string {
        return String(column.key);
    }
    rowClass(row: T): string {
        return this.columns().find(column => column.rowClass)?.rowClass?.(row) ?? '';
    }

    private formatNumber(value: unknown): string {
        const numericValue = this.numericValue(value);
        return Number.isFinite(numericValue)
            ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numericValue)
            : String(value);
    }

    private formatDate(value: unknown): string {
        const date = new Date(String(value));
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    }

    private formatChange(value: unknown): string {
        const numericValue = this.numericValue(value);
        if (!Number.isFinite(numericValue)) return String(value);
        return `${numericValue >= 0 ? '+' : ''}${numericValue.toFixed(2)}`;
    }

    private numericValue(value: unknown): number {
        return typeof value === 'number' ? value : Number(value);
    }
}
