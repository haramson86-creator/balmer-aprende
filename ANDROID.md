# Balmer Aprende para Android

Desde 0.4.2 la app consulta la última versión estable de GitHub al abrirse (como máximo una vez por hora mientras el proceso siga activo). Si encuentra una versión superior, muestra «Actualizar» y «Más tarde». En el bloque Android del Site aparece «Buscar actualizaciones» cuando se abre dentro de una APK compatible. La descarga se realiza en segundo plano; se verifican tamaño, SHA-256 de GitHub, paquete, versionCode superior y mismo certificado de firma antes de abrir el instalador. Android requiere aprobación explícita de instalación y, la primera vez, permitir instalaciones desde Aprende. No hay instalaciones silenciosas. Las APK anteriores necesitan instalar 0.4.2 manualmente una vez para incorporar este mecanismo.

Para validar detección sin publicar una versión ficticia, Gradle admite `-PaprendeVersionCode=2 -PaprendeVersionName=0.4.1` en una compilación QA local. Nunca subir esa salida como release; la distribución usa los valores predeterminados 4 / 0.4.3 y se conserva aparte antes de la prueba.

Versión 0.4.3 (versionCode 4), paquete `com.balmer.aprende`, Android 7 o posterior.

La APK abre por HTTPS el Site publicado. Requiere Internet y utiliza su autenticación, base de datos y almacenamiento. No contiene claves de OpenAI ni una copia del servidor. La generación por OpenAI sigue pendiente de configurar la clave del servidor.

## Compilar

Instalar Node 22, JDK 21 y Android SDK 36. Ejecutar `npm ci`, `node node_modules/@capacitor/cli/bin/capacitor sync android` y, desde `android/`, `gradlew.bat assembleDebug` con `JAVA_HOME` y `ANDROID_HOME` configurados.

La salida es `android/app/build/outputs/apk/debug/app-debug.apk`. El archivo distribuido se llama `Balmer-Aprende-0.4.3.apk`. Es una compilación de prueba firmada con clave debug, apta para instalación manual; no es una publicación de Google Play. Las futuras actualizaciones requieren conservar el certificado de firma, o desinstalar la versión anterior.

El código Android y el código del Site se versionan juntos. Los APK y sus sumas SHA-256 se adjuntan a GitHub Releases; las claves, datos locales, SDK, dependencias y salidas de compilación se excluyen del repositorio.
