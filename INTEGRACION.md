# Fotos y prácticas familiares

Actualización: carga múltiple de hasta 10 fotos, con validación individual y continuación cuando una foto falla. Cada foto se registra por separado en D1/R2 y se envía como imagen de referencia en su propia solicitud a OpenAI. Se identifican hasta 20 ejercicios compatibles por foto. El resumen para padres muestra foto, consignas, opciones y respuestas; permite corregir individualmente o confirmar los borradores de una foto para asignarlos juntos. La confirmación comprueba propietario, perfil, lista exacta y revisiones, y actualiza las prácticas de esa foto en una sola operación atómica. La foto de origen se conserva mientras tenga ejercicios asociados. Los borradores persisten antes de aprobar; el niño solo recibe prácticas confirmadas. La falta de clave continúa mostrándose como análisis pendiente, sin simular resultados.

El Site también incluye descarga directa de la APK 0.4.0 y compartir enlace mediante el menú del dispositivo, portapapeles o copia manual.

Estado al 11 de octubre de 2026: backend implementado y base D1 local creada. La generación real con OpenAI y la publicación de esta versión están pendientes de una clave utilizable. No se afirma conexión activa con OpenAI ni base de datos de producción provisionada.

## Arquitectura y continuidad

El mismo Site conserva su identificador. Se añadió el servidor oficial Vite/Vinext + React + TypeScript de Sites; la interfaz educativa modular existente se reutiliza. `public/` pasa a ser la fuente editable de sus archivos, audios y recursos. `dist/` es ahora salida de build descartable y no debe editarse. No borrar `public/`.

`.openai/hosting.json` declara D1 `DB` y R2 `BUCKET`. Sites los provisionará durante una publicación satisfactoria. No se ha publicado esta integración. Local y producción usan bases separadas. Las migraciones están en `drizzle/`; no se crea esquema durante una petición.

- `server/backend.mjs`: permisos, fotos, borradores, aprobación, perfiles, acceso del niño y resultados.
- `server/practice.mjs`: validación y llamada servidor a Responses API con imagen y Structured Outputs.
- `public/cloud.js`: formularios, cámara, subida, revisión y asignación.
- `app/api/[...path]/route.ts`: autenticación confiable de Sites y conexión con el backend.
- `db/schema.ts`: siete tablas, índices y migración generada por Drizzle.

## Flujo disponible

1. El padre entra con ChatGPT (en desarrollo es una identidad simulada de Sites).
2. Crea el perfil con un apodo.
3. Toma/sube una foto y confirma su envío. El navegador reduce la imagen y elimina sus metadatos originales; R2 guarda una copia privada.
4. El servidor envía la página a OpenAI. Solo genera ejercicios de selección compatibles con el motor actual, hasta cinco por petición; no fabrica datos si la página es ilegible.
5. Guarda borradores en D1. El padre revisa/corrige opciones y respuesta y asigna a un perfil.
6. El niño entra con su enlace privado, válido por siete días y revocable. El servidor permite únicamente prácticas aprobadas para ese perfil.
7. La respuesta se valida y puntúa en el servidor. El identificador del intento evita duplicados. Solo se muestra confirmación tras el ACK real.

Las prácticas familiares requieren conexión; no se copian a la IndexedDB compartida del prototipo. Los ejemplos y sus audios siguen disponibles offline. Las consignas familiares sin audio adjunto usan la voz del navegador, cuya naturalidad depende del dispositivo; no se ha integrado TTS de OpenAI para ellas.

## Seguridad

Todas las consultas de datos privados incluyen el propietario autenticado. La sesión del niño usa un token aleatorio de 256 bits, guardado como hash en D1 y cookie HttpOnly/SameSite; el token se elimina del fragmento URL tras entrar. No compartir ese enlace públicamente. Generar otro enlace o retirar acceso invalida el anterior.

El backend exige origen coincidente y cabecera propia para mutaciones. Comprueba firma/formato/tamaño de las imágenes, pertenencia de perfiles, versión del borrador, aprobación explícita y asignación de cada intento. Fotos y API llevan `no-store` y el service worker excluye API y rutas de autenticación. Límite inicial: 100 fotos por familia, 20 solicitudes de generación al día y cinco ejercicios por generación. No es un sistema de facturación ni sustituye límites de gasto de OpenAI.

La clave solo debe existir en `.env.local` para desarrollo y como secreto de Sites en producción. `.env*`, `.dev.vars*`, `.tools/` y estados de Wrangler están ignorados. Nunca usar `VITE_OPENAI_API_KEY`. `store:false` evita persistir la respuesta como objeto de Responses; no equivale a una garantía general de retención cero.

## Clave pendiente

OpenAI Platform confirmó la creación de `BalmerAprende` en `Balmer Business Solutions / Default project`, pero el entorno descartó el archivo temporal de descifrado antes del guardado. No se obtuvo una clave utilizable ni se escribió `.env.local`. La revisión automática rechazó crear otra por el riesgo de credenciales duplicadas. Se necesita autorización explícita para una nueva creación; se preparó un directorio de cifrado persistente ignorado en `.tools/key-setup` para evitar repetir el fallo. La clave inaccesible debe retirarse desde OpenAI Platform. No se muestran secretos en registros o documentación.

## Ejecutar y validar

```powershell
node scripts/run-framework.mjs dev --port 4180 --hostname 127.0.0.1
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/build-manifest.mjs
node scripts/run-framework.mjs build
```

La base local ya recibió `drizzle/0000_glorious_karen_page.sql`. No volver a aplicar esa migración a esta base. Para una base nueva, compilar primero y ejecutar Wrangler D1 local con `dist/server/wrangler.json`, persistiendo en `.wrangler/state`.

Verificado: build, TypeScript, 24 pruebas Node (incluidas integración contra SQLite real con transporte OpenAI simulado), sesión local de Sites, creación de perfil en D1 desde navegador y recarga de los datos. Las pruebas comprueban familias separadas, fotos ajenas, rechazo de asignaciones cruzadas, borrador invisible para niño, aprobación obligatoria, revisión obsoleta, intentos idempotentes y revocación de acceso. Queda pendiente generación real, cuota de OpenAI, prueba física de cámara, TTS de consignas generadas y despliegue. El perfil `Prueba local` es un registro ficticio de validación, únicamente en desarrollo.

## Documentación consultada

- https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- Skill Sites: almacenamiento D1/R2, identidad, secretos y migración de estático a Worker.
