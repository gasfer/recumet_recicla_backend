const {
  User,
  Category,
  Unit,
  Sucursal,
  Client,
  Storage,
  Product,
  Trasport_company,
  Chauffeurs,
  Cargo_truck,
  Provider,
  Scale,
  Price,
  Sector,
  Bank,
  Input,
  Output,
  Classified,
  AccountsPayable,
  AbonosAccountsPayable,
  AccountsReceivable,
  AbonosAccountsReceivable,
  Transfers
} = require("../../database/config");

// ========================= USER VALIDATE ============================
const idExistUser = async (id = "") => {
  const idExist = await User.findByPk(id);
  if (!idExist) {
    throw new Error(`El usuario con id: ${id}, no existe`);
  }
};
const emailExistUser = async (email = "",{req}) => {
  const { id } = req.params;
  const existDB = await User.findOne({ where: { email } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El usuario con email: ${email}, ya existe`);
  }
};
const number_documentExistUser = async (number_document = "",{req}) => {
  const { id } = req.params;
  const existDB = await User.findOne({ where: { number_document } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El usuario con carnet: ${number_document}, ya existe`);
  }
};
// =================================================================
// ========================== CATEGORY =============================
const idExistCategory = async (id = "") => {
  const idExist = await Category.findByPk(id);
  if (!idExist) {
    throw new Error(`La categoría con id: ${id}, no existe`);
  }
};
const nameExistCategory = async (name = "",{req}) => {
  const { id } = req.params;
  const existDB = await Category.findOne({ where: { name } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`La categoría con nombre: ${name}, ya existe`);
  }
};
// =================================================================
// ==========================   UNIT   =============================
const idExistUnit = async (id = "") => {
  const idExist = await Unit.findByPk(id);
  if (!idExist) {
    throw new Error(`La unidad con id: ${id}, no existe`);
  }
};
const nameExistUnit = async (name = "",{req}) => {
  const { id } = req.params;
  const existDB = await Unit.findOne({ where: { name } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`La unidad con nombre: ${name}, ya existe`);
  }
};
const siglasExistUnit = async (siglas = "",{req}) => {
  const { id } = req.params;
  const existDB = await Unit.findOne({ where: { siglas } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`La unidad con sigla: ${siglas}, ya existe`);
  }
};
// =================================================================
// ========================== SUCURSAL =============================
const idExistSucursal = async (id = "") => {
  const idExist = await Sucursal.findByPk(id);
  if (!idExist) {
    throw new Error(`La sucursal con id: ${id}, no existe`);

  };
}
const nameExistSucursal = async (name = "",{req}) => {
  const { id } = req.params;
  const existDB = await Sucursal.findOne({ where: { name } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`La Sucursal con nombre: ${name}, ya existe`);
  }
};
// =================================================================
// ========================== CLIENT =============================
const idExistClient = async (id = "") => {
  const idExist = await Client.findByPk(id);
  if (!idExist) {
    throw new Error(`El cliente con id: ${id}, no existe`);
  };
}

const numberDocumentExistClient = async (number_document = "",{req}) => {
  const { id } = req.params;
  const existDB = await Client.findOne({ where: { number_document } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El cliente con numero de documento: ${number_document}, ya existe`);
  }
};
// =================================================================
// ========================== ALMACEN =============================
const idExistStorage = async (id = "") => {
  const idExist = await Storage.findByPk(id);
  if (!idExist) {
    throw new Error(`El almacén con id: ${id}, no existe`);
  };
}

const nameExistStorage = async (name = "",{req}) => {
  const { id_sucursal } = req.body;
  const { id } = req.params;
  const existDB = await Storage.findOne({ where: { name, id_sucursal } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El almacén con nombre: ${name}, ya existe en la sucursal`);
  }
};
// =================================================================
// ========================== PRODUCTO =============================
const idExistProduct = async (id = "") => {
  const idExist = await Product.findByPk(id);
  if (!idExist) {
    throw new Error(`El producto con id: ${id}, no existe`);
  };
}

const nameExistProduct = async (name = "",{req}) => {
  const { id } = req.params;
  const existDB = await Product.findOne({ where: { name } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El producto con nombre: ${name}, ya existe, Verifica tu almacén o otra sucursal`);
  }
};
const codeExistProduct = async (cod = "",{req}) => {
  const { id } = req.params;
  const existDB = await Product.findOne({ where: { cod } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El producto con código: ${cod}, ya existe`);
  }
};
// =================================================================
// ========================== TRASPORT COMPANY =============================
const idExistTrasportCompany = async (id = "") => {
  const idExist = await Trasport_company.findByPk(id);
  if (!idExist) {
    throw new Error(`La compañía de trasporte con id: ${id}, no existe`);
  };
}

const nameExistTrasportCompany = async (name = "",{req}) => {
  const { id } = req.params;
  const existDB = await Trasport_company.findOne({ where: { name } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`La compañía de trasporte con nombre: ${name}, ya existe`);
  }
};

const idExistChauffeur = async (id = "") => {
  const idExist = await Chauffeurs.findByPk(id);
  if (!idExist) {
    throw new Error(`El Chofer con id: ${id}, no existe`);
  };
}
// =================================================================
// ========================== CARGOTRUCK COMPANY =============================
const idExistCargoTruck = async (id = "") => {
  const idExist = await Cargo_truck.findByPk(id);
  if (!idExist) {
    throw new Error(`La camion con id: ${id}, no existe`);
  };
}
const placaExistTrasportCompany = async (placa = "",{req}) => {
  const { id } = req.params;
  const existDB = await Cargo_truck.findOne({ where: { placa, status: true } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El camion con placa: ${placa}, ya existe`);
  }
};
// ========================== CARGOTRUCK COMPANY =============================
const idExistProvider = async (id = "") => {
  const idExist = await Provider.findByPk(id);
  if (!idExist) {
    throw new Error(`El proveedor con id: ${id}, no existe`);
  };
}
const nameExistProvider = async (full_names = "",{req}) => {
  const { id } = req.params;
  const existDB = await Provider.findOne({ where: { full_names } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El proveedor con nombre: ${full_names}, ya existe`);
  }
};
// ========================== SCALA COMPANY =============================
const idExistScala = async (id = "") => {
  const idExist = await Scale.findByPk(id);
  if (!idExist) {
    throw new Error(`La balanza con id: ${id}, no existe`);
  };
}

const nameExistScala = async (name = "",{req}) => {
  const { id } = req.params;
  const existDB = await Scale.findOne({ where: { name } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El balanza con nombre: ${name}, ya existe`);
  }
};
// ========================== PRECIO =============================
const idExistPrice = async (id = "") => {
  const idExist = await Price.findByPk(id);
  if (!idExist) {
    throw new Error(`La precio con id: ${id}, no existe`);
  };
}

//=========================== SECTOR =============================
const idExistSector= async (id = "") => {
  const idExist = await Sector.findByPk(id);
  if (!idExist) {
    throw new Error(`El sector con id: ${id}, no existe`);
  }
};
const nameExistSector = async (name = "") => {
  const nameExist = await Sector.findOne({where: {name: name, status: true}});
  if (nameExist) {
    throw new Error(`El sector con nombre: ${name}, ya existe`);
  }
};

//=========================== BANCO =============================
const idExistBank = async (id = "") => {
  const idExist = await Bank.findByPk(id);
  if (!idExist) {
    throw new Error(`El banco con id: ${id}, no existe`);
  };
}
const nameExistBank = async (name = "",{req}) => {
  const { id } = req.params;
  const existDB = await Bank.findOne({ where: { name } });
  if(!existDB) return;
  if (existDB.id != id) {
    throw new Error(`El banco con nombre: ${name}, ya existe`);
  }
};

//=========================== INPUT =============================
const idExistInput = async (id = "") => {
  const idExist = await Input.findOne({where: {id,status:'ACTIVE'}});
  if (!idExist) {
    throw new Error(`La compra con id: ${id}, no existe o esta inactiva`);
  };
}

//=========================== OUTPUT =============================
const idExistOutput = async (id = "") => {
  const idExist = await Output.findOne({where: {id,status:'ACTIVE'}});
  if (!idExist) {
    throw new Error(`La venta con id: ${id}, no existe o esta inactiva`);
  };
}

//=========================== CLASSIFIED =============================
const idExistClassified = async (id = "") => {
  const idExist = await Classified.findOne({where: {id,status:'ACTIVE'}});
  if (!idExist) {
    throw new Error(`La clasificación con id: ${id}, no existe o esta inactiva`);
  };
}
//=========================== ACCOUNTS PAYABLE =============================
const idExistAccountPayable = async (id = "") => {
  const idExist = await AccountsPayable.findOne({where: {id,status:true}});
  if (!idExist) {
    throw new Error(`La cuenta por cobrar con id: ${id}, no existe o esta inactiva`);
  };
}
const idExistAbonoAccountPayable = async (id = "") => {
  const idExist = await AbonosAccountsPayable.findOne({where: {id,status:true}});
  if (!idExist) {
    throw new Error(`El abono con id: ${id}, no existe o esta inactiva`);
  };
}
//=========================== ACCOUNTS RECEIVABLE =============================
const idExistAccountReceivable = async (id = "") => {
  const idExist = await AccountsReceivable.findOne({where: {id,status:true}});
  if (!idExist) {
    throw new Error(`La cuenta por pagar con id: ${id}, no existe o esta inactiva`);
  };
}
const idExistAbonoAccountReceivable = async (id = "") => {
  const idExist = await AbonosAccountsReceivable.findOne({where: {id,status:true}});
  if (!idExist) {
    throw new Error(`El abono con id: ${id}, no existe o esta inactiva`);
  };
}

//=========================== TRANSFERS =============================
const idExistTransferPending = async (id = "") => {
  const idExist = await Transfers.findOne({where: {id,status:'PENDING'}});
  if (!idExist) {
    throw new Error(`El traslado con id: ${id}, no existe o esta recepcionado`);
  };
}
const idExistTransfer = async (id = "") => {
  const idExist = await Transfers.findOne({where: {id}});
  if (!idExist) {
    throw new Error(`El traslado con id: ${id}, no existe`);
  };
}

module.exports = {
  idExistUser,
  emailExistUser,
  number_documentExistUser,
  idExistCategory,
  nameExistCategory,
  idExistUnit,
  nameExistUnit,
  siglasExistUnit,
  idExistSucursal,
  nameExistSucursal,
  idExistClient,
  numberDocumentExistClient,
  idExistStorage,
  nameExistStorage,
  idExistProduct,
  nameExistProduct,
  codeExistProduct,
  idExistTrasportCompany,
  nameExistTrasportCompany,
  idExistChauffeur,
  idExistCargoTruck,
  placaExistTrasportCompany,
  idExistProvider,
  nameExistProvider,
  idExistScala,
  nameExistScala,
  idExistPrice,
  idExistSector,
  nameExistSector,
  idExistBank,
  idExistInput,
  nameExistBank,
  idExistOutput,
  idExistClassified,
  idExistAccountPayable,
  idExistAbonoAccountPayable,
  idExistAccountReceivable,
  idExistAbonoAccountReceivable,
  idExistTransfer,
  idExistTransferPending
};
