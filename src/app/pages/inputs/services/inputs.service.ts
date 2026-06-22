import {Injectable, inject, signal} from '@angular/core';
import {Input, InputConfig} from '../interfaces/input.interface';
import {Product} from '../../inventories/interfaces/products.interface';
import {Provider} from '../interfaces/provider.interface';
import {HttpClient} from '@angular/common/http';
import {environment} from 'src/environments/environment';

const base_url = environment.base_url;

@Injectable({
    providedIn: 'root'
})
export class InputsService {
    detailShopping = signal<Product[]>([]);
    providerSelect = signal<Provider | undefined>(undefined);
    dataInputForEdit = signal<Input | undefined>(undefined);
    showModalSaveInput: boolean = false;
    isEdit: boolean = false;
    private http = inject(HttpClient);
    referral_sources = signal([
        {name: 'Redes Sociales (Facebook, TikTok, Instagram)', code: 'REDES SOCIALES'},
        {name: 'Página Web RECUMET', code: 'PAGINA WEB RECUMET'},
        {name: 'Búsqueda en Google', code: 'GOOGLE'},
        {name: 'Referido por amigo/Amiga', code: 'REFERIDO POR AMIGO'},
        {name: 'Feria o Rueda de Negocios', code: 'FERIA'},
        {name: 'Seguimiento Comercial (Llamadas periódicas)', code: 'SEGUIMIENTO COMERCIAL'}
    ]);

    public _inputConfig: InputConfig = {
        searchForCode: localStorage.getItem('searchForCode') === 'true' ? true : false,
        clearInputAfterProductSearch: localStorage.getItem('clearInputAfterProductSearch') === 'false' ? false : true,
        viewCardProducts: localStorage.getItem('viewCardProducts') === 'true' ? true : false,
        printAfter: localStorage.getItem('printAfter') === 'false' ? false : true,
        viewMoneyButtons: localStorage?.getItem('viewMoneyButtons') === 'false' ? false : true,
        printRoll: localStorage.getItem('printRoll') === 'true' ? true : false,
        printHalfPage: localStorage.getItem('printHalfPage') === 'true' ? true : false,
    }

    resetInput() {
        this.detailShopping.update((details) => details = []);
        this.providerSelect.set(undefined);
    }

    updateDetailShopping(product: Product, updateQuantity: boolean = true, newQuantity: boolean = false) {
        const productExist = this.detailShopping().length > 0 ? this.detailShopping().find((prod) => prod.id === product.id) : false;
        if (productExist) {
            this.detailShopping.update((details) => {
                return details.map((prod) => {
                    if (prod.id !== product.id) return prod;
                    if (updateQuantity) {
                        prod.quantity = newQuantity ? product.quantity : prod.quantity + (prod.set_quantity ?? 1);
                    }
                    prod.import = prod.quantity * prod.costo;
                    return prod;
                });
            });
        } else {
            //primera agregación al carrito
            product.quantity = product.set_quantity ?? 1;
            product.import = product.quantity * product.costo;
            this.detailShopping.update((details) => [
                ...details,
                product,
            ]);
        }
    }


}
