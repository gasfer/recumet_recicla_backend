import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject, signal } from '@angular/core';
import { ColsTable, SearchFor } from '../interfaces/OptionsTable.interface';
import { Subject, debounceTime } from 'rxjs';
import { UntypedFormControl } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Paginator } from 'primeng/paginator';
import { Table, TableLazyLoadEvent } from 'primeng/table';
import { ComponentsService } from '../../services/components.service';
import { Router } from '@angular/router';
import { ValidatorsService } from 'src/app/services/validators.service';

@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styles: [`

    /* ══════════════════════════════════════════════════════
       DESIGN TOKENS — catálogo premium estilo AliExpress
     ══════════════════════════════════════════════════════ */
    :host {
      --cp:           var(--bg-primary, #1a3fa8);
      --cp-mid:       #3d5fc4;
      --cp-light:     #e8eef8;
      --accent:       #f97316;
      --surface:      #ffffff;
      --bg:           #f4f5fa;
      --border:       #e5e7f0;
      --border-dash:  #dde0ec;
      --text:         #111827;
      --text-sm:      #4b5568;
      --text-xs:      #9ca3af;
      --radius:       12px;
      --radius-sm:    8px;
      --shadow:       0 1px 4px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.035);
      --shadow-hover: 0 8px 28px rgba(0,0,0,.13), 0 0 0 1.5px var(--cp-mid);
      --t:            .2s cubic-bezier(.4,0,.2,1);
    }

    /* ── TABLA ORIGINAL ── */
    :host ::ng-deep .p-datatable .p-datatable-thead > tr > th {
      position: sticky; top: 0; z-index: 1;
    }
    :host ::ng-deep #table .p-datatable-header {
      border-top-right-radius: 20px;
      border-top-left-radius: 20px;
    }
    .layout-news-active :host ::ng-deep .p-datatable tr > th { top: 0; z-index: 1; }
    @media (max-width: 992px) { .tdwith { max-width: none !important; } }
    :host ::ng-deep #table .p-datatable tfoot { position: sticky; bottom: 0; z-index: 2; }
    .group-header-row {
      background-color: #e0f2fe; font-weight: bold;
      color: #1e3a8a; border-bottom: 1px solid #bae6fd; padding: 8px;
    }

    /* ══════════════════════════════════════════════════════
       VIEW TOGGLE BAR
     ══════════════════════════════════════════════════════ */
    .view-toggle-bar {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 6px; padding: 10px 18px 8px; background: var(--bg);
    }
    .view-toggle-bar button {
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 5px 14px;
      cursor: pointer; color: var(--text-xs);
      transition: all var(--t);
      display: flex; align-items: center; gap: 6px;
      font-size: 11.5px; font-weight: 600; letter-spacing: .25px;
    }
    .view-toggle-bar button i { font-size: 12px; }
    .view-toggle-bar button.active,
    .view-toggle-bar button:hover {
      background: var(--cp); color: #fff; border-color: var(--cp);
      box-shadow: 0 2px 10px rgba(26,63,168,.28);
      transform: translateY(-1px);
    }

    /* ══════════════════════════════════════════════════════
       VISTA CARDS (rc = row-card)
     ══════════════════════════════════════════════════════ */
    :host ::ng-deep .cards-table-mode .p-datatable-tbody > tr > td {
      border: none !important; padding: 4px 14px !important; background: transparent !important;
    }
    :host ::ng-deep .cards-table-mode .p-datatable-tbody > tr {
      background: transparent !important; box-shadow: none !important; border: none !important;
    }
    :host ::ng-deep .cards-table-mode .p-datatable-wrapper { background: var(--bg); padding: 8px 0; }
    .rc-row { background: transparent !important; }
    .rc-cell { padding: 4px 14px !important; border: none !important; background: transparent !important; }
    .rc {
      display: flex; align-items: center; gap: 14px;
      background: var(--surface); border-radius: var(--radius);
      border: 1px solid var(--border); box-shadow: var(--shadow);
      padding: 10px 16px;
      transition: box-shadow var(--t), border-color var(--t), transform var(--t);
      animation: tblFadeIn .22s ease;
    }
    .rc:hover { box-shadow: var(--shadow-hover); transform: translateX(3px); }
    .rc__img {
      flex-shrink: 0; width: 58px; height: 58px;
      border-radius: var(--radius-sm); overflow: hidden;
      background: var(--bg); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
    }
    .rc__img img { width: 100%; height: 100%; object-fit: contain; padding: 4px; transition: transform .25s; cursor: zoom-in; }
    .rc__img img:hover { transform: scale(1.12); }
    .rc__body { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 18px; min-width: 0; }
    .rc__tag-wrap { display: inline-flex; align-items: center; }
    :host ::ng-deep .rc__tag-wrap .p-tag { font-size: 10px !important; padding: 2px 8px !important; }
    .rc__field { display: flex; flex-direction: column; min-width: 72px; max-width: 210px; }
    .rc__label { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: var(--text-xs); line-height: 1.1; white-space: nowrap; font-weight: 600; }
    .rc__value { font-size: 12.5px; font-weight: 600; color: var(--text); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rc__actions { flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-items: center; }
    :host ::ng-deep .rc__actions .p-button { padding: 5px 11px !important; border-radius: var(--radius-sm) !important; }
    :host ::ng-deep .rc__actions .p-button .p-button-icon { font-size: 14px !important; }
    :host ::ng-deep .rc__actions .p-button .p-button-label { font-size: 11.5px !important; font-weight: 600 !important; }

    /* ══════════════════════════════════════════════════════
       VISTA GRID — CATÁLOGO PREMIUM
       6 cols fijas · imagen dominante · badge código único
     ══════════════════════════════════════════════════════ */

    .gc-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 16px;
      padding: 18px 20px 24px;
      background: var(--bg);
      animation: tblFadeIn .35s ease;
    }

    /* ── CARD ── */
    .gc-card {
      background: var(--surface);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      overflow: hidden;
      display: flex; flex-direction: column;
      transition: transform var(--t), box-shadow var(--t);
      animation: tblFadeIn .3s ease both;
    }
    .gc-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-hover); }

    /* stagger entrada */
    .gc-card:nth-child(1)  { animation-delay: .03s; }
    .gc-card:nth-child(2)  { animation-delay: .07s; }
    .gc-card:nth-child(3)  { animation-delay: .11s; }
    .gc-card:nth-child(4)  { animation-delay: .15s; }
    .gc-card:nth-child(5)  { animation-delay: .19s; }
    .gc-card:nth-child(6)  { animation-delay: .23s; }
    .gc-card:nth-child(n+7){ animation-delay: .26s; }

    /* ── ZONA IMAGEN ── */
    .gc-card__img-wrap {
      position: relative;
      background: #f7f8fc;
      height: 155px;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
      cursor: zoom-in;
    }
    .gc-card__img {
      width: 100%; height: 100%;
      object-fit: contain; padding: 12px;
      transition: transform .35s cubic-bezier(.34,1.4,.64,1);
      pointer-events: none;
    }
    .gc-card:hover .gc-card__img { transform: scale(1.09); }

    /* separador sutil bajo imagen */
    .gc-card__img-wrap::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent 5%, var(--border) 50%, transparent 95%);
    }

    /* overlay hover */
    .gc-img-overlay {
      position: absolute; inset: 0;
      background: transparent;
      display: flex; align-items: center; justify-content: center;
      transition: background var(--t);
    }
    .gc-card__img-wrap:hover .gc-img-overlay { background: rgba(26,63,168,.07); }
    .gc-img-overlay i {
      font-size: 20px; color: #fff;
      opacity: 0; transform: scale(.6);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,.5));
      transition: opacity .2s, transform .2s;
    }
    .gc-card__img-wrap:hover .gc-img-overlay i { opacity: 1; transform: scale(1); }

    /* ── BADGE CÓDIGO — único, pie de imagen, centrado ── */
    .gc-cod-badge {
      position: absolute; bottom: 0; left: 50%;
      transform: translateX(-50%);
      background: var(--cp);
      color: #fff;
      font-size: 8.5px; font-weight: 800;
      letter-spacing: .7px; text-transform: uppercase;
      padding: 3px 10px 3px 8px;
      border-radius: 6px 6px 0 0;
      white-space: nowrap; max-width: 88%;
      overflow: hidden; text-overflow: ellipsis;
      z-index: 4;
      display: inline-flex; align-items: center; gap: 4px;
      box-shadow: 0 -2px 6px rgba(26,63,168,.18);
    }
    .gc-cod-badge::before { content: '#'; opacity: .55; font-size: 8px; }

    /* ── TAGS esquina superior derecha ── */
    .gc-tags-overlay {
      position: absolute; top: 8px; right: 8px;
      display: flex; flex-direction: column; gap: 4px; z-index: 3;
    }
    :host ::ng-deep .gc-tags-overlay .p-tag {
      font-size: 9px !important; padding: 2px 8px !important;
      border-radius: 6px !important; box-shadow: 0 1px 5px rgba(0,0,0,.15) !important; font-weight: 700 !important;
    }

    /* ── placeholder sin imagen ── */
    .gc-no-img {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; width: 100%; height: 100%; color: #c5cad6;
    }
    .gc-no-img i { font-size: 34px; opacity: .35; }
    .gc-no-img span { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }

    /* ── CUERPO CARD ── */
    .gc-card__body {
      padding: 11px 13px 9px;
      flex: 1; display: flex; flex-direction: column; gap: 0;
    }

    /* nombre: 2 líneas */
    .gc-card__title {
      font-size: 12.5px; font-weight: 700; color: var(--text);
      line-height: 1.4; margin: 0 0 8px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; min-height: 35px;
    }

    /* fila campo */
    .gc-field {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 6px; padding: 5px 0;
      border-top: 1px dashed var(--border-dash);
    }
    .gc-field:first-of-type { border-top: 1px solid var(--border); }

    .gc-field__label {
      font-size: 9px; color: var(--text-xs);
      text-transform: uppercase; letter-spacing: .45px;
      white-space: nowrap; flex-shrink: 0;
      padding-top: 1px; font-weight: 600; line-height: 1.5;
    }
    .gc-field__value {
      font-size: 12px; font-weight: 700; color: var(--text);
      text-align: right; word-break: break-word; line-height: 1.4;
    }
    /* descripción: máx 3 líneas con ellipsis */
    .gc-field__value--clamp {
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      overflow: hidden; text-overflow: ellipsis;
      white-space: normal; text-align: right;
    }

    /* "ver todo" */
    .gc-more-hint {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 9.5px; color: var(--cp-mid); font-weight: 700;
      cursor: pointer; margin-top: 5px;
      opacity: .65; transition: opacity .15s; align-self: flex-end;
    }
    .gc-more-hint:hover { opacity: 1; text-decoration: underline; }

    /* ── BOTONES PIE ── */
    .gc-card__actions {
      padding: 8px 12px 10px;
      display: flex; flex-wrap: wrap; gap: 6px;
      border-top: 1px solid var(--border);
      justify-content: center;
      background: linear-gradient(180deg, #fafbfe 0%, #f4f5fa 100%);
    }
    :host ::ng-deep .gc-card__actions .p-button { padding: 5px 10px !important; border-radius: var(--radius-sm) !important; }
    :host ::ng-deep .gc-card__actions .p-button .p-button-icon { font-size: 13px !important; }
    :host ::ng-deep .gc-card__actions .p-button .p-button-label { font-size: 10.5px !important; font-weight: 700 !important; }

    /* ══════════════════════════════════════════════════════
       MODAL DETALLE — premium
     ══════════════════════════════════════════════════════ */
    :host ::ng-deep .gc-detail-dialog .p-dialog {
      border-radius: 16px !important; overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,.22) !important;
    }
    :host ::ng-deep .gc-detail-dialog .p-dialog-header {
      background: linear-gradient(130deg, var(--cp) 0%, #2d55c8 100%);
      color: #fff; padding: 16px 22px 14px;
    }
    :host ::ng-deep .gc-detail-dialog .p-dialog-header .p-dialog-title { color: #fff; }
    :host ::ng-deep .gc-detail-dialog .p-dialog-header .p-dialog-header-close { color: rgba(255,255,255,.75) !important; }
    :host ::ng-deep .gc-detail-dialog .p-dialog-header .p-dialog-header-close:hover {
      color: #fff !important; background: rgba(255,255,255,.15) !important;
    }
    :host ::ng-deep .gc-detail-dialog .p-dialog-content { padding: 0; }
    :host ::ng-deep .gc-detail-dialog .p-dialog-footer {
      padding: 10px 20px 14px; border-top: 1px solid var(--border); background: #fafbfe;
    }

    .gc-dialog-header { display: flex; align-items: center; gap: 10px; }
    .gc-dialog-title { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.3; }
    .gc-dialog-body { display: flex; flex-direction: column; }

    .gc-dialog-img-wrap {
      background: linear-gradient(160deg, #f5f6fb 0%, #eef0f9 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 22px 22px 14px; border-bottom: 1px solid var(--border); gap: 12px;
    }
    .gc-dialog-img {
      max-height: 270px; max-width: 100%; object-fit: contain;
      border-radius: 10px; box-shadow: 0 4px 24px rgba(15,20,60,.1);
      transition: transform .3s ease; cursor: zoom-in;
    }
    .gc-dialog-img:hover { transform: scale(1.03); }
    .gc-dialog-zoom-btn { align-self: flex-end; }

    .gc-dialog-fields { display: grid; grid-template-columns: 1fr 1fr; padding: 6px 0 2px; }
    .gc-dialog-field {
      display: flex; flex-direction: column;
      padding: 10px 20px; border-bottom: 1px solid #f0f2f9; gap: 3px;
      transition: background .15s;
    }
    .gc-dialog-field:hover { background: #f8f9fd; }
    .gc-dialog-field--full { grid-column: 1 / -1; }
    .gc-dialog-field__label {
      font-size: 9px; text-transform: uppercase; letter-spacing: .55px;
      color: var(--text-xs); font-weight: 700;
    }
    .gc-dialog-field__value {
      font-size: 13px; font-weight: 700; color: var(--text); line-height: 1.45; word-break: break-word;
    }
    .gc-dialog-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

    /* ── ANIMACIÓN ── */
    @keyframes tblFadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── RESPONSIVE ── */
    @media (max-width: 1440px) {
      .gc-grid { grid-template-columns: repeat(5, minmax(0,1fr)); gap: 14px; }
    }
    @media (max-width: 1140px) {
      .gc-grid { grid-template-columns: repeat(4, minmax(0,1fr)); gap: 13px; padding: 16px; }
    }
    @media (max-width: 860px) {
      .gc-grid { grid-template-columns: repeat(3, minmax(0,1fr)); gap: 11px; padding: 14px; }
      .gc-card__img-wrap { height: 125px; }
      .gc-dialog-fields { grid-template-columns: 1fr; }
    }
    @media (max-width: 580px) {
      .gc-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; padding: 12px; }
      .gc-card__img-wrap { height: 115px; }
      .rc { flex-wrap: wrap; }
      .rc__actions { width: 100%; justify-content: flex-start; }
    }

    /* Estilo premium para agrupamiento por categorías en modo Cards */
    .group-header-row-cards {
      background: #2d3748 !important;
      color: #ffffff !important;
      border: none !important;
    }
    .group-header-row-cards td {
      background: #2d3748 !important;
      padding: 0 !important;
      border: none !important;
    }
    .group-header-content-cards {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      font-weight: 700;
      font-size: 13.5px;
      letter-spacing: .75px;
      text-transform: uppercase;
    }
  `]
})
export class TableComponent implements OnInit, OnDestroy, OnChanges {
  @Input() cols: ColsTable[] = [];
  @Input() searchFor: SearchFor[] = [];
  @Input() searchTxt: string = '';
  @Input() groupRowsBy: string = '';
  @Input() data!: any;
  @Input() loading: boolean = true;
  @Input() isCustomSort: boolean = true;
  @Input() customPagination: boolean = false;
  @Input() includeSearch: boolean = true;
  @Input() sortField: string = 'id';
  @Input() sortOrder: 'ASC' | 'DESC' = 'DESC';
  @Output() rows!: number;
  @Output() rows$: EventEmitter<{ rows: number, page: number }> = new EventEmitter;
  @Output() search$: EventEmitter<{ type: string, query: string }> = new EventEmitter;
  @Output() customSort$: EventEmitter<{ field: string | string[], order: 'ASC' | 'DESC' }> = new EventEmitter;

  validatorsService = inject(ValidatorsService);
  from: number = 0;
  to: number = 0;
  total: number = 0;
  heightTable: string = '700px';
  debounced: Subject<string> = new Subject();
  txtTermino: UntypedFormControl = new UntypedFormControl();
  searchSelect: UntypedFormControl = new UntypedFormControl();
  pipe = new DatePipe('en-US');
  pipeNumber = new DecimalPipe('en-US');
  decimalLength = signal(this.validatorsService.decimalLength());
  decimal = signal(`1.${this.decimalLength()}-${this.decimalLength()}`);
  first: number = 0;
  page: number = 0;
  stringSearch: string[] = [];

  /** Modo de vista: 'table' | 'cards' | 'grid' */
  viewMode: 'table' | 'cards' | 'grid' = 'table';

  /** Modal detalle */
  detailModalVisible: boolean = false;
  detailRow: any = null;

  @ViewChild('paginator') paginator!: Paginator;
  @ViewChild('dt') dt: Table | undefined;
  private componentsService = inject(ComponentsService);
  private router = inject(Router);

  ngOnChanges(simpleChange: SimpleChanges): void {
    this.from = this.data?.from ?? 1;
    this.to = this.data?.to ?? 0;
    this.total = this.data?.total ?? 0;
    this.rows = this.data?.per_page ?? 0;
    this.stringSearch = this.cols.map(resp => resp.field) as string[];
    if (this.searchTxt) {
      this.txtTermino.setValue(this.searchTxt);
    }
  }

  ngOnInit(): void {
    this.searchSelect.setValue(this.searchFor[0]?.code);
    this.debounced.pipe(debounceTime(500))
      .subscribe(valor => {
        if (this.txtTermino.value === valor) {
          this.search$.emit({ type: this.searchSelect.value, query: valor });
        }
      });
  }

  ngOnDestroy(): void {
    this.debounced.unsubscribe();
  }

  openViewImage(data: any): void {
    this.componentsService.openModalImage(data.cod, data.name, data.img, 'products', '45vw');
  }

  openDetailModal(rowData: any): void {
    this.detailRow = rowData;
    this.detailModalVisible = true;
  }

  applyFilterGlobal($event: any, stringVal: string) {
    this.dt!.filterGlobal(($event.target as HTMLInputElement).value, stringVal);
  }

  search(): void {
    this.searchTxt = '';
    const txtInput = this.txtTermino.value ?? '';
    if (txtInput.length === 0) {
      this.search$.emit({ query: '', type: '' });
      return;
    }
    this.debounced.next(txtInput);
  }

  clearSearch() {
    this.searchTxt = '';
    this.txtTermino.setValue('');
    this.search$.emit({ query: '', type: '' });
  }

  paginate(event: any) {
    this.page = event.page + 1;
    const rows = event.rows;
    this.rows = rows;
    this.heightTable = rows === 50 ? '700px' : '800px';
    this.rows$.emit({ rows, page: this.page });
  }

  getRowData(rowData: any, colField: any) {
    let valReturn = colField.field.split('.').reduce((o: any, x: any) =>
      (typeof o == 'undefined' || o === null) ? o : o[x], rowData);
    if (colField.isDate) {
      valReturn = colField.isNotDateAndHour
        ? this.pipe.transform(valReturn, 'dd/MM/yyyy')!
        : this.pipe.transform(valReturn, 'dd/MM/yyyy, HH:mm')!;
    }
    if (colField.isTextArray) { valReturn = valReturn?.join('\n'); }
    return valReturn;
  }

  getRowData2(rowData: any, colField: any) {
    let valReturn = colField.field2.split('.').reduce((o: any, x: any) =>
      (typeof o == 'undefined' || o === null) ? o : o[x], rowData);
    if (colField.isDate) {
      valReturn = colField.isNotDateAndHour
        ? this.pipe.transform(valReturn, 'dd/MM/yyyy')!
        : this.pipe.transform(valReturn, 'dd/MM/yyyy, HH:mm')!;
    }
    return valReturn;
  }

  getReturnDisable(disabled: boolean) {
    if (disabled == undefined) return false;
    return !disabled;
  }

  customSort(event: TableLazyLoadEvent) {
    const field = event.sortField ?? 'id';
    const order = event.sortOrder == 1 ? 'ASC' : 'DESC';
    this.customSort$.emit({ field, order });
    this.paginator?.changePage(0);
  }

  returnLink(link: string, value: string) {
    const _link = link.replace('${value}', value);
    this.router.navigateByUrl(_link);
  }

  hasFooter(columns: ColsTable[]): boolean {
    return columns?.some(col => col.footer);
  }

  formatTooltip(value: any): string {
    try {
      if (!isNaN(Number(value))) return this.pipeNumber.transform(value, this.decimal()) || '';
      return value;
    } catch { return value; }
  }

  getGroupValue(rowData: any): any {
    return this.groupRowsBy.split('.').reduce((obj, key) => obj?.[key], rowData);
  }

  getGroupTotal(groupValue: any, colField: ColsTable): number {
    if (this.data && this.data.categoryTotals && this.data.categoryTotals[groupValue]) {
      const fieldStr = Array.isArray(colField.field) ? colField.field[0] : colField.field;
      const fieldName = fieldStr ? fieldStr.split('.').pop() : undefined;
      if (fieldName && this.data.categoryTotals[groupValue][fieldName] !== undefined) {
        return Number(this.data.categoryTotals[groupValue][fieldName] || 0);
      }
    }
    if (!this.data || !this.data.data || !colField.field) return 0;
    const fieldStr = Array.isArray(colField.field) ? colField.field[0] : colField.field;
    return this.data.data
      .filter((row: any) => this.getGroupValue(row) === groupValue)
      .reduce((sum: number, row: any) => {
        const val = fieldStr.split('.').reduce((o: any, x: any) =>
          (typeof o == 'undefined' || o === null) ? o : o[x], row);
        return sum + Number(val || 0);
      }, 0);
  }

  formatGroupTotal(groupValue: any, col: ColsTable): string {
    const total = this.getGroupTotal(groupValue, col);
    if (col.tagValue) {
      return col.tagValue(total);
    }
    return String(total);
  }

  hasImgCol(): boolean { return this.cols.some(c => c.isImg); }
  hasButtonCol(): boolean { return this.cols.some(c => c.isButton); }

  isCodField(col: ColsTable): boolean {
    const f = Array.isArray(col.field) ? col.field[0] : col.field;
    return f === 'cod' || f === 'code' || f === 'sku';
  }

  getImgSrc(rowData: any, col: ColsTable): any {
    const f = Array.isArray(col.field) ? col.field[0] : (col.field as string);
    return f ? rowData[f] : null;
  }

  getTypeImg(col: ColsTable): string { return col.typeImg ?? ''; }

  getButtons(rowData: any, col: ColsTable): any[] {
    const f = Array.isArray(col.field) ? col.field[0] : (col.field as string);
    return f ? (rowData[f] ?? []) : [];
  }

  getLink(col: ColsTable): string { return col.link ?? ''; }

  getTagColor(col: ColsTable, rowData: any): string {
    return col.tagColor ? col.tagColor(this.getRowData(rowData, col)) : '';
  }

  getTagValue(col: ColsTable, rowData: any): string {
    return col.tagValue ? col.tagValue(this.getRowData(rowData, col)) : '';
  }

  getTagIcon(col: ColsTable, rowData: any): string {
    return col.tagIcon ? col.tagIcon(this.getRowData(rowData, col)) : '';
  }

  countDataCols(cols: ColsTable[]): number {
    return cols.filter(c => !c.isButton && !c.isImg && !c.isTag && !c.isArray).length;
  }

  getCategoryIcon(categoryName: any): string {
    if (!categoryName) return 'fa-solid fa-folder';
    const name = String(categoryName).toUpperCase();
    if (name.includes('BASURA') || name.includes('RESIDUO')) return 'fa-solid fa-trash';
    if (name.includes('EQUIPO') || name.includes('MAQUINARIA') || name.includes('HERRAMIENTA')) return 'fa-solid fa-screwdriver-wrench';
    if (name.includes('METAL') || name.includes('ACERO') || name.includes('COBRE') || name.includes('ALUMINIO')) return 'fa-solid fa-cubes';
    if (name.includes('MATERIA') || name.includes('PRIMA')) return 'fa-solid fa-boxes-stacked';
    return 'fa-solid fa-folder';
  }
}
