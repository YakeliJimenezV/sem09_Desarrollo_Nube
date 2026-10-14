# TechStore · Informe de verificación final

Fecha: 7 de octubre de 2026. Entorno: Windows, Node.js 22.20.0, MongoDB existente y Chrome headless.

## Resultado

- `npm.cmd run check`: 50 archivos JavaScript, JSON y recursos HTML válidos.
- `npm.cmd run verify:final`: 155 comprobaciones satisfactorias, con HTTP real, MongoDB y Chrome.
- `npm.cmd audit --omit=dev`: 0 vulnerabilidades reportadas por npm.
- Arranque real de `src/server.js` en un puerto libre: HTTP 200 en readiness, login, registro, ambas pantallas MFA e inventario.
- `npm.cmd run seed:demo`: primera ejecución 5 insertados; segunda 0 insertados y 5 existentes. Las posteriores conservan SKUs y timestamps.
- Documentos anteriores de users/stores/products y contenido completo de `.env` comparados antes/después y conservados exactamente.
- No se reinició MongoDB ni se eliminaron usuarios/tiendas/inventario existentes. No se ejecutó setup nuevamente ni se cambiaron credenciales.
- Los temporales de pruebas interrumpidas/fallidas se retiraron por identificación propia; la limpieza final verifica que no quede ningún registro creado por esa ejecución.

## Qué se comprobó

Registro exclusivamente EMPLEADO, validación de campos, email único, bcrypt, rechazo de registro como ADMIN, JWT/firma/expiración, ausencia de JWT antes de MFA y rechazo de tokens de la etapa anterior sin evidencia MFA.

Contraseña: cinco fallos, bloqueo, rechazo durante bloqueo y cinco fallos concurrentes. Se simuló el vencimiento modificando únicamente la fecha de una cuenta temporal; se verificó el reinicio de fallos y recuperación por el backend.

TOTP: secretos individuales, cifrado AES-256-GCM y rechazo de alteraciones, URI estándar/PNG QR, seis dígitos/30 segundos, mostrar QR sin activar MFA, activación solo con código válido, máximo tres errores, expiración, replay rechazado, QR inaccesible después de configuración/consumo y ninguna exposición de secretos en JWT, /me o usuarios.

Roles: ADMIN crea/edita/precio/stock/elimina y administra tiendas; GERENTE crea/edita/stock propio y recibe 403 para recursos/reportes ajenos; EMPLEADO consulta/stock propio y recibe 403 para precio/tienda/creación/eliminación; AUDITOR consulta/reportes y recibe 403 para todas las modificaciones implementadas. Se probó cambio de rol, revocación, ObjectId y validaciones.

UI: ADMIN/GERENTE ven Nuevo producto grande; EMPLEADO/AUDITOR no. Creación/edición/eliminación visual persistidas en MongoDB y stock visual de EMPLEADO. Encabezados grandes/oscuros/negrita, sidebar sin scroll horizontal y tablas en 1366×768. También Usuarios, Roles, Tiendas, Reportes y Mi cuenta. Responsive 390/320px y navegación móvil accesible. Sin excepciones JavaScript ni recursos ausentes en estos flujos.

Flujos reales en navegador: login → setup/QR → TOTP → JWT → dashboard; logout → login → TOTP sin QR → JWT → dashboard. El registro previo se ejecutó mediante la API real, sin credenciales predeterminadas. Las cuentas/claves de prueba existieron solo durante la verificación.

OAuth: configuración ausente manejada; Google/GitHub con respuestas externas simuladas verificaron PKCE, cookie/estado, consumo único, identidad verificada, conservación de password y MFA inicial/posterior obligatorio. **No se probaron cuentas reales de los proveedores**.

## Configuración/manual pendiente

- Agregar `TOTP_ENCRYPTION_KEY` a tu `.env`: 32 bytes aleatorios en base64. El archivo actual se dejó intacto y no contiene todavía esta clave. Sin ella el servidor inicia, pero el login devuelve 503 y no concede JWT.
- Configurar los Client ID/Secret/callback reales de Google y GitHub. Reiniciar solamente TechStore después de agregar variables.
- Probar el escaneo físico con el celular y los accesos sociales reales. URI/PNG/TOTP/UI fueron comprobados; la cámara de un celular y autorización real del proveedor requieren tu intervención.
- No hay desactivación/reset de MFA ni códigos de recuperación; son opcionales y no se implementaron. No hay MFA por correo/Nodemailer.
- Se conserva sessionStorage por arquitectura; riesgo XSS y endurecimiento futuro documentados en AUTHENTICATION.md.

## Archivos modificados

Configuración y documentación: `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `README.md`, `docs/AUTHENTICATION.md`.

Backend:

```text
src/config/env.js
src/controllers/inventory.controller.js
src/controllers/page.controller.js
src/middlewares/authenticate.js
src/middlewares/errorHandler.js
src/middlewares/securityHeaders.js
src/models/User.js
src/models/index.js
src/routes/auth.routes.js
src/routes/inventory.routes.js
src/routes/page.routes.js
src/services/auth.service.js
src/services/inventory.service.js
src/services/token.service.js
```

Frontend:

```text
public/js/app.js
public/js/auth.js
public/js/dashboard.js
public/js/session.js
views/index.html
views/login.html
views/register.html
views/dashboard.html
```

## Archivos nuevos

```text
src/models/AuthChallenge.js
src/models/OAuthState.js
src/controllers/mfa.controller.js
src/controllers/oauth.controller.js
src/services/encryption.service.js
src/services/mfa.service.js
src/services/oauth.service.js
src/services/demo.service.js
public/css/legibility.css
public/js/mfa.js
views/mfa.html
scripts/seed-demo.js
scripts/verify-final.js
scripts/verify-browser.js
docs/VERIFICATION.md
```

Dependencias nuevas: `otplib@13.5.0` y `qrcode@1.5.4`. OAuth utiliza fetch y crypto de Node, sin dependencias de sesión adicionales.

Artefactos ignorados: `.verification/final-results.log`, `.verification/inventory-desktop.png` y perfiles Chrome de pruebas. No se captura el QR. La captura corresponde a registros temporales ya retirados, no a los valores finales del inventario.
