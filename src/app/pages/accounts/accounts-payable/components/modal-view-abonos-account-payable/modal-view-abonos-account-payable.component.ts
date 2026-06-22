import { Component, inject, signal } from '@angular/core';
import { AccountsPayableService } from '../../../services/accounts-payable.service';
import { ValidatorsService } from 'src/app/services/validators.service';
import { Subscription } from 'rxjs';
import { AccountPayable } from '../../../interfaces/accounts-payable.interface';
import Swal from 'sweetalert2';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-modal-view-abonos-account-payable',
  templateUrl: './modal-view-abonos-account-payable.component.html',
  styles: [
  ]
})
export class ModalViewAbonosAccountPayableComponent {
  accountsPayableService = inject(AccountsPayableService);
  validatorsService      = inject(ValidatorsService);
  accountPayable         = signal<AccountPayable|undefined>(undefined);
  decimalLength          = signal(this.validatorsService.decimalLength());
  decimal                = signal(`1.${this.decimalLength()}-${this.decimalLength()}`);
  viewDetailsSub$!: Subscription;
  
  ngOnInit(): void {
    this.viewDetailsSub$ = this.accountsPayableService.detailsSubs$.subscribe(accountPayable => {
      this.accountPayable.set(accountPayable);
      this.accountPayable.update((accountPayable) => {
        if (!accountPayable) return accountPayable;
        return {
          ...accountPayable,
          abonosAccountsPayable: accountPayable.abonosAccountsPayable.sort((a, b) => a.id - b.id),
        };
      });
    });
  }

  ngOnDestroy(): void {
    this.viewDetailsSub$.unsubscribe();
  }

  deleteAbono(id_abono:number, monto:number):void {
    Swal.fire({
      title: `¿Esta seguro de anular Abono?`,
      text: `Esta apunto de anular el abono de: ${monto}`,
      icon: `warning`,
      confirmButtonText: `Si, Anular!`,
      showLoaderOnConfirm: true,
      showCancelButton: true,
      backdrop:true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      cancelButtonText: 'Cancelar',
      customClass: { container: 'sweetalert2'},
      preConfirm: () => {
        return new Promise((resolve, reject) => {
          this.accountsPayableService.deleteAbonoAccountPayable(id_abono).subscribe({
            complete: () => resolve(true),
            error: (err) => {
              resolve(false);
            }
          });
        });
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if(!result.isConfirmed) return;
      if(result.value) {
        this.accountsPayableService.showModalDetailsAccountPayable = false;
        this.accountsPayableService.reloadAccountsPayable$.next(0);
        Swal.fire({ 
          title: 'Éxito!', 
          text: `El abono fue anulado correctamente`,
          icon: 'success', 
          showClass: { popup: 'animated animate fadeInDown' },
          customClass: { container: 'sweetalert2'},
        });
      }
    });
  }

  triggerFileUpload(abonoId: number) {
    const fileInput = document.getElementById('file-upload-' + abonoId) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onFileSelected(event: any, abonoId: number) {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      this.uploadVoucher(abonoId, file);
    }
  }

  uploadVoucher(abonoId: number, file: File) {
    Swal.fire({
      title: 'Subiendo comprobante...',
      didOpen: () => {
        Swal.showLoading();
      },
      allowOutsideClick: false
    });
    
    this.accountsPayableService.uploadVoucherAbono(abonoId, file, false).subscribe({
      next: (resp) => {
        Swal.fire({
          title: 'Éxito!',
          text: 'Comprobante subido correctamente.',
          icon: 'success',
          customClass: { container: 'swal-alert' }
        });
        
        this.accountsPayableService.reloadAccountsPayable$.next(this.accountPayable()?.id || 0);
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
