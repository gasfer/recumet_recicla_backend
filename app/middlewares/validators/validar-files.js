const { response } = require("express");
const { checkSchema } = require("express-validator");
const { idExistProduct } = require("./database");

const filesExist = (req, res = response, next) => {
  if (!req.files || Object.keys(req.files).length == 0) {
    return res.status(422).json({
      ok: false,
      errors: [{ msg: `No se envió ningún archivo adjunto` }],
    });
  }
  req.keyFile = Object.keys(req.files)[0];
  req.file = Object.values(req.files)[0];
  next();
}

const filesValidateSize = (req, res = response, next) => {
  let file = Object.values(req.files)[0];
  /* This is a validation to check if the size of the image is greater than 8MB. */
  if (file.size > 8033987) {
    return res.status(422).json({
      ok: false,
      errors: [{ msg: `El peso de la imagen no puede ser mayor a 8MB` }],
    })
  }
  next();
}

const validateCollection = async (type) => {
  const valid_types = ['products'];
  if (!valid_types.includes(type)) {
    throw new Error(
      `La colección tiene que ser una de los siguientes: '${valid_types}'`
    );
  }
};

const validateUploadIdProduct = [
  checkSchema({
    idProduct: {
      isEmpty: {
        negated: true,
        errorMessage: "El identificador es obligatorio",
      },
      isInt: true,
      custom: {
        options: idExistProduct,
      },
    },
  }),
];

const validateShowFile = [
  checkSchema({
    type: {
      in: ["params"],
      isEmpty: {
        negated: true,
        errorMessage: "La colección del archivo es obligatoria",
      },
      custom: {
        options: validateCollection,
      },
    },
    name: {
      in: ["params"],
      isEmpty: {
        negated: true,
        errorMessage: "El nombre del archivo es obligatorio",
      },
      isString: true,
    },
  }),
];

module.exports = {
  filesExist,
  validateUploadIdProduct,
  validateShowFile,
  filesValidateSize
}