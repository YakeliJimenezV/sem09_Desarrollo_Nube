
const {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('node:crypto');
const { s3, bucket } = require('../config/s3');

const PREFIX = 'originales/app/';
const MAX_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Generar URL prefirmada para subir imágenes (5 minutos)
async function createUploadUrl({ contentType, size }) {
  if (!Object.hasOwn(ALLOWED_TYPES, contentType)) {
    throw new Error('Solo se permiten imágenes JPG, PNG o WEBP.');
  }

  if (!Number.isInteger(size) || size <= 0 || size > MAX_SIZE) {
    throw new Error('La imagen debe tener un tamaño máximo de 5 MB.');
  }

  const key = `${PREFIX}${randomUUID()}.${ALLOWED_TYPES[contentType]}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: 300,
  });

  return { key, uploadUrl, expiresIn: 300 };
}

// Listar imágenes y generar URLs privadas de visualización (15 minutos)
async function listImages() {
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: PREFIX,
    MaxKeys: 100,
  }));

  return Promise.all((result.Contents || []).map(async (object) => {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: object.Key,
    });

    return {
      key: object.Key,
      size: object.Size,
      lastModified: object.LastModified,
      viewUrl: await getSignedUrl(s3, command, {
        expiresIn: 900,
      }),
    };
  }));
}

// Eliminar una imagen del directorio de la aplicación
async function deleteImage(key) {
  if (
    typeof key !== 'string' ||
    !new RegExp(`^originales/app/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(key)
  ) {
    throw new Error('La ruta de la imagen no es válida.');
  }

  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));

  return { message: 'Imagen eliminada correctamente.' };
}

module.exports = {
  createUploadUrl,
  listImages,
  deleteImage,
};
