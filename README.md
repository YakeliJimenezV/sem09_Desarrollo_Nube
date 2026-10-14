# Laboratorio 09 – Cloud Storage con Amazon S3 ☁️

## Descripción

Este proyecto corresponde al **Laboratorio N.º 09 del curso Desarrollo de Aplicaciones en la Nube**. Se reutilizó como base **TechStore**, una aplicación académica desarrollada durante la **Semana 08** para gestionar inventario, productos, tiendas y usuarios. Para la **Semana 09** se incorporó un módulo de almacenamiento privado de imágenes mediante **Amazon S3 y URLs prefirmadas**.

**Autora:** Yakeli Jiménez Villalobos  
**Repositorio:** https://github.com/YakeliJimenezV/sem09_Desarrollo_Nube

## Funcionalidades del Laboratorio 09

- Subida directa de imágenes desde el navegador a Amazon S3 mediante una URL prefirmada (`PUT`).
- Visualización de imágenes privadas mediante URLs prefirmadas (`GET`).
- Listado de imágenes almacenadas bajo `originales/app/`.
- Eliminación de imágenes desde la galería, de acuerdo con los permisos del usuario.
- Validación en frontend y backend de los formatos **JPG, PNG y WEBP** y del tamaño **declarado** máximo de **5 MB**.
- URLs prefirmadas de subida con vigencia de **5 minutos** y de visualización con vigencia de **15 minutos**.
- Bucket privado con bloqueo de acceso público, cifrado SSE-S3 y versionado.
- Endpoints protegidos mediante autenticación y autorización por roles.

> **Alcance de la validación:** el backend comprueba el tipo MIME y tamaño **declarados** antes de emitir la URL de subida. Todavía no inspecciona los bytes reales del archivo ni incorpora análisis antivirus, cuotas o *rate limiting*. Estas son mejoras de seguridad recomendadas.

## Tecnologías utilizadas

- **Backend:** Node.js, Express, AWS SDK for JavaScript v3, MongoDB y Mongoose.
- **Frontend:** HTML, CSS y JavaScript.
- **Seguridad:** JWT, MFA TOTP, control de acceso por roles y URLs prefirmadas.
- **Servicios AWS:** Amazon S3 y AWS IAM.
- **Control de versiones:** Git y GitHub.

## Arquitectura de la integración S3

```text
Navegador (TechStore /s3)
        |
        | POST /api/s3/upload-url (JWT, tipo y tamaño declarados)
        v
Backend Express -- AWS SDK --> Amazon S3 (firma la solicitud)
        |
        | URL prefirmada de subida (5 minutos)
        v
Navegador -------- PUT directo --------> Amazon S3

Navegador -- GET /api/s3/images --> Backend Express
        |                                |
        |                  Lista objetos y genera URLs GET
        |                         (15 minutos)
        v                                |
Visualización privada <-----------------+
```

El navegador **no necesita recibir claves de acceso AWS**. Las operaciones de subida y visualización utilizan URLs prefirmadas temporales.

## Rutas del módulo S3

| Método | Ruta | Función |
|---|---|---|
| GET | `/s3` | Interfaz de la galería de imágenes |
| POST | `/api/s3/upload-url` | Solicita una URL prefirmada para subir una imagen |
| GET | `/api/s3/images` | Lista imágenes y genera URLs privadas de visualización |
| DELETE | `/api/s3/images` | Elimina una imagen del prefijo autorizado |

Las rutas de la API requieren autenticación. La subida y eliminación requieren permisos de **GERENTE** o **ADMIN**; la consulta también está habilitada para **EMPLEADO** y **AUDITOR**.

## Instalación local

### Requisitos

- Node.js 22 o superior y npm.
- MongoDB disponible localmente.
- Cuenta AWS con un bucket S3 y permisos IAM adecuados.
- AWS CLI con un perfil local configurado para desarrollo.

### Pasos

Clonar el repositorio e instalar dependencias:

```bash
git clone https://github.com/YakeliJimenezV/sem09_Desarrollo_Nube.git
cd sem09_Desarrollo_Nube
npm install
```

Crear un archivo `.env` en la raíz del proyecto, tomando `.env.example` como referencia **si está disponible**, y configurar los valores del entorno local:

```dotenv
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/techstore_s3
NODE_ENV=development
JWT_SECRET=REEMPLAZAR_CON_SECRETO_ALEATORIO
JWT_EXPIRES_IN=1h
LOGIN_LOCK_MINUTES=15
TOTP_ENCRYPTION_KEY=REEMPLAZAR_CON_CLAVE_BASE64
AWS_REGION=us-east-1
AWS_S3_BUCKET=lab-09-jimenez-20261014
AWS_PROFILE=app-user
```

La aplicación base también contempla la configuración opcional de Google y GitHub OAuth. Para utilizarlos, es necesario definir las variables correspondientes.

> **Seguridad:** no publicar `.env`, credenciales AWS, contraseñas, secretos TOTP, bases de datos locales ni `node_modules` en GitHub. El perfil `app-user` debe existir en la configuración local de AWS CLI. El bucket utilizado durante el laboratorio puede eliminarse al finalizar las pruebas para evitar costos.

Iniciar la aplicación:

```bash
npm run dev
```

Abrir `http://localhost:3001`, iniciar sesión y acceder a `http://localhost:3001/s3`.

## Pruebas realizadas

| Prueba | Resultado |
|---|---|
| Subida de imagen JPG desde la galería | Correcta |
| Visualización privada de imagen almacenada en S3 | Correcta |
| Eliminación de imagen desde la galería | Correcta |
| Rechazo de PDF desde el formulario | Correcto |
| Rechazo de imagen mayor de 5 MB desde el formulario | Correcto |
| Rechazo de tamaño declarado de 10 MB directamente en el servicio backend | Correcto |
| URL de subida configurada a 300 segundos (5 minutos) | Correcto |
| Subida directa mediante `PUT` a S3 con respuesta HTTP `200` en Network | Correcto |
| Búsqueda de nombres de variables de claves AWS en JS/HTML revisados | Sin coincidencias |
| Expiración real de una URL GET después de 16 minutos | **Pendiente de registrar evidencia** |

La validación de 10 MB realizada directamente en el servicio demuestra que se rechaza el **tamaño declarado**; no constituye una verificación del tamaño real de los bytes subidos a S3.

## Configuración y seguridad del bucket

Durante las pruebas se utilizó el bucket privado `lab-09-jimenez-20261014`, en la región `us-east-1`, con las siguientes características:

- Bloqueo de acceso público.
- Versionado habilitado.
- Cifrado del lado del servidor **SSE-S3**.
- Política para rechazar solicitudes sin HTTPS.
- CORS configurado para el origen local `http://localhost:3001`.
- Prefijos `originales/`, `miniaturas/` y `temporal/`.

También se practicó la recuperación de versiones de objetos. Se **diseñó** una regla de ciclo de vida para `originales/`, pero **no se guardó ni activó** durante las pruebas.

## Buenas prácticas y mejoras futuras

- Validar el formato real del archivo mediante *magic bytes*.
- Comprobar el tamaño real de los objetos recibidos en S3.
- Implementar análisis antivirus y cuarentena antes de habilitar archivos.
- Incorporar *rate limiting* y cuotas de almacenamiento por usuario.
- Usar **IAM Roles** cuando la aplicación se despliegue en EC2, en lugar de claves permanentes.
- Configurar registros y monitoreo con servicios AWS.
- Aplicar permisos mínimos y mantener las URLs prefirmadas con duración limitada.

## Procedencia del proyecto

La gestión de inventario, productos, tiendas, usuarios, reportes, autenticación JWT, MFA y OAuth pertenece a TechStore, aplicación desarrollada en la Semana 08 del curso.

El trabajo específico del **Laboratorio 09** consistió en adaptar esa aplicación para integrar Amazon S3 y desarrollar el módulo de galería y almacenamiento privado de imágenes, junto con sus validaciones y pruebas de funcionamiento.

## Autora
**Yakeli Jiménez Villalobos**