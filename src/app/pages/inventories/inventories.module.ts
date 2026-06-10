import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InventoriesRoutingModule } from './inventories-routing.module';
import { ProductsComponent } from './products/products.component';
import { CategoriesComponent } from './categories/categories.component';
import { UnitsComponent } from './units/units.component';
import { ModalCategoryComponent } from './categories/components/modal-category/modal-category.component';
import { ModalUnitComponent } from './units/components/modal-unit/modal-unit.component';
import { PagesModule } from '../pages.module';
import { ModalProductComponent } from './products/components/modal-product/modal-product.component';
import { ScalesComponent } from './scales/scales.component';
import { ModalScaleComponent } from './scales/components/modal-scale/modal-scale.component';
import { ModalPricesComponent } from './products/components/modal-prices/modal-prices.component';
import { ModalNewPriceComponent } from './products/components/modal-new-price/modal-new-price.component';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { KardexComponent } from './kardex/kardex.component';
import { KardexFisicoComponent } from './kardex-fisico/kardex-fisico.component';
import { KardexExistenciaComponent } from './kardex-existencia/kardex-existencia.component';
import { ModalAssignSucursalesProductsComponent } from './products/components/modal-assign-sucursales-products/modal-assign-sucursales-products.component';
import { ModalProvidersProductComponent } from './products/components/modal-providers-product/modal-providers-product.component';
import { ListCostsProductComponent } from './list-costs-product/list-costs-product.component';
import { PaginatorModule } from 'primeng/paginator';
import { TableListCostsProductsComponent } from './list-costs-product/components/table-list-costs-products/table-list-costs-products.component';
import { TotalStockRecumetComponent } from './total-stock-recumet/total-stock-recumet.component';
import { InputsModule } from '../inputs/inputs.module';
import { OutputsModule } from '../outputs/outputs.module';
import { ClassifiedsModule } from '../classifieds/classifieds.module';
import { TransfersModule } from '../transfers/transfers.module';


@NgModule({
  declarations: [
    ProductsComponent,
    CategoriesComponent,
    UnitsComponent,
    ModalCategoryComponent,
    ModalUnitComponent,
    ModalProductComponent,
    ScalesComponent,
    ModalScaleComponent,
    ModalPricesComponent,
    ModalNewPriceComponent,
    KardexComponent,
    KardexFisicoComponent,
    KardexExistenciaComponent,
    ModalAssignSucursalesProductsComponent,
    ModalProvidersProductComponent,
    ListCostsProductComponent,
    TableListCostsProductsComponent,
    TotalStockRecumetComponent
  ],
  imports: [
    CommonModule,
    InventoriesRoutingModule,
    PagesModule,
    PipesModule,
    PaginatorModule,
    InputsModule,
    OutputsModule,
    ClassifiedsModule,
    TransfersModule
  ],
  exports: [ModalProductComponent]
})
export class InventoriesModule { }
