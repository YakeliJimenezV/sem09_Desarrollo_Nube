# TechStore · Seguridad final

Se conserva la portada original. El dashboard consume MongoDB y no presenta el catálogo ilustrativo como datos reales.

## Contraseña y bloqueo

Registro exclusivamente EMPLEADO con tienda activa y campos validados. Password mínimo 8 caracteres, mayúscula A–Z, número, especial no alfanumérico/no espacio y máximo 72 bytes UTF-8. User.create()/save() ejecutan bcrypt (12 rondas). No cambies passwords con updateOne/findOneAndUpdate/insertMany: no ejecutan el hook.

Cinco fallos atómicos de contraseña fijan lockUntil. LOGIN_LOCK_MINUTES configura el bloqueo (15 por defecto). Al vencer, un fallo comienza en 1; contraseña correcta reinicia ambos campos. Email inexistente, password incorrecto y bloqueo comparten mensaje seguro HTTP 401. Se ejecuta bcrypt también para usuarios inexistentes con un hash ficticio aleatorio en memoria.

## Desafíos MFA

verifyCredentials() comprueba credenciales y completeLogin() inicia el desafío, **no genera JWT**. OAuth inicia el mismo desafío.

challengeToken: 32 bytes aleatorios en base64url. MongoDB conserva únicamente SHA-256, usuario, versión de sesión, tipo setup/verify, contador, expiración, consumo y processing. No es JWT ni autoriza inventario. Duración cinco minutos; Authorization: MFA CHALLENGE. No se acepta un ID de usuario del cliente.

El índice TTL limpia desafíos expirados, pero la API siempre comprueba la fecha aunque todavía existan. Máximo tres códigos incorrectos por desafío; el tercero exige un nuevo login. processing se adquiere atómicamente para serializar verificaciones; consumed impide emitir dos JWT con el mismo desafío. Un código que no tenga exactamente seis dígitos recibe 422 sin efectuar verificación TOTP.

Mostrar QR no activa MFA. El secreto pendiente se cifra en el desafío y solo pasa al usuario después de un TOTP válido. Un setup simultáneo, QR anterior a logout/cambio de rol o desafío de otro usuario no puede reemplazar MFA activo ni configurar otra cuenta.

## TOTP y AES-GCM

otplib genera secreto individual aleatorio de 160 bits y URI otpauth://totp/ con emisor TechStore. SHA-1 estándar TOTP para compatibilidad, seis dígitos, 30 segundos. qrcode genera PNG de 320px, mostrado a 280px.

Se verifica período actual y anterior, no futuro (epochTolerance [30,0]). mfaLastStep y afterTimeStep, junto a escritura condicional, impiden reutilizar códigos. Tras logout durante el mismo período espera el código siguiente. Hora automática en celular/servidor.

TOTP_ENCRYPTION_KEY: base64 canónico de exactamente 32 bytes. AES-256-GCM de node:crypto, nonce aleatorio de 12 bytes, tag de 16 bytes y AAD techstore:totp:v1. Formato:

```text
v1.<nonce base64>.<tag base64>.<ciphertext base64>
```

Primitivas estándar, nunca TOTP/criptografía manual. Clave ausente: 503 sin JWT. La clave debe respaldarse y permanecer estable; cambiarla sin migración hace ilegibles los secretos existentes.

mfaSecretEncrypted, mfaLastStep, password e IDs privados de proveedores tienen select:false y se eliminan de User.toJSON(). DTO público: nombre/email/rol/tienda/estado/mfaEnabled. No hay secretos en /me, usuarios, JWT o logs.

El QR solo se entrega con desafío setup vigente; se descarga con autorización y se muestra mediante blob temporal, revocado al confirmar/salir. No hay MFA por correo, Nodemailer, bypass, recuperación ni endpoint de desactivación. Perder el autenticador requiere diseñar posteriormente recuperación administrativa segura.

## JWT y sessionStorage

HS256, issuer techstore, audience techstore-web; sub, role, store, ver, mfa:true y claims estándar. JWT_EXPIRES_IN por defecto 1h, máximo siete días. Solo la confirmación TOTP lo emite; nunca incluye código/secreto/password/nombre/email.

authenticate comprueba firma, algoritmo, expiración, claims, versión y estado actual de MongoDB. Exige mfaEnabled y mfa:true: tokens anteriores no omiten MFA. Usuarios inactivos o tiendas inactivas para GERENTE/EMPLEADO no acceden. Logout/cambio de rol o tienda revocan todas las sesiones anteriores incrementando tokenVersion.

JWT definitivo en sessionStorage. Desafío en clave distinta, eliminado al confirmar/salir. Bearer para API privadas. No localStorage ni JWT/desafíos en URLs. 401 limpia sesión/redirige; 403 informa denegación sin conceder acceso.

Los HTML privados son shells sin datos personales: /me se valida antes de mostrarlos y todas las API aplican seguridad en servidor. textContent, CSP sin scripts inline, nosniff, no-referrer, frames bloqueados y blob permitido únicamente para imágenes.

Riesgo: una XSS podría extraer datos de sessionStorage. Endurecimiento futuro: cookies HttpOnly/Secure/SameSite para sesión, CSRF, refresh tokens y límites distribuidos. Si logout no alcanza servidor, solo puede garantizarse limpieza local.

## OAuth

Authorization Code, PKCE S256, estado aleatorio ligado a cookie HttpOnly SameSite=Lax por proveedor, validación MongoDB y consumo único. Secure en producción. Callback HTTPS; HTTP solo localhost/127.0.0.1 en desarrollo. Variables reales en .env, nunca devueltas al cliente.

fetch de Node con timeout. Google HTTPS userinfo exige email_verified; GitHub /user y /user/emails exigen email verificado. Primero debe existir una cuenta TechStore con ese email y tienda. Se vincula ID único del proveedor conservando password, email, rol y tienda. No se crean usuarios sin tienda ni roles privilegiados.

Callback coloca cookie HttpOnly temporal para traspaso a MFA. /oauth/handoff la lee/elimina; JWT nunca aparece en URL/cookie OAuth. Repetir la cookie podría recuperar el mismo desafío vigente, pero no crea otro ni permite saltarse TOTP; desafío de consumo único. Tokens del proveedor solo existen transitoriamente en memoria, no se almacenan.

Google OAuth no es Google Authenticator. Configuración y pasos de proveedores en README.

## RBAC

ADMIN global. GERENTE productos/reportes de su tienda; eliminación propia conserva política existente. EMPLEADO consulta/stock de su tienda, sin precios/creación/eliminación. AUDITOR lectura global/reportes, ninguna modificación.

Roles en middleware; filtros de tienda también en la propia escritura. Recurso ajeno explícito: 403; inexistente:404. ObjectId/entradas/SKU/precios/stock/estado/tiendas validados. EMPLEADO enviando price u otro campo al endpoint stock:403. Índices únicos de email/SKU. ADMIN no puede quitarse a sí mismo su rol.

Role.permissions permanece como metadato; matriz efectiva en middleware/servicios. La UI refleja permisos pero no los sustituye.

## Límites y pruebas

Límites por IP en memoria por 15 minutos: 60 logins, 20 registros, 60 verificaciones y 30 inicios OAuth. Para varias instancias deben compartirse. Producción requiere HTTPS y respaldos seguros.

npm.cmd run check comprueba sintaxis/recursos. npm.cmd run verify:final ejecuta HTTP, MongoDB y Chrome sobre registros temporales; comprueba hashing, JWT, bloqueo, TOTP/QR/intentos/replay, permisos de cuatro roles, aislamiento, CRUD visual y seed. Limpia solo sus IDs y confirma conservación exacta de documentos anteriores/.env.

OAuth usa respuestas simuladas: no prueba proveedores/cuentas reales. Escaneo físico y OAuth real requieren credenciales/configuración externa y prueba manual.

Referencias: [otplib](https://otplib.yeojz.dev/guide/getting-started.html), [OAuth Google](https://developers.google.com/identity/protocols/oauth2/web-server), [OAuth/PKCE GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
