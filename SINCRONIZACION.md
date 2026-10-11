# Balmer Aprende — continuidad local

Recuperación realizada el 11 de octubre de 2026 desde el repositorio original de Sites.

- Site: Aprende · Lectura y escritura.
- Proyecto: `appgprj_6acb9f664e248191abc15e3d2d066dd7`.
- URL: https://balmer-aprende-pwa.balmerbs.chatgpt.site
- Última versión guardada consultada: 4.
- Commit recuperado: `0cba8dafbeb0732d055ac81e6ff2d16bef4533b8` (coincide con la versión 4).
- Carpeta de trabajo: `C:\Users\harol\Documents\ChatGPT\Balmer Aprende`.
- Identidad de publicación conservada en `.openai/hosting.json`; acceso público consultado, sin modificar.

## Estado del producto

PWA educativa estática, HTML/CSS/JavaScript modular, sin dependencias runtime externas. No utiliza todavía Vite, React, TypeScript ni Tailwind. Esta recuperación conserva la arquitectura existente; una migración requiere un trabajo posterior con paridad funcional.

Navegación: Mi inicio, Mis actividades, Mis avances, Para padres y Configuración. Dos perfiles ficticios (Luna y Leo), seis actividades, audios locales, trazado táctil, preparación offline verificada por hashes y exportación JSON. El espacio de padres permite cargar imágenes y preparar tareas manuales revisadas y asignadas a perfiles.

## Archivos principales

| Archivo | Responsabilidad |
| --- | --- |
| `dist/app.js` | Vistas, navegación, tareas, actividades y resultados |
| `dist/styles.css` | Diseño y adaptación responsive |
| `dist/data.js` | Perfiles y catálogo de actividades |
| `dist/store.js` | IndexedDB, intentos y cola local |
| `dist/scoring.js` | Estimación experimental de trazos |
| `dist/audio.js` | Reproducción y validación de audio |
| `dist/offline.js`, `dist/sw.js` | Descarga, verificación y caché offline |
| `dist/assets/` | Ilustraciones, iconos y audios recuperados |
| `scripts/`, `tests/` | Manifiesto, generación de audio y comprobaciones |

En este proyecto `dist/` contiene los archivos editables originales, además de ser la carpeta que publica Sites. No borrarla como si fuera una salida descartable.

## Datos recuperados y límites

Se recuperó todo el árbol Git de la versión indicada, con recursos, pruebas y los cuatro commits de versiones guardadas. No hay Firebase, autenticación real, base de datos remota, IA ni sincronización de resultados activos.

Los datos personales viven en IndexedDB `aprende-prototype-v1`, con almacenes `meta`, `attempts`, `outbox`, `materials` y `lessons`. Pertenecen al navegador y origen donde se introdujeron. No se descargaron esos datos ni las cachés del navegador; abrir localhost crea un almacenamiento distinto al Site publicado.

La exportación actual incluye intentos, cola y lecciones; omite materiales/fotos y ajustes. Tampoco existe importación completa. Por ello no equivale a una copia de seguridad integral. Para trasladar datos existentes deberá implementarse y validarse exportación/importación completa desde el navegador de origen. La cola permanece `awaiting_backend` y no representa sincronización remota.

## Continuar en Windows

Desde esta carpeta:

```powershell
node --test tests/*.test.mjs
node --check dist/app.js
node --check dist/sw.js
node scripts/build-manifest.mjs
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Abrir http://localhost:4173. Python es necesario únicamente para ese servidor de ejemplo; no se instaló ni se verificó en esta recuperación. No hace falta instalar paquetes npm para las pruebas y el build actuales.

Se ajustaron exclusivamente las rutas de dos pruebas mediante `fileURLToPath` para admitir Windows y espacios. Se desactivó `core.autocrlf` en este repositorio y se recuperaron los bytes originales para conservar los hashes offline.

Validación: 17 pruebas Node aprobadas, sintaxis de app/service worker válida y build del manifiesto completado (26 recursos). Las regresiones DOM/viewport son simulaciones: no certifican navegación real, funcionamiento offline en navegador ni tablet física. No se publicó una versión nueva durante esta recuperación.

Para futuras publicaciones, usar la skill Sites sobre este mismo proyecto y el repositorio recuperado, con credenciales temporales por stdin. Nunca guardar tokens. Las herramientas Sites gestionan recuperación, push, empaquetado y publicación; no es necesario un remoto Git persistente para mantener el vínculo.

## Pendientes identificados

- Copia de seguridad y restauración completas si se necesitan trasladar materiales y progreso.
- Recuperación de borradores de actividades sin terminar.
- Validación visual, offline real, táctil y de audio en los dispositivos objetivo.
- Backend y aislamiento entre familias antes de convertir el prototipo en servicio multiusuario.
- Validación pedagógica de puntuaciones y audios; escritura libre permanece sin nota.
