# Aprende — prototipo vertical privado

Versión 0.2. Producto principal PWA; nombre provisional. Código estático modular HTML/CSS/JavaScript sin dependencias runtime externas. Las especificaciones completas prevén evolución a React/TypeScript si aporta valor; este corte ligero verifica el flujo local sin provisionar Firebase.

## Funcionalidad real
- Perfiles ficticios Luna y Leo; actividad y resultados independientes por perfil local.
- Seis actividades: selección, completar, asociación, lectura acompañada, trazo guiado O y práctica libre M.
- Scoring discreto selección/lectura; asociación documentada; estimación de trazo experimental. Escritura libre sin nota.
- Fotos JPG/PNG/WebP múltiples guardadas solo en IndexedDB; editor manual, validación de opciones, revisión obligatoria y asignación a perfiles.
- IndexedDB con transacción conjunta de intento terminado y outbox. No se realiza sincronización remota ni se marca un ACK falso.
- Service worker con paquetes versionados por hash de contenido; verificación SHA-256 de todos los recursos, caché inmutable por generación y publicación de puntero tras verificación.
- Sonido local de celebración WAV; configuración de sonido/movimiento y exportación JSON de resultados.

## Límites visibles
No Firebase/Auth/Storage/IA provisionados, no cuentas reales ni aislamiento multi-familia productivo, sin informes narrativos simulados. La cola permanece awaiting_backend. No introduce datos reales de menores.

Las seis consignas sintéticas incluyen audio MP3 español latinoamericano generado localmente con eSpeak-NG. Hay 13 clips de consignas, palabras y refuerzo (aprox. 544 KB), incluidos en el manifiesto verificado. El sintetizador NO se envía al navegador; solo los audios. Voz básica sintética, revisión perceptual con adultos/niños pendiente; no prometer naturalidad o calidad pedagógica certificada. Las tareas manuales pueden adjuntar audio MP3/WAV local; sin audio recurren a voz del navegador sin garantía offline. No se enviaron textos a una API ni se usaron datos reales.

Generación reproducible: `node scripts/render-spanish-audio.mjs /ruta/absoluta/espeak-ng.js`, usando @echogarden/espeak-ng-emscripten@0.3.5 instalado desde npm en carpeta de herramientas externa; ffmpeg codifica MP3. Consultar catálogo de textos en dist/assets/audio/catalog.json. La distribución del motor está sujeta a su licencia GPL-3.0; no se distribuye motor, modelos ni código de sintetizador con este Site.

Se conservan intentos terminados. Borrador de trazos/actividad no terminada no se recupera tras salir o recargar. El tiempo registrado es ventana de actividad visible, no tiempo de atención, y se denomina visibleDurationMs. Se conserva compatibilidad con activeDurationMs de registros antiguos; ese nombre legado tampoco demuestra atención. Scoring no validado pedagógicamente y hardware Fire7/iOS/S Pen no probado.

## Desarrollo y comprobaciones
```
node --test tests/*.test.mjs
node --check dist/app.js
node --check dist/sw.js
node scripts/build-manifest.mjs
```
Servir dist/ mediante HTTPS u origen localhost confiable. La comprobación offline debe hacerse en el navegador real: preparar descarga, confirmar verificación, cerrar/reabrir en modo avión, completar actividades, verificar persistencia. No concluir funcionamiento offline solo por éxito de tests Node o hash.

## Seguridad del prototipo
Fuente y opciones entran como texto escapado; no ejecutar contenido fotografiado. Límite imagen 5MB y hasta 20 por selección. Sin claves API ni Firebase públicas inventadas. Private Sites restringe acceso del sitio al propietario; esto no convierte almacenamiento del navegador en almacenamiento cifrado ni en un sistema de cuentas infantiles.

## Próximas puertas de aceptación
Validación perceptual de audios; borradores recuperables; pruebas físicas Fire7/iOS; reglas multi-familia y backend idempotente real; Firebase cuenta/región/edición/facturación aprobados; IA segura con proveedor y consentimiento definidos; corpus de trazos validado con autorización.
