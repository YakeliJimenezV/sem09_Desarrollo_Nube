

const path = require('node:path');
const express = require('express');

const pageRoutes = require('./routes/page.routes');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const inventoryRoutes = require('./routes/inventory.routes');

// Nuevas rutas para Amazon S3
const s3Routes = require('./routes/s3.routes');

const securityHeaders = require('./middlewares/securityHeaders');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

// Configuración de seguridad
app.disable('x-powered-by');
app.use(securityHeaders);

// Procesamiento de solicitudes
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// Archivos estáticos: CSS, JavaScript e imágenes
app.use(
  express.static(path.resolve(__dirname, '../public'), {
    index: false,
    dotfiles: 'deny',
  })
);

// Rutas originales de TechStore
app.use('/', pageRoutes);
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', inventoryRoutes);

// Nuevas rutas de Amazon S3
app.use('/api/s3', s3Routes);

// Manejo de errores
app.use(notFound);
app.use(errorHandler);

module.exports = app;
