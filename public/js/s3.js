
'use strict';

const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('image-file');
const uploadButton = document.getElementById('upload-button');
const gallery = document.getElementById('image-gallery');
const message = document.getElementById('s3-message');
const refreshButton = document.getElementById('refresh-images');

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#fca5a5' : '#67e8f9';
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function createImageCard(image) {
  const card = document.createElement('article');
  card.className = 's3-image-card';

  const preview = document.createElement('img');
  preview.src = image.viewUrl;
  preview.alt = 'Imagen almacenada en Amazon S3';
  preview.loading = 'lazy';

  const info = document.createElement('div');
  info.className = 's3-image-info';

  const filename = document.createElement('p');
  filename.textContent = image.key.split('/').pop();

  const size = document.createElement('p');
  size.textContent = `Tamaño: ${formatSize(image.size)}`;

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'button button-secondary';
  deleteButton.textContent = 'Eliminar imagen';

  deleteButton.addEventListener('click', async () => {
    if (!confirm('¿Deseas eliminar esta imagen de Amazon S3?')) {
      return;
    }

    deleteButton.disabled = true;

    try {
      await TechStoreSession.request('/api/s3/images', {
        method: 'DELETE',
        body: { key: image.key },
      });

      showMessage('Imagen eliminada correctamente.');
      await loadImages();
    } catch (error) {
      showMessage(error.message, true);
      deleteButton.disabled = false;
    }
  });

  info.append(filename, size, deleteButton);
  card.append(preview, info);

  return card;
}

async function loadImages() {
  gallery.textContent = 'Cargando imágenes...';
  refreshButton.disabled = true;

  try {
    const images = await TechStoreSession.request('/api/s3/images');

    gallery.replaceChildren();

    if (!images.length) {
      gallery.textContent = 'Todavía no hay imágenes en la galería.';
      return;
    }

    images.forEach((image) => {
      gallery.appendChild(createImageCard(image));
    });
  } catch (error) {
    gallery.textContent = 'No se pudieron cargar las imágenes.';
    showMessage(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = fileInput.files[0];

  if (!file) {
    showMessage('Selecciona una imagen.', true);
    return;
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    showMessage('Solo se permiten imágenes JPG, PNG o WEBP.', true);
    return;
  }

  if (file.size <= 0 || file.size > MAX_SIZE) {
    showMessage('La imagen debe tener un máximo de 5 MB.', true);
    return;
  }

  uploadButton.disabled = true;
  showMessage('Generando URL segura para Amazon S3...');

  try {
    // 1. Solicitar URL prefirmada al backend
    const { uploadUrl } = await TechStoreSession.request(
      '/api/s3/upload-url',
      {
        method: 'POST',
        body: {
          contentType: file.type,
          size: file.size,
        },
      }
    );

    // 2. Subir directamente desde el navegador a S3
    showMessage('Subiendo imagen a Amazon S3...');

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(
        `Amazon S3 rechazó la subida (HTTP ${response.status}).`
      );
    }

    // 3. Actualizar la galería
    fileInput.value = '';
    showMessage('¡Imagen subida correctamente a Amazon S3!');
    await loadImages();

  } catch (error) {
    showMessage(error.message || 'Error al subir la imagen.', true);
  } finally {
    uploadButton.disabled = false;
  }
});

refreshButton.addEventListener('click', loadImages);

if (!TechStoreSession.token() || TechStoreSession.expired()) {
  window.location.replace('/login');
} else {
  TechStoreSession.watchExpiry();
  loadImages();
}
