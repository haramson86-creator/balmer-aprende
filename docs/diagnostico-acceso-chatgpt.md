# Diagnóstico y corrección del acceso

Sitio: https://balmer-aprende-pwa.balmerbs.chatgpt.site/
Proyecto: appgprj_6acb9f664e248191abc15e3d2d066dd7

El 11/10/2026, la captura del usuario de /api/session confirmó una sesión infantil activa. Las sesiones infantiles tienen prioridad sobre la identidad de ChatGPT para evitar que un niño herede permisos de padre en un dispositivo compartido.

La versión 0.4.6 incorpora una intención explícita de acceso como padre en return_to. Después de la autenticación nativa de ChatGPT, cierra la sesión infantil y exige el código personal del adulto. No se sustituye la identidad por un email enviado por el navegador. El código inicial autorizado para la cuenta solicitada se configura únicamente como hash secreto del servidor; no se incluye en el código ni en la APK.

La PWA usa la red primero y una pantalla offline estática verificada como respaldo. /index.html redirige a / en producción y ya no se utiliza como recurso del paquete offline.

La APK mantiene la navegación a auth.openai.com dentro del WebView, conservando sus cookies al volver al Site. No implementa rutas OAuth propias.

El 404 de /callback registrado a las 18:11:44.205 UTC (request 0175a78bfd0e2cdfdd02a70c6ea21c14) y el bloqueo observado en Chrome son observaciones anteriores; no prueban por sí solos una caída del dominio. La validación de producción debe comprobar el acceso nuevo, el rol y el código antes de declarar resuelto el flujo.

Validación local: 31 pruebas automatizadas, compilación web correcta, acceso con código y creación de familia en la identidad sintética de localhost. Las migraciones de familia y autenticación faltantes se aplicaron solo a la base local de pruebas.
