# Balmer Aprende — desarrollo conectado

La versión local actual añade servidor Vite/Vinext, React y TypeScript, D1 para prácticas y R2 para fotos. Consulta [INTEGRACION.md](INTEGRACION.md) para el estado verificado, los comandos actuales y la clave de OpenAI pendiente. La fuente editable de la interfaz está ahora en `public/`; `dist/` es salida de build.

Vista local: http://127.0.0.1:4180/ · `node scripts/run-framework.mjs dev --port 4180 --hostname 127.0.0.1`.

## Referencia histórica del prototipo 0.3

Versión 0.3 (ajuste responsive). Producto principal PWA; nombre provisional. Código estático modular HTML/CSS/JavaScript sin dependencias runtime externas. Las especificaciones completas prevén evolución a React/TypeScript si aporta valor; este corte ligero verifica el flujo local sin provisionar Firebase.

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

Las seis consignas incluyen audio MP3 con voz neural Dalia (español de México), a ritmo tranquilo (-8%). Hay 13 clips de consignas, palabras y refuerzo, incluidos en el manifiesto verificado para reproducción offline. Se generaron mediante el servicio de voz de Microsoft usando edge-tts; solo se enviaron los textos de ejemplo del catálogo, sin datos personales. El navegador reproduce los MP3 y no llama a ese servicio. La voz sigue siendo sintética; revisión perceptual con adultos/niños pendiente. Las tareas manuales pueden adjuntar audio MP3/WAV local; sin audio recurren a voz del navegador sin garantía offline ni de naturalidad.

Generación reproducible en Windows: crear `python -m venv .tools/voice`, instalar con `.tools/voice/Scripts/python.exe -m pip install edge-tts==7.2.8 mutagen==1.48.1` y ejecutar `.tools/voice/Scripts/python.exe scripts/render-natural-audio.py`. Requiere internet solo para generar. Después ejecutar `node scripts/build-manifest.mjs`. Consultar textos y procedencia en `dist/assets/audio/catalog.json`. El antiguo `render-spanish-audio.mjs` usa eSpeak y reemplazaría la voz natural: queda como referencia histórica, no usar para regenerar la versión actual. Si existe un paquete offline anterior, volver a preparar la descarga para actualizar sus audios; no borrar IndexedDB.

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
Fuente y opciones entran como texto escapado; no ejecutar contenido fotografiado. Límite imagen 5MB y hasta 20 por selección. Sin claves API ni Firebase públicas inventadas. El acceso del Site depende de su configuración de compartir. A 11 de octubre de 2026, la configuración consultada es pública y se conserva al actualizar. Los datos introducidos siguen guardándose solo en cada navegador: no hay cuentas infantiles ni aislamiento multi-familia de producción, y el almacenamiento local no es una caja fuerte cifrada.

## Próximas puertas de aceptación
Validación perceptual de audios; borradores recuperables; pruebas físicas Fire7/iOS; reglas multi-familia y backend idempotente real; Firebase cuenta/región/edición/facturación aprobados; IA segura con proveedor y consentimiento definidos; corpus de trazos validado con autorización.

## Ajuste responsive 0.3

Modo práctica independiente: viewport dinámico, cabecera compacta, contenido flexible y barra inferior con fila propia. Reiniciar/Terminé e Intentar de nuevo/Otra actividad no dependen de desplazar la página. En horizontal las instrucciones y el ejercicio comparten dos columnas; en vertical se apilan. Se respetan safe areas y la altura visual disponible. El lienzo mantiene buffer600×500 y coordenadas normalizadas al girar; no se reinicia el ejercicio por resize. Un trazo activo se interrumpe conservando lo dibujado, y puede continuarse con otro gesto. El contenido de texto excepcionalmente largo puede desplazarse dentro del área central, conservando controles.

Prueba local sugerida (requiere entorno autorizado):

```
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Abrir http://localhost:4173 en el mismo ordenador. Ese localhost no es el localhost de una tablet diferente. La conexión USB/LAN/ADB y los permisos deben verificarse en el ordenador autorizado; no están configurados por este repositorio. Desde otro equipo por HTTP de LAN, Service Workers pueden no funcionar por falta de contexto seguro; probar offline requiere un origen admitido y seguro. No afirmar acceso a la tablet ni abrir interfaces/red sin autorización.

El usuario decidió continuar en el mismo Site. La publicación del ajuste responsive se realiza tras revisión estática y regresiones; las pruebas reales en tablet siguen pendientes.

## Resultado flotante (actualización 2026-10-11)
El resultado guardado aparece en un diálogo compacto sobre el ejercicio terminado. El texto puede desplazarse sin arrastrar los botones. Escape o cerrar vuelve al ejercicio y permite reabrir el mismo resultado; no crea intentos duplicados. El diálogo bloquea la interacción de fondo y mantiene el foco de teclado. Verificación de navegador y tablet física pendiente.
