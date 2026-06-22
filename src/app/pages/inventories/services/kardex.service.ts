import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { FormSearchKardex, GetAllKardexes } from '../interfaces/kardex.interface';
import { Observable } from 'rxjs';
const base_url = environment.base_url;

@Injectable({
  providedIn: 'root'
})
export class KardexService {
  private http = inject(HttpClient);


  getAllAndSearchKardex(page: number, limit: number, params: FormSearchKardex, type: string = '', query?: string, field_sort: string = 'id', order: string = 'DESC'): Observable<GetAllKardexes> {
    let url = '';
    if (type === '') {
      url = `${base_url}/kardex?page=${page}&limit=${limit}&field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/kardex?page=${page}&limit=${limit}&type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }
    return this.http.get<GetAllKardexes>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      })
    });
  }

  getAllAndSearchKardexFisico(page: number, limit: number, params: FormSearchKardex, type: string = '', query?: string, field_sort: string = 'id', order: string = 'DESC'): Observable<GetAllKardexes> {
    let url = '';
    if (type === '') {
      url = `${base_url}/kardex/fisico?page=${page}&limit=${limit}&field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/kardex/fisico?page=${page}&limit=${limit}&type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }
    return this.http.get<GetAllKardexes>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      })
    });
  }

  getTotalStockRecumet(page: number, limit: number, params: FormSearchKardex, type: string = '', query?: string, field_sort: string = 'product.cod', order: string = 'ASC'): Observable<GetAllKardexes> {
    let url = '';
    if (type === '') {
      url = `${base_url}/kardex/total-stock-recumet?page=${page}&limit=${limit}&field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/kardex/total-stock-recumet?page=${page}&limit=${limit}&type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }
    return this.http.get<GetAllKardexes>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      })
    });
  }

  getReportPdfTotalStock(params: FormSearchKardex, type: string = '', query?: string, field_sort: string = 'product.cod', order: string = 'ASC') {
    let url = '';
    if (type === '') {
      url = `${base_url}/kardex/total-stock-recumet/pdf?field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/kardex/total-stock-recumet/pdf?type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }
    return this.http.get<any>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob' as 'json'
    });
  }

  getReportExcelTotalStock(params: FormSearchKardex, type: string = '', query?: string, field_sort: string = 'product.cod', order: string = 'ASC') {
    let url = '';
    if (type === '') {
      url = `${base_url}/kardex/total-stock-recumet/excel?field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/kardex/total-stock-recumet/excel?type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }
    return this.http.get(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob',
    });
  }

  //* Reportes Detalles */
  getReportPdf(params: FormSearchKardex, field_sort: string = 'id', order: string = 'DESC') {
    const url = `${base_url}/kardex/pdf?field_sort=${field_sort}&order=${order}`;
    return this.http.get<any>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob' as 'json'
    });
  }

  getReportPdfExistencia(params: FormSearchKardex, field_sort: string = 'id', order: string = 'DESC') {
    const url = `${base_url}/kardex/pdf/existencia?field_sort=${field_sort}&order=${order}`;
    return this.http.get<any>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob' as 'json'
    });
  }

  getReportPdfFisico(params: FormSearchKardex, type: string = '', query: string = '', field_sort: string = 'id', order: string = 'DESC') {
    let url = '';
    if (type === '') {
      url = `${base_url}/kardex/pdf/fisico?field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/kardex/pdf/fisico?type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }

    return this.http.get<any>(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob' as 'json'
    });
  }

  getReportExcel(params: FormSearchKardex, field_sort: string = 'id', order: string = 'DESC') {
    const url = `${base_url}/kardex/excel?field_sort=${field_sort}&order=${order}`;
    return this.http.get(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob',
    });
  }

  getReportExcelExistencia(params: FormSearchKardex, field_sort: string = 'id', order: string = 'DESC') {
    const url = `${base_url}/kardex/excel/existencia?field_sort=${field_sort}&order=${order}`;
    return this.http.get(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob',
    });
  }

  getReportExcelFisico(params: FormSearchKardex, type: string = '', query: string = '', field_sort: string = 'id', order: string = 'DESC') {
    let url = '';
    if (type === '') {
      url = `${base_url}/kardex/excel/fisico?field_sort=${field_sort}&order=${order}`;
    } else {
      url = `${base_url}/kardex/excel/fisico?type=${type}&query=${query}&field_sort=${field_sort}&order=${order}`;
    }

    return this.http.get(url, {
      params: new HttpParams({
        fromObject: {
          ...params
        }
      }),
      responseType: 'blob',
    });
  }
}
