# Balmer Aprende para Android

Versión inicial 0.4.0 (versionCode 1), paquete `com.balmer.aprende`, Android 7 o posterior.

La APK abre por HTTPS el Site publicado. Requiere Internet y utiliza su autenticación, base de datos y almacenamiento. No contiene claves de OpenAI ni una copia del servidor. La generación por OpenAI sigue pendiente de configurar la clave del servidor.

## Compilar

Instalar Node 22, JDK 21 y Android SDK 36. Ejecutar `npm ci`, `node node_modules/@capacitor/cli/bin/capacitor sync android` y, desde `android/`, `gradlew.bat assembleDebug` con `JAVA_HOME` y `ANDROID_HOME` configurados.

La salida es `android/app/build/outputs/apk/debug/app-debug.apk`. El archivo distribuido se llama `Balmer-Aprende-0.4.0.apk`. Es una compilación de prueba firmada con clave debug, apta para instalación manual; no es una publicación de Google Play. Las futuras actualizaciones requieren conservar el certificado de firma, o desinstalar la versión anterior.

El código Android y el código del Site se versionan juntos. Los APK y sus sumas SHA-256 se adjuntan a GitHub Releases; las claves, datos locales, SDK, dependencias y salidas de compilación se excluyen del repositorio.
