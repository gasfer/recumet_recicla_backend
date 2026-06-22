import { Component, computed, inject, signal } from '@angular/core';
import { Provider } from '../interfaces/provider.interface';
import { ProvidersService } from '../services/providers.service';
import { ComponentsService } from 'src/app/core/services/components.service';
import { InputsService } from '../services/inputs.service';
import { ProductsService } from '../../inventories/services/products.service';
import { Product } from '../../inventories/interfaces/products.interface';
import { ValidatorsService } from 'src/app/services/validators.service';
import { FormBuilder, UntypedFormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-input-small',
  templateUrl: './input-small.component.html',
  styles: [`
    .card {
      border-radius: 20px;
      box-sizing: border-box;
    }
  `
  ]
})
export class InputSmallComponent  {
  providerService  = inject( ProvidersService );
  productService   = inject( ProductsService );
  inputsService    = inject( InputsService );
  componentService = inject( ComponentsService );
  validatorsService = inject( ValidatorsService );
  fb                = inject( FormBuilder  );
  suggestedProviders    = signal<Provider[]>([]);
  suggestedProducts     = signal<Product[]>([]);
  txtSearchProvider     = signal('');
  txtSearchProduct      = signal('');
  loadingSearchProvider = signal(false);
  loadingSearchProduct  = signal(false);
  totalItems            = computed(() => this.inputsService.detailShopping().length);
  providerSelect        = computed(() => this.inputsService.providerSelect());
  providerSelectName    = computed(() => `${this.inputsService.providerSelect()?.number_document ?? '0'} / ${this.providerSelect()?.full_names}`);

  formReport:UntypedFormGroup = this.fb.group({
    id_sucursal: ['',[Validators.required]],
    id_storage: ['',[Validators.required]],
  });

  ngOnInit(): void {
    const id_storage_pos  = localStorage.getItem('id_storage_posI');
    const findStorage = this.validatorsService.storages().find(resp => resp.id === Number(id_storage_pos));
    this.formReport.patchValue({
      id_sucursal: this.validatorsService.id_sucursal(),
      id_storage: findStorage ? Number(id_storage_pos) : null
    });
    this.formReport.markAllAsTouched();
    if(!this.inputsService.isEdit){
      this.inputsService.resetInput();
    } else {
      const output_edit =  this.inputsService.dataInputForEdit();
      this.formReport.patchValue({id_storage:Number(output_edit?.id_storage)})
    }
  }
  
  suggestedProvider(txtSearchProvider: string){
    if(txtSearchProvider.length==0) {
      this.txtSearchProvider.set('');
      this.suggestedProviders.set([]);
      return;
    }
    this.loadingSearchProvider.set(true);
    this.txtSearchProvider.set(txtSearchProvider);
    this.suggestedProviders.set([]);
    this.providerService.getProvidersAutocomplete(txtSearchProvider)
        .subscribe({
          next: (resp) => { 
            this.suggestedProviders.set(resp.providers);
            this.loadingSearchProvider.set(false);
          },
          error: (err) => {
            this.loadingSearchProvider.set(false);
          }
        });    
  }

  selectProvider(provider: Provider) {
    this.suggestedProviders.set([]);
    this.txtSearchProvider.set('');
    this.componentService.clearInputSearch$.next(true);
    this.inputsService.providerSelect.set(provider);
  }

  newProvider() {
    this.providerService.showModal = true;
  }

  suggestedProduct(txtSearchProduct: string){
    if(txtSearchProduct.length==0) {
      this.txtSearchProduct.set('');
      this.suggestedProducts.set([]);
      return;
    }
    this.loadingSearchProduct.set(true);
    this.txtSearchProduct.set(txtSearchProduct);
    this.suggestedProducts.set([]);
    this.productService.getAllAndSearch(1,1000,true,'pos',txtSearchProduct,true, this.formReport.get('id_sucursal')?.value,this.formReport.get('id_storage')?.value,)
        .subscribe({
          next: (resp) => {
            this.suggestedProducts.set(resp.products.data);
            this.loadingSearchProduct.set(false);
            if(this.inputsService._inputConfig.searchForCode){
              this.addItemCar(this.suggestedProducts()[0]);
              this.componentService.clearInputSearch$.next(true);
            }
          },
          error: (e) => {
            this.loadingSearchProduct.set(false);
          }
        });
  }

  addItemCar(product:Product) {
    this.inputsService.updateDetailShopping(product);
    if(this.inputsService._inputConfig.clearInputAfterProductSearch){
      this.componentService.clearInputSearch$.next(true);
    }
  }

  addItemCarByViewProduct(product:Product) {
    this.inputsService.updateDetailShopping(product);
  }
  addItemCarByCodProduct(product:Product) {
    if(this.inputsService._inputConfig.searchForCode){
      this.addItemCar(product);
      this.componentService.clearInputSearch$.next(false);
    }
  }
  setSelectStorage() {
    const id_storage = this.formReport.get('id_storage')?.value;
    if(id_storage){
      localStorage.setItem('id_storage_posI', id_storage);
    }
    // this.inputsService.resetInput();
  }
}
