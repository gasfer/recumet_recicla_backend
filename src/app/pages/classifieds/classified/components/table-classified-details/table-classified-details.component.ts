import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ClassifiedService } from '../../../services/classified.service';
import { ValidatorsService } from 'src/app/services/validators.service';
import { Product } from 'src/app/pages/inventories/interfaces/products.interface';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-table-classified-details',
  templateUrl: './table-classified-details.component.html',
  styles: [
  ]
})
export class TableClassifiedDetailsComponent {
  classifiedService = inject( ClassifiedService );
  validatorsService = inject( ValidatorsService );
  totalSummary      = computed(() => this.classifiedService.detailSale().reduce( (sum, product) => Number(sum) + Number(product.import),0));
  decimalLength     = signal(this.validatorsService.decimalLength());
  decimal           = signal(`1.${this.decimalLength()}-${this.decimalLength()}`);
  totalQuantityItems= computed(() => this.classifiedService.detailSale().reduce( (sum, product) => Number(sum) + Number(product.quantity),0));

  confirmClassified() {
    const mainProduct = this.classifiedService.productSelect();
    if (!mainProduct) {
      Swal.fire({
        title: 'Error de validación',
        text: 'Debe seleccionar un producto a clasificar.',
        icon: 'error',
        customClass: { container: 'swal-alert' }
      });
      return;
    }

    const totalQty = this.totalQuantityItems();
    const stockAvailable = mainProduct.total_stock ?? 0;

    if (totalQty > stockAvailable) {
      Swal.fire({
        title: 'Error de validación',
        text: `La cantidad total a clasificar (${totalQty}) supera el stock disponible del producto a clasificar (${stockAvailable}).`,
        icon: 'error',
        customClass: { container: 'swal-alert' }
      });
      return;
    }

    this.classifiedService.showModalSaveClassified = true;
  }



  updateQuantityProduct(event : any, product : Product){
    let newQuantity = 0;
    if(event.value > 99999999999999){
      event.value = 99999999999999;
    }
    if(event.value !== null){
      newQuantity = event.value;
    }
    product.quantity = newQuantity;
    this.classifiedService.updateDetailSale(product, true, true);  
  }
  
  deleteProductForDetailShopping(idProduct: number) : void {
    this.classifiedService.detailSale.update((details)=> {
      const newProducts = details.filter(product => product.id !== idProduct);
      return newProducts;
    }); 
  }

  clearDetailShopping() : void {
    this.classifiedService.resetClassified();
  }
}
