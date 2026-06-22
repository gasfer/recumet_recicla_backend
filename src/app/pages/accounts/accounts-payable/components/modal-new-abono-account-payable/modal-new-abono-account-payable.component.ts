import { Component, OnInit, inject, signal } from '@angular/core';
import { AccountsPayableService } from '../../../services/accounts-payable.service';
import { ValidatorsService } from 'src/app/services/validators.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import { Subscription } from 'rxjs';
import { AccountPayable } from '../../../interfaces/accounts-payable.interface';
import { Bank } from 'src/app/pages/managements/interfaces/bank.interface';
import { BankService } from 'src/app/pages/managements/services/bank.service';

@Component({
  selector: 'app-modal-new-abono-account-payable',
  templateUrl: './modal-new-abono-account-payable.component.html',
  styles: [
  ]
})
export class ModalNewAbonoAccountPayableComponent implements OnInit {
  accountsPayableService = inject(AccountsPayableService);
  validatorsService      = inject( ValidatorsService );
  fb                     = inject( FormBuilder );
  loading                = signal(false);
  types_pay              = signal([{name: 'EFECTIVO', code: 'EFECTIVO'},{name: 'CHEQUE', code: 'CHEQUE'},{name: 'TRANSFERENCIA', code: 'TRANSFERENCIA'},{name: 'QR', code: 'QR'}]);
  viewDetailsSub$!       : Subscription;
  accountPayable          = signal<AccountPayable|undefined>(undefined);
  decimalLength           = signal(this.validatorsService.decimalLength());
  banks                   = signal<Bank[]>([]);
  bankService             = inject( BankService );
  voucherFile?            : File;

  abonoForm: FormGroup = this.fb.group({
    id_account_payable: [],
    date_abono: [new Date(), [ Validators.required]],
    monto_abono: [0],
    type_payment: ['EFECTIVO',[Validators.required]],
    comments: [null,[]],
    account_output: [null,[]],
    id_bank: [null,[]],
    id_bank_origin: [null,[]],
    account_origin: [null,[]],
    number_transaction: [null,[]]
  });

  ngOnInit(): void {
    this.viewDetailsSub$ = this.accountsPayableService.detailsSubs$.subscribe(accountPayable => {
      this.accountPayable.set(accountPayable);
      this.abonoForm.get('monto_abono')?.clearValidators();
      this.abonoForm.get('monto_abono')?.addValidators([Validators.min(0),Validators.max(accountPayable.monto_restante)]);
      this.abonoForm.patchValue({
        id_account_payable: accountPayable.id,
        monto_abono:accountPayable.monto_restante
      })
    });
    this.getAllBanks();
  }

  newAbono() {
    this.abonoForm.markAllAsTouched();
    if(!this.abonoForm.valid) return;
    this.loading.set(true);
    this.accountsPayableService.postNewAbonoAccountPayable(this.abonoForm.value).subscribe({
      next: (resp) => {
        if (this.voucherFile) {
          this.accountsPayableService.uploadVoucherAbono(resp.abonosAccountsPayable.id, this.voucherFile, false).subscribe({
            next: () => {
              this.afterSaveAbono(resp);
            },
            error: () => {
              Swal.fire({
                title: 'Aviso',
                text: 'El abono se registró pero no se pudo subir el comprobante de pago.',
                icon: 'info',
                customClass: { container: 'swal-alert' },
              });
              this.afterSaveAbono(resp);
            }
          });
        } else {
          this.afterSaveAbono(resp);
        }
      },
      error: (error) => {
        Swal.fire({
          title: 'Advertencia!',
          text: error?.error?.errors[0]?.msg ? error?.error?.errors[0]?.msg : 'Los datos no son validos, Intenta nuevamente',
          icon: 'warning',
          showClass: { popup: 'animated animate fadeInDown' },
          customClass: { container: 'swal-alert'},
        });
        this.loading.set(false);
      }
    });
  }

  afterSaveAbono(resp: any) {
    this.accountsPayableService.reloadAccountsPayable$.next(this.abonoForm.get('id_account_payable')?.value);
    this.loading.set(false);
    this.accountsPayableService.showModalNewAbono = false;
    //si paga todo cerramos el modal de detalle
    if(this.accountPayable()?.monto_restante == this.abonoForm.get('monto_abono')?.value) {
      this.accountsPayableService.showModalDetailsAccountPayable = false;
    }
    Swal.fire({
      title: 'Éxito!',
      text: `Abono nuevo agregado correctamente`,
      icon: 'success',
      showClass: { popup: 'animated animate fadeInDown' },
      customClass: { container: 'swal-alert'},
    }).then(() => this.accountsPayableService.printVoucherAbonoAccountPayablePdf(resp.abonosAccountsPayable.id));
  }

  resetModal() {
    this.abonoForm.reset({
      id_account_payable: null,
      date_abono: new Date(),
      monto_abono: 0,
      comments: null,
      account_output: null,
      type_payment: 'EFECTIVO',
      id_bank:null,
      id_bank_origin: null,
      account_origin: null,
      number_transaction: null
    });
    this.voucherFile = undefined;
    this.clearPaymentValidators();
  }

  selectTypePay() {
    const type = this.abonoForm.get('type_payment')?.value;
    this.clearPaymentValidators();

    if (type == 'CHEQUE') {
      this.setRequired('account_output');
      this.setRequired('id_bank');
    }

    if (type == 'TRANSFERENCIA' || type == 'QR') {
      this.setRequired('account_output');
      this.setRequired('id_bank');
      this.setRequired('id_bank_origin');
      this.setRequired('account_origin');
      this.setRequired('number_transaction');
    }
  }

  setRequired(field: string) {
    const control = this.abonoForm.get(field);
    if (control) {
      control.setValidators([Validators.required]);
      control.updateValueAndValidity();
    }
  }

  clearPaymentValidators() {
    const fields = ['account_output', 'id_bank', 'id_bank_origin', 'account_origin', 'number_transaction'];

    fields.forEach(f => {
      const control = this.abonoForm.get(f);
      control?.clearValidators();
      control?.updateValueAndValidity();
    });
  }

  getAllBanks() {
    this.bankService.getAllAndSearch(1,10000,true).subscribe({
      next: (resp) => this.banks.set(resp.banks.data),
      error: () => this.banks.set([])
    });
  }

  onVoucherFileChange(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.voucherFile = event.target.files[0];
    }
  }

  removeVoucherFile() {
    this.voucherFile = undefined;
  }
}
