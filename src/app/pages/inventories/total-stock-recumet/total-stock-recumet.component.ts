import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ValidatorsService } from 'src/app/services/validators.service';
import { FormSearchKardex, Kardexes } from '../interfaces/kardex.interface';
import { KardexService } from '../services/kardex.service';
import * as moment from 'moment';
import { ColsTable } from 'src/app/core/components/interfaces/OptionsTable.interface';
import { DecimalPipe } from '@angular/common';
import { SucursalesService } from 'src/app/pages/managements/services/sucursales.service';
import { AuthService } from 'src/app/auth/auth.service';
import { Sucursal } from 'src/app/pages/managements/interfaces/sucursales.interface';
import { MenuItem } from 'primeng/api';
import Swal from 'sweetalert2';
import { CategoriesService } from '../services/categories.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-total-stock-recumet',
  templateUrl: './total-stock-recumet.component.html',
  styles: [],
})
export class TotalStockRecumetComponent implements OnInit {
  fb = inject(FormBuilder);
  validatorsService = inject(ValidatorsService);
  kardexService = inject(KardexService);
  activatedRoute = inject(ActivatedRoute);
  sucursalService = inject(SucursalesService);
  authService = inject(AuthService);
  categoriesService = inject(CategoriesService);

  loading = signal(false);
  rows = signal(50);
  page = signal(1);
  type = signal('');
  query = signal('');
  kardexes = signal<Kardexes | undefined>(undefined);
  dropdownSucursales = signal<Sucursal[]>([]);
  filteredStorages = signal<any[]>([]);

  // Category selection properties
  dropdownCategories = signal<{ id: number, name: string }[]>([]);
  selectedCategoryIds = signal<number[]>([]);
  loadingCategories = signal(false);
  selectedCategoryValues: number[] = [];

  buttonItems: MenuItem[] = [
    {
      label: 'Excel',
      icon: 'fa-regular fa-file-excel',
      iconStyle: { color: '#14A44D' },
      command: () => {
        this.printExcelReport();
      },
    },
  ];

  title = signal('CONSOLIDADO DE STOCK (MP Y PT) RECUMET');

  paramsSearch = signal<FormSearchKardex>({
    filterBy: 'RANGE',
    date1: '',
    date2: '',
    id_product: '',
    id_provider: '',
    id_storage: '',
    id_sucursal: '',
    type_kardex: '',
    include_zero: false,
  });

  types_filtrado = signal([
    { name: 'DIA', code: 'DAY' },
    { name: 'MES', code: 'MONTH' },
    { name: 'AÑO', code: 'YEAR' },
    { name: 'RANGO', code: 'RANGE' },
  ]);

  formReport: UntypedFormGroup = this.fb.group({
    filterBy: ['RANGE'],
    dates: [[new Date('2025-01-01'), new Date()], [Validators.required]],
    type_kardex: [''],
    id_sucursal: [[], [Validators.required]],
    id_storage: [[]],
    showZeroSaldo: [false]
  });

  pipeNumber = new DecimalPipe('en-US');
  decimalLength = signal(this.validatorsService.decimalLength());
  decimal = signal(`1.${this.decimalLength()}-${this.decimalLength()}`);

  cols = signal<ColsTable[]>([
    {
      field: 'index',
      header: 'Nº',
      style: 'min-width:50px;max-width:50px;text-align: center;',
      isIndex: true,
      activeSortable: false,
    },
    {
      field: 'product.cod',
      header: 'CÓDIGO',
      style: 'min-width:100px;max-width:100px;',
      tooltip: true,
      isLink: true,
      link: '/inventories/kardex-existencia?p=${value}',
      field2: 'id_product',
    },
    {
      field: 'product.name',
      header: 'DETALLE',
      style: 'min-width:180px;max-width:180px;',
      tooltip: true,
      isText: true,
    },
    {
      field: 'product.unit.siglas',
      header: 'UND',
      style: 'min-width:80px;max-width:80px;',
      tooltip: true,
      isText: true,
    },
    {
      field: 'quantity_saldo',
      header: 'SALDO',
      style: 'min-width:100px;max-width:120px;text-align: center;',
      tooltip: true,
      isValueUpdate: true,
      tagValue: (val: number) => this.pipeNumber.transform(val, this.decimal()),
    },
  ]);

  fieldSort = signal('product.cod');
  order = signal('ASC');

  ngOnInit(): void {
    this.formReport.patchValue({
      filterBy: 'RANGE',
      dates: [new Date('2025-01-01'), new Date()],
      id_sucursal: [this.validatorsService.id_sucursal()]
    });

    const storagesList = this.validatorsService.storages();
    if (storagesList.length > 0) {
      this.formReport.patchValue({
        id_storage: [storagesList[0].id]
      });
    }

    this.getSucursales();
    this.loadCategories();
    this.getAllAndSearchKardex(1, this.rows());
  }

  getSucursales() {
    this.sucursalService.getAllAndSearch(1, 100, true).subscribe({
      next: (resp) => {
        let list = resp.sucursales.data;
        if (this.authService.getUser?.role !== 'ADMINISTRADOR') {
          list = list.filter((sucursal: Sucursal) =>
            this.authService.getUser?.assign_sucursales!.some((resp) => sucursal.id === resp.id_sucursal)
          );
        }
        this.dropdownSucursales.set(list);
        this.onSucursalesChange();
      },
      error: (err) => {
        console.error('Error cargando sucursales:', err);
      }
    });
  }

  onSucursalesChange() {
    const selectedIds: number[] = this.formReport.get('id_sucursal')?.value || [];
    const allSucursales = this.dropdownSucursales();
    const activeStorages: any[] = [];
    allSucursales.forEach(sucursal => {
      if (selectedIds.includes(sucursal.id!)) {
        if (sucursal.storage) {
          activeStorages.push(...sucursal.storage);
        }
      }
    });
    this.filteredStorages.set(activeStorages);

    const currentStorages: number[] = this.formReport.get('id_storage')?.value || [];
    const validStorages = currentStorages.filter(id => activeStorages.some(s => s.id === id));
    this.formReport.patchValue({ id_storage: validStorages });
  }

  loadCategories(): void {
    this.loadingCategories.set(true);
    this.selectedCategoryIds.set([]);
    this.selectedCategoryValues = [];

    forkJoin({
      rawMaterial: this.categoriesService.getCategorySelect('RAW_MATERIAL'),
      finishedProduct: this.categoriesService.getCategorySelect('FINISHED_PRODUCT')
    }).subscribe({
      next: (resp: any) => {
        const raw = resp.rawMaterial.categories || [];
        const finished = resp.finishedProduct.categories || [];
        const combined = [...raw, ...finished];
        const unique = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        this.dropdownCategories.set(unique);
        this.loadingCategories.set(false);
      },
      error: () => {
        this.loadingCategories.set(false);
      }
    });
  }

  onCategoryChange(selectedIds: number[]): void {
    this.selectedCategoryIds.set(selectedIds);
    this.selectedCategoryValues = [...selectedIds];
  }

  getAllAndSearchKardex(page: number, limit: number, type: string = '', query: string = '') {
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;

    this.formParamsByForm();

    if (!query) {
      this.loading.set(true);
    }

    this.kardexService.getTotalStockRecumet(
      page,
      limit,
      this.paramsSearch(),
      type,
      query,
      this.fieldSort(),
      this.order()
    ).subscribe({
      next: (resp) => {
        const startNum = ((page - 1) * Number(limit)) + 1;
        resp.kardexes.data.forEach((item: any, idx: number) => {
          item.index = startNum + idx;
        });

        this.kardexes.set(resp.kardexes);

        // Update column footers with grand totals
        const totals = resp.kardexes.totals;
        if (totals) {
          this.cols.update(cols => cols.map(col => {
            if (col.field === 'product.cod') {
              return { 
                ...col, 
                footer: 'TOTAL MP:\nTOTAL PT:\nTOTAL GENERAL',
                style: 'min-width:100px;max-width:100px; white-space: pre-line !important;'
              };
            }
            if (col.field === 'quantity_saldo') {
              const mpStr = this.pipeNumber.transform(totals.quantity_saldo_mp, this.decimal()) || '0.0000';
              const ptStr = this.pipeNumber.transform(totals.quantity_saldo_pt, this.decimal()) || '0.0000';
              const genStr = this.pipeNumber.transform(totals.quantity_saldo, this.decimal()) || '0.0000';
              return { 
                ...col, 
                footer: `${mpStr}\n${ptStr}\n${genStr}`,
                style: 'min-width:100px;max-width:120px;text-align: center; white-space: pre-line !important;'
              };
            }
            return { ...col, footer: '' };
          }));
        }
      },
      complete: () => this.loading.set(false),
      error: (err) => {
        console.error('Error cargando stock consolidado:', err);
        this.loading.set(false);
      }
    });
  }

  formParamsByForm(): void {
    this.paramsSearch.update((params) => {
      const {
        filterBy,
        id_sucursal,
        id_storage,
        dates,
        showZeroSaldo
      } = this.formReport.value;

      const formatDate1 =
        filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY';
      const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';

      const sucursalIdsStr = Array.isArray(id_sucursal) ? id_sucursal.join(',') : (id_sucursal || '');
      const storageIdsStr = Array.isArray(id_storage) ? id_storage.join(',') : (id_storage || '');
      const categoryIdsStr = this.selectedCategoryIds().length > 0 ? this.selectedCategoryIds().join(',') : '';

      const newParams = {
        type_kardex: '',
        id_sucursal: '',
        id_sucursales: sucursalIdsStr,
        id_storage: '',
        id_storages: storageIdsStr,
        category_ids: categoryIdsStr,
        id_provider: '',
        id_product: '',
        filterBy: filterBy,
        date1:
          filterBy == 'RANGE'
            ? moment(dates[0]).format(formatDate1)
            : moment(dates).format(formatDate1),
        date2:
          filterBy == 'RANGE'
            ? dates[1]
              ? moment(dates[1]).format(formatDate1)
              : ''
            : moment(dates).format(formatDate2),
        showZeroSaldo: showZeroSaldo
      };

      console.log('Parámetros formados:', newParams);
      return newParams;
    });
  }

  paginate($rows: any) {
    const { rows, page } = $rows;
    this.rows.set(rows);
    this.page.set(page);
    this.getAllAndSearchKardex(this.page(), this.rows(), this.type(), this.query());
  }

  customSort($sort: any) {
    let { field, order } = $sort;
    this.fieldSort.set(field);
    this.order.set(order);
    this.getAllAndSearchKardex(this.page(), this.rows(), this.type(), this.query());
  }

  search($query: any) {
    const { type, query } = $query;
    this.type.set(type);
    this.query.set(query);
    this.getAllAndSearchKardex(1, this.rows(), this.type(), this.query());
  }

  onChangeTypesFilter() {
    const type_filter = this.formReport.get('filterBy')?.value;
    if (type_filter == 'RANGE') {
      this.formReport.get('dates')?.setValue([new Date('2025-01-01'), new Date()]);
    } else {
      this.formReport.get('dates')?.setValue(new Date());
    }
  }

  clearInputs() {
    const storagesList = this.validatorsService.storages();
    this.formReport.patchValue({
      filterBy: 'RANGE',
      dates: [new Date('2025-01-01'), new Date()],
      id_sucursal: [this.validatorsService.id_sucursal()],
      id_storage: storagesList.length > 0 ? [storagesList[0].id] : [],
      showZeroSaldo: false,
    });
    this.selectedCategoryIds.set([]);
    this.selectedCategoryValues = [];
    this.onSucursalesChange();
    this.getAllAndSearchKardex(1, this.rows());
  }

  printPdfReport(): void {
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    Swal.fire({
      title: 'Generando Reporte!',
      html: `Con los parámetros seleccionados`,
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.kardexService
            .getReportPdfTotalStock(
              this.paramsSearch(),
              this.type(),
              this.query(),
              this.fieldSort(),
              this.order(),
            )
            .subscribe({
              next: (data) => {
                const file = new Blob([data], { type: 'application/pdf' });
                const fileURL = URL.createObjectURL(file);
                window.open(fileURL);
                Swal.close();
              },
              error: (err) => {
                Swal.close();
              },
            });
        });
      },
    });
  }

  printExcelReport(): void {
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    Swal.fire({
      title: 'Generando Reporte!',
      html: `Con los parámetros seleccionados`,
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.kardexService
            .getReportExcelTotalStock(
              this.paramsSearch(),
              this.type(),
              this.query(),
              this.fieldSort(),
              this.order(),
            )
            .subscribe({
              next: (data) => {
                const fileURL = window.URL.createObjectURL(data);
                window.open(fileURL);
                Swal.close();
              },
              error: (err) => {
                Swal.close();
              },
            });
        });
      },
    });
  }
}
