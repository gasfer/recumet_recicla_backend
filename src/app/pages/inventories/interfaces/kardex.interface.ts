import { Options } from "src/app/core/components/interfaces/OptionsTable.interface";
import { Category } from "./categories.interface";

export interface GetAllKardexes {
    ok: boolean;
    kardexes: Kardexes;
}

export interface Kardexes {
    previousPage: null;
    currentPage: number;
    nextPage: number;
    total: number;
    total_all: number;
    per_page: number;
    from: number;
    to: number;
    data: Kardex[];
    totals?: {
        quantity_input: number;
        quantity_output: number;
        quantity_saldo: number;
        quantity_saldo_mp?: number;
        quantity_saldo_pt?: number;
    };
    categoryTotals?: {
        [categoryName: string]: {
            quantity_input: number;
            quantity_output: number;
            quantity_saldo: number;
        }
    };
    sucursalTotals?: {
        [sucursalId: string]: {
            name: string;
            quantity_saldo: number;
            quantity_saldo_mp: number;
            quantity_saldo_pt: number;
        }
    };
}

export interface Kardex {
    type: Type;
    date: Date;
    registry_number: string;
    id_movement: string;
    type_movement: string;
    detail: string;
    sub_detail: string;
    quantity: string;
    quantity_input: string;
    quantity_output: string;
    cost_unitario: string;
    cost_input: string;
    cost_output: string;
    saldo: string;
    cost_saldo: string;
    sucursal: Sucursal;
    storage: Storage;
    product: Product;
    options?: Options[];

}

export interface Product {
    cod: string;
    name: string;
    description: null | string;
    costo: string;
    inventariable: boolean;
    img: null | string;
    unit: Unit;
    category: Pick<Category, 'name'>;
}

export interface Unit {
    name: string;
    siglas: string;
}


export interface Storage {
    name: string;
}

export interface Sucursal {
    name: string;
    city: string;
}

export enum Type {
    Input = "INPUT",
    Output = "OUTPUT",
}


export interface FormSearchKardex {
    filterBy: string;
    date1: string;
    date2: string;
    type_kardex: string;
    id_sucursal: string;
    id_sucursales?: string;
    id_storage: string;
    id_storages?: string;
    id_provider: string;
    id_product: string;
    category_types?: string;
    category_ids?: string;
    include_zero?: boolean; //filtro cero
    showZeroSaldo?: boolean;
    id_products?: string;
}
