import { Options } from "src/app/core/components/interfaces/OptionsTable.interface";

export interface AccountsPayableAll {
    previousPage: null | number;
    currentPage:  number;
    nextPage:     number;
    total:        number;
    total_all:    number;
    per_page:     number;
    from:         number;
    to:           number;
    data:         AccountPayableAll[];
    totals:    Totals;
}
interface Totals {
    total_abonados: number,
}
export interface AccountPayableAll {
    id:                   number;
    ids_account_payables: number[];
    ids_abonos_payables:  number[];
    codes_input:          string[];
    date_abono:           Date;
    monto_abono:          string;
    id_user:              number;
    id_provider:          number;
    comments:             null;
    type_payment:         string;
    account_output:       null | number;
    id_bank:              null | number;
    id_sucursal:          number;
    from_pay_multiple:    boolean;
    payment_voucher?:     string;
    createdAt:            Date;
    updatedAt:            Date;
    sucursal:             Sucursal;
    user:                 Provider;
    provider:             Provider;
    options?:              Options[];
}

export interface Provider {
    full_names: string;
}


export interface Sucursal {
    name: string;
}


export interface FormSearchAbonosPayables {
    id_sucursal:   string;
    filterBy:      string;
    date1:         string;
    date2:         string;
    id_provider:   string;
}
