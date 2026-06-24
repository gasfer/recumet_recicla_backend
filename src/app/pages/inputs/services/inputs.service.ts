import { EventEmitter, Injectable, inject, signal } from '@angular/core';
import { FormSearchInputs, GetAllInputs, GetOneInput, Input, InputConfig, NewInputForm } from '../interfaces/input.interface';
import { Product } from '../../inventories/interfaces/products.interface';
import { Provider } from '../interfaces/provider.interface';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';
import Swal from 'sweetalert2';
const base_url = environment.base_url;

@Injectable({
  providedIn: 'root'
})
export class InputsService {
  detailShopping   = signal<Product[]>([]);
  providerSelect   = signal<Provider|undefined>(undefined);
  dataInputForEdit = signal<Input|undefined>(undefined);
  showModalConfigInput: boolean = false;
  showModalSaveInput: boolean = false;
  showModalDetailsInput: boolean = false;
  isEdit: boolean = false;
  editSubs$: EventEmitter<Input> = new EventEmitter<Input>();
  detailsSubs$: EventEmitter<Input> = new EventEmitter<Input>();
  types_registry = signal([{name: 'SIN FICHA', code: 'SIN FICHA'},{name: 'FICHA', code: 'FICHA'},{name: 'BOLETA', code: 'BOLETA'}]);
  private http   = inject(HttpClient);
  referral_sources = signal([
    { name: 'Redes Sociales (Facebook, TikTok, Instagram)', code: 'REDES SOCIALES' },
    { name: 'Página Web RECUMET', code: 'PAGINA WEB RECUMET' },
    { name: 'Búsqueda en Google', code: 'GOOGLE' },
    { name: 'Referido por amigo/Amiga', code: 'REFERIDO POR AMIGO' },
    { name: 'Feria o Rueda de Negocios', code: 'FERIA' },
    { name: 'Seguimiento Comercial (Llamadas periódicas)', code: 'SEGUIMIENTO COMERCIAL' }
  ]);

  public _inputConfig : InputConfig = {
    searchForCode: localStorage.getItem('searchForCode') === 'true' ? true : false,
    clearInputAfterProductSearch: localStorage.getItem('clearInputAfterProductSearch') === 'false' ? false : true,
    viewCardProducts: localStorage.getItem('viewCardProducts') === 'true' ? true : false,
    printAfter: localStorage.getItem('printAfter') === 'false' ? false : true,
    viewMoneyButtons: localStorage?.getItem('viewMoneyButtons') === 'false' ? false : true,
    printRoll: localStorage.getItem('printRoll') === 'true' ? true : false,
    printHalfPage: localStorage.getItem('printHalfPage') === 'true' ? true : false,
  }

  getInputById(id_input:string): Observable<GetOneInput>{
    let  url = `${base_url}/input/find/${id_input}`;
    return this.http.get<GetOneInput>(url);
  }

  getAllAndSearchInputs(page: number, limit: number,params:FormSearchInputs, type: string = '', query?: string,field_sort:string = 'id',order:string = 'DESC',): Observable<GetAllInputs>{
    let url = '';
    if(type === ''){
      url = `${base_url}/input?page=${page}&limit=${limit}&field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/input?page=${page}&limit=${limit}&type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }
    return this.http.get<GetAllInputs>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      })
    });
  }

  postNewInput(data:NewInputForm): Observable<{ok:string,msg:string,id_input:number}> {
    const url = `${base_url}/input`;
    return this.http.post<{ok:string,msg:string,id_input:number}>(url, data);
  }

  putUpdateInput(id_input:number,data:NewInputForm): Observable<{ok:string,msg:string,id_input:number}> {
    const url = `${base_url}/input/${id_input}`;
    return this.http.put<{ok:string,msg:string,id_input:number}>(url, data);
  }

  deleteInput(id_input: number) {
    const url = `${base_url}/input/anular/${id_input}`;
    return this.http.delete(url);
  }

  resetInput() {
    this.detailShopping.update((details)=>  details = []);
    this.providerSelect.set(undefined);
  }

  updateDetailShopping(product: Product, updateQuantity: boolean = true, newQuantity: boolean = false) {
    const productExist = this.detailShopping().length > 0 ? this.detailShopping().find((prod) => prod.id === product.id) : false;
    if(productExist){
      this.detailShopping.update((details) => {
        return details.map((prod) => {
          if (prod.id !== product.id) return prod;
          if (updateQuantity) {
            prod.quantity = newQuantity ? product.quantity : prod.quantity + (prod.set_quantity ??  1);
          }
          prod.import = prod.quantity * prod.costo;
          return prod;
        });
      });
    } else {
      //primera agregación al carrito
      product.quantity = product.set_quantity ??  1;
      product.import = product.quantity * product.costo;
      this.detailShopping.update((details) => [
        ...details,
        product,
      ]);
    }
  }
  //* Reportes */
  getReportPdf(params:FormSearchInputs,field_sort:string = 'id',order:string = 'DESC',) {
    const url = `${base_url}/input/pdf?field_sort=${field_sort}&order=${order}`;
    return this.http.get<any>(url,{
              params: new HttpParams({
                fromObject: {
                  ...params
                }
              }),
              responseType: 'blob' as 'json'
            });
  }

  getReportExcel(params:FormSearchInputs,field_sort:string = 'id',order:string = 'DESC',) {
    const url = `${base_url}/input/excel?field_sort=${field_sort}&order=${order}`;
    return this.http.get(url,{
              params: new HttpParams({
                fromObject: {
                  ...params
                }
              }),
              responseType: 'blob',
            });
  }
  //* Reportes Detalles */
  getReportDetailsPdf(params:FormSearchInputs) {
    const url = `${base_url}/input/pdf/details`;
    return this.http.get<any>(url,{
              params: new HttpParams({
                fromObject: {
                  ...params
                }
              }),
              responseType: 'blob' as 'json'
            });
  }

  getReportDetailsCPPPdf(params:FormSearchInputs) {
    const url = `${base_url}/input/pdf/details/cpp`;
    return this.http.get<any>(url,{
              params: new HttpParams({
                fromObject: {
                  ...params
                }
              }),
              responseType: 'blob' as 'json'
            });
  }
  getReportDetailsExcel(params:FormSearchInputs) {
    const url = `${base_url}/input/excel/details`;
    return this.http.get(url,{
              params: new HttpParams({
                fromObject: {
                  ...params
                }
              }),
              responseType: 'blob',
            });
  }

  //* IMPRIMIR BOLETA
  getPrintVoucherInput(id_input:Number) {
    let format = 'normal';
    if (this._inputConfig.printRoll) {
      format = 'rollo';
    } else if (this._inputConfig.printHalfPage) {
      format = 'media';
    }
    const url = `${base_url}/input/pdf/voucher/${id_input}?format=${format}`;
    return this.http.get(url,{
              responseType: 'blob',
            });
  }

  printPdfReport(id_input: number) {
    Swal.fire({
      title: 'Generando Boleta!',
      html: `Estamos generando la boleta`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.getPrintVoucherInput(id_input).subscribe({
      next: (data) => {
        const file = new Blob([data], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        iframe.style.left = '-9999px';
        iframe.src = fileURL;

        iframe.onload = () => {
          setTimeout(() => {
            Swal.close();
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              iframe.remove();
            }, 1000);
          }, 1000); // Esperar 1 segundo con el loader activo para asegurar el renderizado
        };

        document.body.appendChild(iframe);
      },
      error: (err) => {
        Swal.close();
        console.error('Error al generar la boleta:', err);
      }
    });
  }

  uploadVoucher(idInput: number, file: File): Observable<any> {
    const url = `${base_url}/input/upload/voucher?idInput=${idInput}`;
    const formData = new FormData();
    formData.append('voucher', file);
    return this.http.put<any>(url, formData);
  }
}
