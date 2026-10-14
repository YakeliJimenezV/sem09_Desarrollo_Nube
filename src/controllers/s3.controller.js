
const s3Service = require('../services/s3.service');

async function uploadUrl(req, res) {
  try {
    const result = await s3Service.createUploadUrl(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function images(req, res) {
  try {
    const result = await s3Service.listImages();
    res.json(result);
  } catch (error) {
    console.error('Error al listar imágenes S3:', error);
    res.status(500).json({ message: 'No se pudieron listar las imágenes.' });
  }
}

async function removeImage(req, res) {
  try {
    const result = await s3Service.deleteImage(req.body.key);
    res.json(result);
  } catch (error) {
    console.error('Error al eliminar imagen S3:', error);
    res.status(400).json({ message: 'No se pudo eliminar la imagen.' });
  }
}

module.exports = { uploadUrl, images, removeImage };
