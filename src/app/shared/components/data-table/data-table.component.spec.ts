import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { DataTableComponent } from './data-table.component';
import { DataTableColumn } from './data-table.types';

interface Row { expiry: string; close: number }

@Component({
  standalone: true,
  imports: [DataTableComponent],
  template: '<app-data-table [columns]="columns" [data]="rows"></app-data-table>',
})
class HostComponent {
  columns: DataTableColumn<Row>[] = [{ key: 'expiry', label: 'Expiry', type: 'date' }, { key: 'close', label: 'Close (EOD)', type: 'number' }];
  rows: Row[] = [
    { expiry: '2027-09-28', close: 169.9 },
    { expiry: '2026-09-03', close: 1 },
    { expiry: '2026-10-27', close: 2 },
    { expiry: 'not a date', close: 3 },
  ];
}

describe('DataTableComponent date cells', () => {
  it('format every date as "DD Mon YYYY" with "Sep" (never "Sept"), and leave non-dates as given', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('28 Sep 2027');
    expect(text).toContain('03 Sep 2026');
    expect(text).toContain('27 Oct 2026');
    expect(text).toContain('not a date');
    expect(text).not.toContain('Sept');
  });
});
