import { Options } from "src/app/core/components/interfaces/OptionsTable.interface";

export interface GetAllAccountsPayable {
    ok:              boolean;
    accountsPayable: AccountsPayable;
}

export interface AccountsPayable {
    previousPage: null | number;
    currentPage:  number;
    nextPage:     null | number;
    total:        number;
    per_page:     number;
    from:         number;
    to:           number;
    data:         AccountPayable[];
    totals:    Totals;
}

interface Totals {
    total_abonados: number,
    total_restante: number,
    total_account: number,
}
export interface AccountPayable {
    id:                    number;
    cod:                   string;
    id_input:              number;
    id_provider:           number;
    description:           string;
    date_credit:           string;
    total:                 string;
    monto_abonado:         number;
    monto_restante:        number;
    status_account:        string;
    status:                boolean;
    createdAt:             string;
    updatedAt:             string;
    provider:              Provider;
    sucursal:              SucursalOrScale;
    input:                 Input;
    abonosAccountsPayable: AbonosAccountsPayable[];
    options?:              Options[];
}

export interface AbonosAccountsPayable {
    id:                 number;
    id_account_payable: number;
    date_abono:         string;
    monto_abono:        number;
    total_abonado:      number;
    restante_credito:   number;
    id_user:            number;
    user:               User;
    status:             boolean;
    comments:           string;
    type_payment:       string;
    account_output:     string;
    payment_voucher?:    string;
    createdAt:          string;
    updatedAt:          string;
}
export interface Input {
    id:              number;
    cod:             string;
    date_voucher:    string;
    type:            string;
    type_payment:    string;
    type_registry:   string;
    registry_number: string;
    account_input:   null;
    comments:        null;
    sumas:           string;
    discount:        string;
    total:           string;
    is_paid:         string;
    id_scales:       number;
    id_storage:      number;
    id_provider:     number;
    id_bank:         null;
    id_user:         number;
    id_sucursal:     number;
    status:          string;
    createdAt:       string;
    updatedAt:       string;
    scale:           SucursalOrScale;
    user:            User;
}

interface SucursalOrScale {
    name: string;
}

interface User {
    full_names:      string;
    number_document: string;
}

interface Provider {
    full_names:        string;
}

//search accounts
export interface FormSearchAccountsPayables {
    status_account:string;
    id_sucursal:   string;
    filterBy:      string;
    date1:         string;
    date2:         string;
    type_registry: string;
    id_provider:   string;
}
//new abono
export interface NewAbonoAccountPayable {
    id_account_payable: string;
    date_abono:         string;
    monto_abono:        string;
}
//response new abono
export interface ResponseNewAbono {
    ok:                    boolean;
    msg:                   string;
    abonosAccountsPayable: AbonoAccountsPayable;
}

export interface AbonoAccountsPayable {
    id:                 number;
    id_account_payable: number;
    date_abono:         string;
    monto_abono:        string;
    total_abonado:      string;
    restante_credito:   string;
    id_user:            number;
    status:             boolean;
    updatedAt:          string;
    createdAt:          string;
}
