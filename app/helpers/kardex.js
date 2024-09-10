
const returnDataKardexInput = (detalle,id_product_classified,id_sucursal_origin,registry_number,old_kardex,product,id_input, id_provider, id_sucursal, id_storage,id_output = null) => {
    //** id_output si existe es anulacion de venta, por ende ingresa con el costo u saldo no con el que se envia en detalle */
    const costo_total_new  = id_output ?  Number(product.quantity) * Number(old_kardex?.cost_u_saldo) : Number(product.quantity) * Number(product.cost);
    //La primera vez el cost_total_inicial es 0 por ende tomamos el total de entrada para las siguientes ya se tiene el saldo
    const cost_total_saldo = Number(old_kardex?.cost_total_inicial) === 0 ? Number(old_kardex?.cost_total_input) + costo_total_new : Number(old_kardex?.cost_total_saldo) + costo_total_new;
    const quantity_saldo   = Number(old_kardex?.quantity_saldo) + Number(product.quantity);
    return {
        type: 'INPUT',
        date: new Date(),
        detalle,
        document: registry_number,
        quantity_inicial: old_kardex ? old_kardex.quantity_saldo : 0,
        cost_u_inicial:old_kardex ? old_kardex.cost_u_saldo : product.cost,
        cost_total_inicial:old_kardex ? old_kardex.cost_total_saldo : 0 ,
        cost_u_input: id_output ? old_kardex?.cost_u_saldo : product.cost,
        quantity_input: product.quantity,
        cost_total_input: costo_total_new,
        quantity_saldo: old_kardex ? quantity_saldo : product.quantity,
        cost_u_saldo: old_kardex ? (cost_total_saldo / quantity_saldo) : product.cost,
        cost_total_saldo: old_kardex ?  cost_total_saldo : (Number(product.cost) * Number(product.quantity)),
        id_product: product.id_product,
        id_input, id_provider, id_sucursal, id_storage,id_output,id_product_classified,id_sucursal_origin_destination: id_sucursal_origin,
        status: true
    };
}

const returnDataKardexOutput = (detalle,id_client,price_u_inicial,id_sucursal_destination,number_registry,old_kardex,product,id_output, id_sucursal, id_storage,id_input=null) => {
    //algún cambio también en función editar venta
    const costo_total_new  = old_kardex ? Number(product.quantity) * Number(old_kardex.cost_u_saldo) : Number(product.quantity) * Number(product.cost);
    const quantity_saldo   = Number(old_kardex?.quantity_saldo) - Number(product.quantity);
    return {
        type: 'OUTPUT',
        date: new Date(),
        detalle,
        document: number_registry,
        quantity_inicial: old_kardex ? old_kardex.quantity_saldo : 0,
        cost_u_inicial:old_kardex ? old_kardex.cost_u_saldo : product.cost,
        cost_total_inicial:old_kardex ? old_kardex.cost_total_saldo : 0 ,

        quantity_output: product.quantity,
        cost_u_output: old_kardex ? old_kardex.cost_u_saldo : product.cost,
        cost_total_output:costo_total_new,
        
        quantity_saldo: old_kardex ? quantity_saldo : product.quantity,
        cost_u_saldo: old_kardex ? old_kardex.cost_u_saldo : product.cost,
        cost_total_saldo: old_kardex ? (quantity_saldo * Number(old_kardex.cost_u_saldo)) : (Number(product.cost) * Number(product.quantity)),
        id_product: product.id_product,
        id_output, id_sucursal, id_storage, id_input,id_client,price_u_inicial,id_sucursal_origin_destination:id_sucursal_destination,
        status: true
    };
}

const returnDataAfterUpdateKardex = (kardex_after,old_kardex) => {
    const data_kardex = {
        type: kardex_after.type,
        date: new Date(kardex_after.date),
        detalle: kardex_after.detalle,
        document: kardex_after.document,
        quantity_inicial: old_kardex ? old_kardex.quantity_saldo : 0,
        cost_u_inicial:old_kardex ? old_kardex.cost_u_saldo : 0,
        cost_total_inicial: old_kardex ? old_kardex.cost_total_saldo : 0,
        cost_u_input: kardex_after?.id_output ? old_kardex?.cost_u_saldo : kardex_after?.cost_u_input,
        cost_u_output: kardex_after?.cost_u_output,
        quantity_input: kardex_after?.quantity_input,
        quantity_output: kardex_after?.quantity_output,
        id_product: kardex_after.id_product,
        id_input: kardex_after?.id_input,
        id_output: kardex_after?.id_output,
        id_provider: kardex_after.id_provider,
        id_sucursal: kardex_after.id_sucursal,
        id_storage: kardex_after.id_storage,
        status: kardex_after.status,
        id_sucursal_origin_destination: kardex_after.id_sucursal_origin_destination
    }
    if(kardex_after.type === 'INPUT') {
        const costo_total_new  = kardex_after?.id_output ?  Number(kardex_after.quantity_input) * Number(old_kardex?.cost_u_saldo) : Number(kardex_after.quantity_input) * Number(kardex_after.cost_u_input);
        const cost_total_saldo = Number(old_kardex?.cost_total_inicial) === 0 ? Number(old_kardex?.cost_total_input) + costo_total_new : Number(old_kardex?.cost_total_saldo) + costo_total_new;
        const quantity_saldo   = Number(old_kardex?.quantity_saldo) + Number(kardex_after.quantity_input);
        data_kardex.quantity_saldo      = old_kardex ? quantity_saldo : kardex_after.quantity_input;
        data_kardex.cost_u_saldo        = old_kardex ? (cost_total_saldo / quantity_saldo) : kardex_after.cost_u_input;
        data_kardex.cost_total_saldo    = old_kardex ?  cost_total_saldo : (Number(kardex_after.cost_u_input) * Number(kardex_after?.quantity_input));
        data_kardex.cost_total_input    = costo_total_new;
        data_kardex.id_product_classified = kardex_after.id_product_classified
    } else { //*OUTPUT
        const costo_total_new   = old_kardex ? Number(kardex_after.quantity_output) * Number(old_kardex.cost_u_saldo) : Number(kardex_after.quantity_output) * Number(kardex_after.cost_u_output);
        const quantity_saldo    = Number(old_kardex?.quantity_saldo) - Number(kardex_after.quantity_output);
        data_kardex.quantity_saldo      = old_kardex ? quantity_saldo : kardex_after.quantity_output;
        data_kardex.cost_u_saldo        = old_kardex ? old_kardex.cost_u_saldo : kardex_after.cost_u_output;
        data_kardex.cost_total_saldo    = old_kardex ? (quantity_saldo * Number(old_kardex.cost_u_saldo)) : (Number(kardex_after.cost_u_output) * Number(kardex_after?.quantity_output));
        data_kardex.cost_total_output   = costo_total_new;
        data_kardex.id_client           = kardex_after.id_client;
        data_kardex.price_u_inicial     = kardex_after.price_u_inicial;
    }
    return data_kardex;
}


module.exports = {
    returnDataKardexInput,
    returnDataKardexOutput,
    returnDataAfterUpdateKardex
}