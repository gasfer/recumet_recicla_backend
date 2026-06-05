import {HttpClient, HttpParams} from '@angular/common/http';
import {Injectable, inject} from '@angular/core';
import {Observable} from 'rxjs';
import {GetAllProviders, Provider} from '../interfaces/provider.interface';
import {environment} from 'src/environments/environment';

const base_url = environment.base_url;

@Injectable({
    providedIn: 'root'
})
export class ProvidersService {
    private http = inject(HttpClient);
    isEdit: boolean = false;
    showModal: boolean = false;

    getAllAndSearch(
        page: number,
        limit: number,
        status: boolean,
        type: string = '',
        query: string = '',
        field_sort: string = 'id',
        order: string = 'DESC',
        id_type_provider: string = ''
    ): Observable<GetAllProviders> {

        let params = new HttpParams()
            .set('page', page)
            .set('limit', limit)
            .set('status', status)
            .set('field_sort', field_sort)
            .set('order', order);

        if (id_type_provider) {
            params = params.set('id_type_provider', id_type_provider);
        }

        if (type) {
            params = params.set('type', type);
        }

        if (query) {
            params = params.set('query', query);
        }

        return this.http.get<GetAllProviders>(`${base_url}/provider`, {params});
    }

    getProvidersAutocomplete(query: string = ''): Observable<{ ok: boolean, providers: Provider[] }> {
        let params = new HttpParams().set('query', query);
        return this.http.get<{ ok: boolean, providers: Provider[] }>(`${base_url}/provider/autocomplete`, {params});
    }

}
