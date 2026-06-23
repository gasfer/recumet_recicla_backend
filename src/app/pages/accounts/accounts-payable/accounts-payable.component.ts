import { Component, OnInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ValidatorsService } from 'src/app/services/validators.service';
import { MenuItem } from 'primeng/api';
import { ColsTable, SearchFor } from 'src/app/core/components/interfaces/OptionsTable.interface';
import { environment } from 'src/environments/environment';
import { ProvidersService } from '../../inputs/services/providers.service';
import { AccountsPayable, FormSearchAccountsPayables } from '../interfaces/accounts-payable.interface';
import { AccountsPayableService } from '../services/accounts-payable.service';
import * as moment from 'moment';
import { Subscription, } from 'rxjs';
import Swal from 'sweetalert2';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AbonosAccountPayableAllService } from '../services/abonos-accounts-payable-all.service';
import { AccountsPayableAll } from '../interfaces/abonos-accounts-payable-all.interface';

@Component({
  selector: 'app-accounts-payable',
  templateUrl: './accounts-payable.component.html',
  styles: [
    ` .card {
      margin-bottom: 10px;
      border: none;
      border-radius: 15px;
      box-shadow: 0.1px 0 30px rgba(0, 0, 0, 0.1);
    }
  `
  ]
})
export class AccountsPayableComponent implements OnInit {
  fb = inject(FormBuilder);
  validatorsService = inject(ValidatorsService);
  providersService = inject(ProvidersService);
  accountsPayableService = inject(AccountsPayableService);
  activatedRoute = inject(ActivatedRoute);
  abonosAccountPayableAllService = inject(AbonosAccountPayableAllService);

  @ViewChild('mainFileInput') mainFileInput!: ElementRef;
  selectedAbonoId?: number;
  selectedAbonoIsMultiple?: boolean;

  types_registry = signal([{ name: 'FICHA', code: 'FICHA' }, { name: 'BOLETA', code: 'BOLETA' }]);
  providers = signal<{ name: string, code: string }[]>([]);
  loading = signal(false);
  rows = signal(50);
  page = signal(1);
  type = signal('');
  query = signal('');
  accountsPayable = signal<AccountsPayable | undefined>(undefined);
  abonosAccountsPayable = signal<AccountsPayableAll | undefined>(undefined);
  isReloadSub$!: Subscription;
  pipeNumber = new DecimalPipe('en-US');
  decimalLength = signal(this.validatorsService.decimalLength());
  decimal = signal(`1.${this.decimalLength()}-${this.decimalLength()}`);
  types_filtrado = signal([
    { name: 'DIA', code: 'DAY' },
    { name: 'MES', code: 'MONTH' },
    { name: 'AÑO', code: 'YEAR' },
    { name: 'RANGO', code: 'RANGE' },
  ]);
  cols = signal<ColsTable[]>([
    {
      field: 'status_account', header: 'ESTADO', style: 'min-width:60px;max-width:60px; text-align: center;', tooltip: true, footer: 'TOTAL',
      isTag: true,
      tagValue: (val: string) => ' ',
      tagColor: (val: string) => val == 'PAGADO' ? 'primary' : 'success',
      tagIcon: (val: string) => val == 'PAGADO' ? 'fa-solid fa-circle-check' : 'fa-solid fa-clock-rotate-left'
    },
    { field: 'input.cod', header: 'COMPRA', style: 'min-width:100px;max-width:100px;', tooltip: true },
    { field: `provider.full_names`, header: 'PROVEEDOR', style: 'min-width:150px;max-width:200px;', tooltip: true, isText: true },
    { field: 'input.date_voucher', header: 'FECHA REGISTRO', style: 'min-width:110px;max-width:110px;', tooltip: true, isDate: true },
    {
      field: 'input.type_registry', header: 'TIPO DOC.', style: 'min-width:80px;max-width:80px;', tooltip: true, isTag: true,
      tagValue: (val: boolean) => val,
      tagColor: (val: boolean) => 'success',
      tagIcon: (val: boolean) => 'fa-solid fa-file'
    },
    { field: 'input.registry_number', header: 'NUMERO', style: 'min-width:80px;max-width:110px;', tooltip: true, isText: true },
    {
      field: 'monto_abonado', header: 'A CUENTA', style: 'min-width:100px;max-width:130px;text-align: end;', tooltip: true,
      isValueUpdate: true, tagValue: (val: number) => this.pipeNumber.transform(val, this.decimal()),
    },
    {
      field: 'monto_restante', header: 'SALDO', style: 'min-width:100px;max-width:130px;text-align: end;', tooltip: true,
      isValueUpdate: true, tagValue: (val: number) => this.pipeNumber.transform(val, this.decimal()),
    },
    {
      field: 'total', header: 'TOTAL', style: 'min-width:100px;max-width:130px;text-align: end;', tooltip: true, isTag: true,
      tagValue: (val: number) => this.pipeNumber.transform(val, this.decimal()),
      tagColor: (val: number) => 'primary',
      tagIcon: (val: number) => '',
    },
    { field: 'options', header: 'OPCIONES', style: 'min-width:120px;max-width:120px', isButton: true, activeSortable: false }
  ]);
  colsAbonos = signal<ColsTable[]>([
    { field: 'date_abono', header: 'FECHA', style: 'min-width:110px;max-width:110px;', tooltip: true, isDate: true, footer: 'TOTALES' },
    { field: `codes_input`, header: 'COMPRAS', style: 'min-width:150px;max-width:200px;', tooltip: true, isTextArray: true },
    { field: `provider.full_names`, header: 'PROVEEDOR', style: 'min-width:150px;max-width:200px;', tooltip: true, isText: true },
    {
      field: 'type_payment', header: 'TIPO', style: 'min-width:80px;max-width:80px;', tooltip: true, isTag: true,
      tagValue: (val: boolean) => val,
      tagColor: (val: boolean) => 'success',
      tagIcon: (val: boolean) => ''
    },
    {
      field: 'monto_abono', header: 'PAGO', style: 'min-width:100px;max-width:130px;text-align: end;', tooltip: true, isTag: true,
      tagValue: (val: number) => this.pipeNumber.transform(val, this.decimal()),
      tagColor: (val: number) => 'primary',
      tagIcon: (val: number) => '',
    },
    { field: `comments`, header: 'CONCEPTO', style: 'min-width:150px;max-width:250px;', tooltip: true, isText: true },
    { field: 'options', header: 'OPCIONES', style: 'min-width:120px;max-width:120px', isButton: true, activeSortable: false }
  ]);
  isTableAbonos = signal(false);
  searchFor = signal<SearchFor[]>([{ name: 'COMPRA', code: 'input.cod' },]);
  searchForAbonos = signal<SearchFor[]>([{ name: 'COMPRA', code: 'codes_input' },]);
  searchItems = signal<MenuItem[]>([
    {
      label: 'Todos', icon: 'fas fa-exchange-alt',
      iconStyle: { 'color': '#FF851B' },
      command: () => {
        this.isTableAbonos.set(false);
        this.paramsSearch().status_account = '';
        this.getAllAndSearchAccountsPayable(1, this.rows());
      }
    },
    {
      label: 'Pendientes', icon: 'fa-solid fa-clock-rotate-left',
      iconStyle: { 'color': '#14A44D' },
      command: () => {
        this.isTableAbonos.set(false);
        this.paramsSearch().status_account = 'PENDIENTE';
        this.getAllAndSearchAccountsPayable(1, this.rows());
      }
    },
    {
      label: 'Finalizados', icon: 'fa-solid fa-circle-check',
      iconStyle: { 'color': '#3B71CA' },
      command: () => {
        this.isTableAbonos.set(false);
        this.paramsSearch().status_account = 'PAGADO';
        this.getAllAndSearchAccountsPayable(1, this.rows());
      }
    },
    {
      label: 'Todos los pagos', icon: 'fas fa-cash-register',
      iconStyle: { 'color': '#7D3C98' },
      command: () => {
        this.isTableAbonos.set(true);
        this.paramsSearch().status_account = '';
        this.getAllAndSearchAbonosPay(1, this.rows());
      }
    },
  ]);
  formReport: UntypedFormGroup = this.fb.group({
    filterBy: ['YEAR'],
    dates: [new Date(), [Validators.required]],
    type_registry: [''],
    id_provider: [''],
    id_sucursal: [''],
  });
  paramsSearch = signal<FormSearchAccountsPayables>({
    status_account: '',
    type_registry: '',
    id_sucursal: '',
    id_provider: '',
    filterBy: 'YEAR',
    date1: moment().format('YYYY'),
    date2: '',
  });
  buttonItems: MenuItem[] = [
    {
      label: 'Lista pagos detallado',
      icon: 'fa-regular fa-file-excel',
      iconStyle: { 'color': '#14A44D' },
      command: () => {
        if (this.isTableAbonos()) {
          this.printExcelReportAbonos();
        } else {
          this.printExcelReport();
        }
      }
    },
  ];
  id_account_payable: number = 0;
  fieldSort = signal('input.date_voucher');
  order = signal('DESC');
  fieldSortAbonos = signal('date_abono');
  orderAbonos = signal('DESC');
  idProveedor = signal<number | undefined>(undefined);
  txtSearch = signal('');

  ngOnInit(): void {
    this.activatedRoute.queryParams.subscribe(params => {
      const { p: id_proveedor, c: id_compra } = params;
      if (!id_proveedor && !id_compra) {
        this.getAllAndSearchAccountsPayable(1, this.rows());
      }
      if (id_compra) {
        this.txtSearch.set(id_compra);
        this.getAllAndSearchAccountsPayable(1, this.rows(), 'input.cod', id_compra);
      }
      this.idProveedor.set(id_proveedor);
    })
    this.getAllProviders();
    this.isReloadSub$ = this.accountsPayableService.reloadAccountsPayable$
      .subscribe((id_account_payable: number) => {
        this.id_account_payable = id_account_payable;
        if(!this.isTableAbonos()){
          this.getAllAndSearchAccountsPayable(1, this.rows());
        } else {
          this.getAllAndSearchAbonosPay(1,this.rows());
        }
      });
  }

  getAllProviders() {
    this.providersService.getAllAndSearch(1, 10000, true, '', '', 'full_names', 'ASC').subscribe({
      next: (resp) => {
        this.providers.set([]);
        resp.providers.data.forEach(provider => {
          this.providers.update((providers) => {
            return [
              ...providers,
              {
                name: `${provider.full_names} - ${provider.number_document ?? ''}`,
                code: provider.id.toString(),
              },
            ];
          });
        });
        if (this.idProveedor()) {
          this.formReport.patchValue({ id_provider: this.idProveedor() });
          this.getAllAndSearchAccountsPayable(1, this.rows());
          this.idProveedor.set(undefined);
        }
      },
      error: (err) => this.providers.set([])
    });
  }

  getAllAndSearchAccountsPayable(page: number, limit: number, type: string = '', query: string = '') {
    this.formReport.get('id_sucursal')?.setValue(this.validatorsService.id_sucursal());
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    if (!query) { this.loading.set(true); } //not loading in search
    this.accountsPayableService.getAllAndSearchAccountsPayable(page, limit, this.paramsSearch(), type, query, this.fieldSort(), this.order()).subscribe({
      next: (resp) => {
        this.accountsPayable.set(resp.accountsPayable);
        this.accountsPayable()!.data.forEach((accountPayable) => {
          const hasAbonoWithoutVoucher = accountPayable.abonosAccountsPayable?.some(abono => 
            (abono.type_payment === 'TRANSFERENCIA' || abono.type_payment === 'QR') && !abono.payment_voucher
          );

          const defaultOptions = accountPayable.status_account == 'PENDIENTE' ? [
            {
              label: '', icon: 'fa-solid fa-comment-dollar',
              tooltip: 'Abonar',
              class: 'p-button-rounded  p-button-warning p-button-sm',
              eventClick: () => {
                this.accountsPayableService.detailsSubs$.next(accountPayable);
                this.accountsPayableService.showModalNewAbono = true;
              }
            },
            {
              label: '', icon: 'fa-solid fa-comments-dollar',
              tooltip: 'Abono multiple',
              class: 'p-button-rounded  p-button-secondary p-button-sm  ms-1',
              eventClick: () => {
                this.accountsPayableService.detailsSubs$.next(accountPayable);
                this.accountsPayableService.showModalAccountsProvider = true;
              }
            },
            {
              label: '', icon: 'fas fa-eye',
              tooltip: 'Ver abonos',
              class: 'p-button-rounded p-button-success p-button-sm ms-1',
              eventClick: () => {
                this.accountsPayableService.detailsSubs$.next(accountPayable);
                this.accountsPayableService.showModalDetailsAccountPayable = true;
              }
            },
            {
              label: '', icon: 'fas fa-print',
              tooltip: 'Estado de cuenta',
              disabled: this.validatorsService.withPermission('CUENTAS POR PAGAR', 'reports'),
              class: hasAbonoWithoutVoucher ? 'p-button-rounded p-button-warning p-button-sm ms-1' : 'p-button-rounded p-button-sm ms-1',
              eventClick: () => {
                this.accountsPayableService.printAccountPayablePdf(accountPayable.id);
              }
            },
          ] : [
            {
              label: '', icon: 'fas fa-eye',
              tooltip: 'Ver abonos',
              class: 'p-button-rounded p-button-success p-button-sm',
              eventClick: () => {
                this.accountsPayableService.detailsSubs$.next(accountPayable);
                this.accountsPayableService.showModalDetailsAccountPayable = true;
              }
            },
            {
              label: '', icon: 'fas fa-print',
              tooltip: 'Estado de cuenta',
              disabled: this.validatorsService.withPermission('CUENTAS POR PAGAR', 'reports'),
              class: hasAbonoWithoutVoucher ? 'p-button-rounded p-button-warning p-button-sm ms-1' : 'p-button-rounded p-button-sm ms-1',
              eventClick: () => {
                this.accountsPayableService.printAccountPayablePdf(accountPayable.id);
              }
            },
          ];

          accountPayable.options = defaultOptions;
        });
        const total_abonados = resp.accountsPayable?.totals?.total_abonados ?? 0;
        const total_restante = resp.accountsPayable?.totals?.total_restante ?? 0;
        const total_account = resp.accountsPayable?.totals?.total_account ?? 0;
        this.cols()[6].footer = this.pipeNumber.transform(total_abonados, this.decimal()) ?? '0';
        this.cols()[7].footer = this.pipeNumber.transform(total_restante, this.decimal()) ?? '0';
        this.cols()[8].footer = this.pipeNumber.transform(total_account, this.decimal()) ?? '0';

      },
      complete: () => {
        this.loading.set(false);
        //solo si es un nuevo abono
        const find_account_payable = this.accountsPayable()?.data.find((accountsPayable) => accountsPayable.id === this.id_account_payable);
        if (find_account_payable) {
          this.accountsPayableService.detailsSubs$.next(find_account_payable!);
          this.id_account_payable = 0;
        }
      },
      error: () => this.loading.set(false)
    });
  }

  getAllAndSearchAbonosPay(page: number, limit: number, type: string = '', query: string = '') {
    this.formReport.get('id_sucursal')?.setValue(this.validatorsService.id_sucursal());
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    if (!query) { this.loading.set(true); } //not loading in search
    this.abonosAccountPayableAllService.getAllAndSearchAbonosPayableAll(page, limit, this.paramsSearch(), type, query, this.fieldSortAbonos(), this.orderAbonos()).subscribe({
      next: (resp) => {
        this.abonosAccountsPayable.set(resp.accountsPayableAll);
        this.abonosAccountsPayable()!.data.forEach((accountPayable) => {
          const options = [
            {
              label: '', icon: 'fas fa-print',
              tooltip: 'Comprobante',
              disabled: this.validatorsService.withPermission('CUENTAS POR PAGAR', 'reports'),
              class: 'p-button-rounded p-button-sm',
              eventClick: () => {
                if (accountPayable.from_pay_multiple) {
                  this.abonosAccountPayableAllService.printAbonoMultipleAccountPayablePdf(accountPayable.id);
                } else {
                  this.accountsPayableService.printVoucherAbonoAccountPayablePdf(accountPayable.ids_abonos_payables[0]);
                }
              }
            },
            {
              label: '', icon: 'fa-solid fa-trash-can',
              tooltip: 'Anular abono',
              class: 'p-button-rounded p-button-danger p-button-sm ms-1',
              eventClick: () => {
                const idAbono = accountPayable.from_pay_multiple ? accountPayable.id: accountPayable.ids_abonos_payables[0];
                this.deleteAbono(idAbono,Number(accountPayable.monto_abono),accountPayable.from_pay_multiple);
              }
            },
          ];

          if ((accountPayable.type_payment === 'TRANSFERENCIA' || accountPayable.type_payment === 'QR') && !accountPayable.payment_voucher) {
            options.push({
              label: '', icon: 'fa-solid fa-triangle-exclamation',
              tooltip: 'Falta subir comprobante',
              disabled: true,
              class: 'p-button-rounded p-button-text p-button-danger p-button-sm ms-1',
              eventClick: () => {}
            });

            options.push({
              label: '', icon: 'fa-solid fa-file-arrow-up',
              tooltip: 'Adjuntar comprobante',
              disabled: false,
              class: 'p-button-rounded p-button-warning p-button-sm ms-1',
              eventClick: () => {
                const idAbono = accountPayable.from_pay_multiple ? accountPayable.id : accountPayable.ids_abonos_payables[0];
                this.triggerMainFileUpload(idAbono, !!accountPayable.from_pay_multiple);
              }
            });
          }

          if ((accountPayable.type_payment === 'TRANSFERENCIA' || accountPayable.type_payment === 'QR') && accountPayable.payment_voucher) {
            options.push({
              label: '', icon: 'fa-solid fa-file-invoice',
              tooltip: 'Ver comprobante adjunto',
              disabled: false,
              class: 'p-button-rounded p-button-info p-button-sm ms-1',
              eventClick: () => {
                this.viewAttachedVoucher(accountPayable.payment_voucher);
              }
            });
          }

          accountPayable.options = options;
        });
        const total_abonados = resp.accountsPayableAll?.totals?.total_abonados ?? 0;
        this.colsAbonos()[4].footer = this.pipeNumber.transform(total_abonados, this.decimal()) ?? '0';
      },
      complete: () => {
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  formParamsByForm() {
    this.paramsSearch.update((params) => {
      const { filterBy, id_sucursal, id_provider, type_registry, id_product, dates } = this.formReport.value;
      const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY';
      const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
      return {
        type_registry: type_registry ? type_registry : '',
        id_sucursal: id_sucursal ? id_sucursal : '',
        id_product: id_product ? id_product : '',
        id_provider: id_provider ? id_provider : '',
        status_account: params.status_account,
        filterBy: filterBy,
        date1: filterBy == 'RANGE' ? moment(dates[0]).format(formatDate1) : moment(dates).format(formatDate1),
        date2: filterBy == 'RANGE' ? dates[1] ? moment(dates[1]).format(formatDate1) : '' : moment(dates).format(formatDate2),
      }
    });
  }

  printPdfReport() {
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    Swal.fire({
      title: 'Generando Reporte!',
      html: `Con los parámetros seleccionados`,
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.accountsPayableService.getReportAccountsPayablePdf(this.paramsSearch(), this.fieldSort(), this.order()).subscribe({
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

  printPdfReportAbonos() {
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    Swal.fire({
      title: 'Generando Reporte!',
      html: `Con los parámetros seleccionados`,
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.abonosAccountPayableAllService.getReportAccountsPayableAbonosPdf(this.paramsSearch(), this.type(), this.query(), this.fieldSortAbonos(), this.orderAbonos()).subscribe({
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

  printExcelReport() {
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    Swal.fire({
      title: 'Generando Reporte!',
      html: `Con los parámetros seleccionados`,
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.accountsPayableService.getReportAccountsPayableExcel(this.paramsSearch(), this.fieldSort(), this.order()).subscribe({
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

  printExcelReportAbonos() {
    this.formReport.markAllAsTouched();
    if (!this.formReport.valid) return;
    this.formParamsByForm();
    Swal.fire({
      title: 'Generando Reporte!',
      html: `Con los parámetros seleccionados`,
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.abonosAccountPayableAllService.getReportAccountsPayableExcel(this.paramsSearch(), this.type(), this.query(), this.fieldSortAbonos(), this.orderAbonos()).subscribe({
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

  clearInputs() {
    this.formReport.patchValue({
      filterBy: 'YEAR',
      dates: new Date(),
      type_registry: '',
      id_provider: '',
    });
  }

  onChangeTypesFilter() {
    const type_filter = this.formReport.get('filterBy')?.value;
    if (type_filter == 'RANGE') {
      this.formReport.get('dates')?.setValue([new Date()]);
    } else {
      this.formReport.get('dates')?.setValue(new Date());
    }
  }

  paginate($rows: any) {
    const { rows, page } = $rows;
    this.rows.set(rows);
    this.page.set(page);
    if (!this.isTableAbonos()) {
      this.getAllAndSearchAccountsPayable(this.page(), this.rows(), this.type(), this.query());
    } else {
      this.getAllAndSearchAbonosPay(this.page(), this.rows(), this.type(), this.query())
    }
  }

  customSort($sort: any) {
    let { field, order } = $sort;
    if (!this.isTableAbonos()) {
      this.fieldSort.set(field);
      this.order.set(order);
    } else {
      this.fieldSortAbonos.set(field);
      this.orderAbonos.set(order);
    }
  }

  search($query: any) {
    const { type, query } = $query;
    this.type.set(type);
    this.query.set(query);
    if (!this.isTableAbonos()) {
      this.getAllAndSearchAccountsPayable(1, this.rows(), this.type(), this.query());
    } else {
      this.getAllAndSearchAbonosPay(1, this.rows(), this.type(), this.query());
    }
  }

  searchByFilters() {
    if (!this.isTableAbonos()) {
      this.getAllAndSearchAccountsPayable(1, this.rows());
    } else {
      this.getAllAndSearchAbonosPay(1, this.rows());
    }
  }

  deleteAbono(id_abono: number, monto: number, multiple: boolean): void {
    Swal.fire({
      title: `¿Esta seguro de anular Abono?`,
      text: `Esta apunto de anular el abono de: ${monto}`,
      icon: `warning`,
      confirmButtonText: `Si, Anular!`,
      showLoaderOnConfirm: true,
      showCancelButton: true,
      backdrop: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      cancelButtonText: 'Cancelar',
      customClass: { container: 'sweetalert2' },
      preConfirm: () => {
        if(multiple){
          return new Promise((resolve, reject) => {
            this.abonosAccountPayableAllService.deleteAbonoAccountPayableMultiple(id_abono).subscribe({
              complete: () => resolve(true),
              error: (err) => {
                resolve(false);
              }
            });
          });
        } else {
          return new Promise((resolve, reject) => {
            this.accountsPayableService.deleteAbonoAccountPayable(id_abono).subscribe({
              complete: () => resolve(true),
              error: (err) => {
                resolve(false);
              }
            });
          });
        }
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if (!result.isConfirmed) return;
      if (result.value) {
        this.accountsPayableService.reloadAccountsPayable$.next(0);
        Swal.fire({
          title: 'Éxito!',
          text: `El abono fue anulado correctamente`,
          icon: 'success',
          showClass: { popup: 'animated animate fadeInDown' },
          customClass: { container: 'sweetalert2' },
        });
      }
    });
  }

  triggerMainFileUpload(idAbono: number, isMultiple: boolean) {
    this.selectedAbonoId = idAbono;
    this.selectedAbonoIsMultiple = isMultiple;
    this.mainFileInput.nativeElement.click();
  }

  onMainFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0 && this.selectedAbonoId !== undefined) {
      const file = event.target.files[0];
      this.uploadMainVoucher(this.selectedAbonoId, file, !!this.selectedAbonoIsMultiple);
    }
  }

  uploadMainVoucher(abonoId: number, file: File, isMultiple: boolean) {
    Swal.fire({
      title: 'Subiendo comprobante...',
      didOpen: () => {
        Swal.showLoading();
      },
      allowOutsideClick: false
    });
    
    this.accountsPayableService.uploadVoucherAbono(abonoId, file, isMultiple).subscribe({
      next: (resp) => {
        Swal.fire({
          title: 'Éxito!',
          text: 'Comprobante subido correctamente.',
          icon: 'success',
          customClass: { container: 'swal-alert' }
        });
        if (this.mainFileInput) {
          this.mainFileInput.nativeElement.value = '';
        }
        this.selectedAbonoId = undefined;
        this.selectedAbonoIsMultiple = undefined;
        this.accountsPayableService.reloadAccountsPayable$.next(0);
      },
      error: (err) => {
        Swal.fire({
          title: 'Error',
          text: err?.error?.errors?.[0]?.msg || 'No se pudo subir el comprobante.',
          icon: 'error',
          customClass: { container: 'swal-alert' }
        });
      }
    });
  }

  viewAttachedVoucher(payment_voucher?: string) {
    if (!payment_voucher) return;
    const url = `${environment.base_url}/file/vouchers/${payment_voucher}`;
    window.open(url, '_blank');
  }
}
