import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { ClassifiedService } from '../../../services/classified.service';
import { ScalesService } from 'src/app/pages/inventories/services/scales.service';
import { ValidatorsService } from 'src/app/services/validators.service';
import { FormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { Scale } from 'src/app/pages/inventories/interfaces/scale.interface';
import { NewClassifiedForm } from '../../../interfaces/classified.interface';
import Swal from 'sweetalert2';
import { ComponentsService } from 'src/app/core/services/components.service';

@Component({
  selector: 'app-modal-save-classified',
  templateUrl: './modal-save-classified.component.html',
  styles: [
  ]
})
export class ModalSaveClassifiedComponent implements OnInit {
  classifiedService = inject( ClassifiedService );
  componentService  = inject( ComponentsService );
  scalesService     = inject( ScalesService );
  validatorsService = inject( ValidatorsService );
  fb                = inject( FormBuilder );
  types_registry    = computed(() => this.classifiedService.types_registry());
  decimalLength     = signal(this.validatorsService.decimalLength());
  decimal           = signal(`1.${this.decimalLength()}-${this.decimalLength()}`);
  scales            = signal<Scale[]>([]);
  loading           = signal(false);
  productSelect     = computed(() => this.classifiedService.productSelect());
  totalQuantityItems= computed(() => this.classifiedService.detailSale().reduce( (sum, product) => Number(sum) + Number(product.quantity),0));
  @Input({required: true}) id_sucursal : number | null = null;
  @Input({required: true}) id_storage : number | null = null;

  formClassified: UntypedFormGroup  = this.fb.group({
    id_scale: [1,[Validators.required]],
    id_sucursal: ['',[Validators.required]],
    id_storage: ['',[Validators.required]],
    id_product: ['',[Validators.required]],
    cost_product: ['',[Validators.required]],
    date_classified: [new Date(),[Validators.required]],
    quantity_product: ['',[Validators.required, Validators.min(0.1)]],
    type_registry: ['FICHA',[Validators.required]],
    number_registry: ['',[Validators.required]],
    comments: [null,[]],
    status: ['ACTIVE',[Validators.required]],
  });

  ngOnInit(): void {
    this.getAllScales();
  }

  saveClassified() {
    this.formClassified.markAllAsTouched();
    this.formClassified.patchValue({
      id_product: this.productSelect()?.id,
      id_sucursal: this.id_sucursal,
      id_storage: this.id_storage,
      cost_product: this.productSelect()?.costo,
    });
    if(!this.formClassified.valid) return;

    const quantity = this.formClassified.get('quantity_product')?.value;
    const stockAvailable = this.productSelect()?.total_stock ?? 0;
    if (quantity > stockAvailable) {
      Swal.fire({
        title: 'Error de validación',
        text: `El stock a reducir (${quantity}) no puede superar el stock disponible (${stockAvailable}).`,
        icon: 'error',
        customClass: { container: 'swal-alert' }
      });
      return;
    }

    this.loading.set(true);
    const classifiedDetail = this.classifiedService.detailSale().map(prod=> ({
      quantity: prod.quantity,
      cost: prod.costo,
      id_product: prod.id,
      status: "ACTIVE"
    }));
    const data:NewClassifiedForm = {
      classified_data: this.formClassified.value,
      classified_details: classifiedDetail
    }
    this.classifiedService.postNewClassified(data).subscribe({
      next: (resp) => {
        Swal.fire({
          title: 'Éxito!',
          text: `Clasificación registrada exitosamente`,
          icon: 'success',
          showClass: { popup: 'animated animate fadeInDown' },
          customClass: { container: 'swal-alert'},
        });
        this.classifiedService.showModalSaveClassified = false;
        this.classifiedService.resetClassified();
        if(this.classifiedService._classifiedConfig.printAfter) {
          this.classifiedService.printPdfReport(resp.id_classified);
        }
        this.componentService.clearInputSearch$.next(true);
      },
      complete: () => this.loading.set(false),
      error: () => this.loading.set(false)
    });
  }


  getAllScales() {
    this.scalesService.getAllAndSearch(1,10000,true).subscribe({
      next: (resp) => this.scales.set(resp.scales.data),
      error: () => this.scales.set([])
    });
  }

  showModal() {
    if(this.productSelect()!.total_stock! < this.totalQuantityItems()) {
      this.formClassified.get('quantity_product')?.setValue(this.productSelect()!.total_stock);
    } else {
      this.formClassified.get('quantity_product')?.setValue(this.totalQuantityItems());
    }
  }

  resetModal() {
    this.formClassified.reset({
      id_scale: '',
      id_sucursal: '',
      id_storage: '',
      id_product: '',
      cost_product: '',
      quantity_product: '',
      type_registry: 'FICHA',
      number_registry: '',
      date_classified: new Date(),
      comments: null,
      status: 'ACTIVE',
    });
  }

  selectTypeRegistry() {
    const type_registry = this.formClassified.get('type_registry')?.value;
    this.formClassified.patchValue({number_registry: ''});
    if(type_registry == 'SIN FICHA') {
      this.formClassified.get('number_registry')?.setValidators([]);
    } else {
      this.formClassified.get('number_registry')?.setValidators([Validators.required]);
    }
    this.formClassified.get('number_registry')?.updateValueAndValidity();
  }

}
