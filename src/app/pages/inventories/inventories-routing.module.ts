import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CategoriesComponent } from './categories/categories.component';
import { ProductsComponent } from './products/products.component';
import { UnitsComponent } from './units/units.component';
import { ScalesComponent } from './scales/scales.component';
import { KardexComponent } from './kardex/kardex.component';
import { KardexFisicoComponent } from './kardex-fisico/kardex-fisico.component';
import { KardexExistenciaComponent } from './kardex-existencia/kardex-existencia.component';
import { ListCostsProductComponent } from './list-costs-product/list-costs-product.component';
import { TotalStockRecumetComponent } from './total-stock-recumet/total-stock-recumet.component';

const routes: Routes = [
  {
    path: 'products', component: ProductsComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Productos', active: true }], name: 'PRODUCTOS' }
  },
  {
    path: 'categories', component: CategoriesComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Categorías', active: true }], name: 'CATEGORIAS' }
  },
  {
    path: 'units', component: UnitsComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Unidad de medida', active: true }], name: 'UND MEDIDA' }
  },
  {
    path: 'scales', component: ScalesComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Balanzas', active: true }], name: 'BALANZAS' }
  },
  {
    path: 'kardex', component: KardexComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Kardex', active: true }], name: 'KARDEX' }
  },
  {
    path: 'kardex-fisico/mp', component: KardexFisicoComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Kardex Físico', active: true }], name: 'KARDEX', category_types: 'RAW_MATERIAL', title: 'KARDEX Materia Prima (MP)' }
  },
  {
    path: 'kardex-fisico/pt', component: KardexFisicoComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Kardex Físico', active: true }], name: 'KARDEX', category_types: 'FINISHED_PRODUCT', title: 'KARDEX Productos Terminados(PT)' }
  },
  {
    path: 'kardex-fisico/ar', component: KardexFisicoComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Kardex Físico', active: true }], name: 'KARDEX', category_types: 'RESALE_ITEM', title: 'KARDEX Artículos de Reventa (AR)' }
  },
  {
    path: 'kardex-fisico/all', component: KardexFisicoComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Kardex Físico', active: true }], name: 'KARDEX', category_types: '', title: 'KARDEX de todos los Productos' }
  },
  {
    path: 'kardex-existencia', component: KardexExistenciaComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Kardex De Existencia', active: true }], name: 'KARDEX' }
  },
  {
    path: 'list-products-prices', component: ListCostsProductComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Productos' }, { title: 'Listado de precios', active: true }], name: 'LISTADO DE PRECIOS' }
  },
  {
    path: 'total-stock-recumet', component: TotalStockRecumetComponent,
    data: { data: [{ title: 'Administración' }, { title: 'Almacén' }, { title: 'Total Stock Recumet', active: true }], name: 'KARDEX', title: 'Total Stock Recumet' }
  },
  { path: '**', redirectTo: 'products' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InventoriesRoutingModule { }
