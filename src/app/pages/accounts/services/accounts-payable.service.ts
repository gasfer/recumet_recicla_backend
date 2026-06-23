import { HttpClient, HttpParams } from '@angular/common/http';
import { EventEmitter, Injectable, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { AccountPayable, FormSearchAccountsPayables, GetAllAccountsPayable, NewAbonoAccountPayable, ResponseNewAbono } from '../interfaces/accounts-payable.interface';
import { Observable, Subject } from 'rxjs';
import Swal from 'sweetalert2';
import { FormPayMultiple, GetAllAccountsPayableForProvider } from '../interfaces/accounts-payable-provider.interface';
const base_url = environment.base_url;

@Injectable({
  providedIn: 'root'
})
export class AccountsPayableService {
  private http   = inject(HttpClient);
  detailsSubs$: EventEmitter<AccountPayable> = new EventEmitter<AccountPayable>();
  showModalDetailsAccountPayable: boolean = false;
  showModalNewAbono: boolean = false;
  showModalAccountsProvider: boolean = false;
  reloadAccountsPayable$: Subject<number> = new Subject();

  getAllAndSearchAccountsPayable(page: number, limit: number,params:FormSearchAccountsPayables, type: string = '', query?: string,field_sort:string = 'id',order:string = 'DESC'): Observable<GetAllAccountsPayable>{
    let url = '';
    if(type === ''){
      url = `${base_url}/accounts_payable?page=${page}&limit=${limit}&field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/accounts_payable?page=${page}&limit=${limit}&type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }
    return this.http.get<GetAllAccountsPayable>(url, {
      params: new HttpParams({
        fromObject: { ...params }
      })
    });
  }

  postNewAbonoAccountPayable(data:NewAbonoAccountPayable): Observable<ResponseNewAbono> {
    const url = `${base_url}/accounts_payable/new-abono`;
    return this.http.post<ResponseNewAbono>(url, data);
  }

  deleteAbonoAccountPayable(id_abono_account_payable: number) {
    const url = `${base_url}/accounts_payable/destroy-abono/${id_abono_account_payable}`;
    return this.http.delete(url);
  }
  //* Reportes */
  getReportAccountsPayablePdf(params:FormSearchAccountsPayables,field_sort:string = 'id',order:string = 'DESC') {
    const url = `${base_url}/accounts_payable/pdf?field_sort=${field_sort}&order=${order}`;
    return this.http.get<any>(url,{
              params: new HttpParams({
                fromObject: {...params}
              }),
              responseType: 'blob' as 'json'
            });
  }

  getReportAccountsPayableExcel(params:FormSearchAccountsPayables,field_sort:string = 'id',order:string = 'DESC') {
    const url = `${base_url}/accounts_payable/excel?field_sort=${field_sort}&order=${order}`;
    return this.http.get(url,{
              params: new HttpParams({
                fromObject: { ...params}
              }),
              responseType: 'blob',
            });
  }

  getAccountsPayableForProvider(id_provider:number): Observable<GetAllAccountsPayableForProvider> {
    const url = `${base_url}/accounts_payable/forProvider?id_provider=${id_provider}`;
    return this.http.get<GetAllAccountsPayableForProvider>(url);
  }

  //* IMPRIMIR BOLETAS
  getPrintAccountPayable(id_account_payable:Number) {
    const url = `${base_url}/accounts_payable/pdf/voucher-account-payable/${id_account_payable}`;
    return this.http.get(url,{
              responseType: 'blob',
            });
  } 

  printAccountPayablePdf(id_account_payable:number) {
    Swal.fire({
      title: 'Generando estado de cuenta!',
      html: `Espere un momento`,
      customClass: { container: 'sweetalert2'},
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.getPrintAccountPayable(id_account_payable).subscribe({
            next: (data) => {
              const file = new Blob([data], { type: 'application/pdf' });
              const fileURL = URL.createObjectURL(file);
              window.open(fileURL);
              Swal.close();
            },
            error: (err) => Swal.close()
          });
        });
      },
    });
  }

  getPrintVoucherAbonoAccountPayable(id_abono_account_payable:Number) {
    const url = `${base_url}/accounts_payable/pdf/voucher-abono/${id_abono_account_payable}`;
    return this.http.get(url,{
              responseType: 'blob',
            });
  } 

  printVoucherAbonoAccountPayablePdf(id_abono_account_payable:number) {
    Swal.fire({
      title: 'Generando estado de cuenta!',
      html: `Espere un momento`,
      customClass: { container: 'sweetalert2'},
      didOpen: () => {
        Swal.showLoading();
        new Promise((resolve, reject) => {
          this.getPrintVoucherAbonoAccountPayable(id_abono_account_payable).subscribe({
            next: (data) => {
              const file = new Blob([data], { type: 'application/pdf' });
              const fileURL = URL.createObjectURL(file);
              window.open(fileURL);
              Swal.close();
            },
            error: (err) => Swal.close()
          });
        });
      },
    });
  }

  uploadVoucherAbono(idAbono: number, file: File, isMultiple: boolean): Observable<any> {
    const url = `${base_url}/accounts_payable/upload/voucher?idAbono=${idAbono}&isMultiple=${isMultiple}`;
    const formData = new FormData();
    formData.append('voucher', file);
    return this.http.put<any>(url, formData);
  }
}
