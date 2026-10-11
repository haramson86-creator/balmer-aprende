# Balmer Aprende para Android

Desde 0.4.2 la app consulta la última versión estable de GitHub al abrirse (como máximo una vez por hora mientras el proceso siga activo). Si encuentra una versión superior, muestra «Actualizar» y «Más tarde». En el bloque Android del Site aparece «Buscar actualizaciones» cuando se abre dentro de una APK compatible. La descarga se realiza en segundo plano; se verifican tamaño, SHA-256 de GitHub, paquete, versionCode superior y mismo certificado de firma antes de abrir el instalador. Android requiere aprobación explícita de instalación y, la primera vez, permitir instalaciones desde Aprende. No hay instalaciones silenciosas. Las APK anteriores necesitan instalar 0.4.2 manualmente una vez para incorporar este mecanismo.

Para validar detección sin publicar una versión ficticia, Gradle admite `-PaprendeVersionCode=2 -PaprendeVersionName=0.4.1` en una compilación QA local. Nunca subir esa salida como release; la distribución usa los valores predeterminados 8 / 0.4.7 y se conserva aparte antes de la prueba.

Versión 0.4.7 (versionCode 8), paquete `com.balmer.aprende`, Android 7 o posterior.

La APK abre por HTTPS el Site publicado. Requiere Internet y utiliza su autenticación, base de datos y almacenamiento. No contiene claves de OpenAI ni una copia del servidor. OpenAI está configurado como secreto del servidor. El inicio guía a los padres para crear su familia, añadir niños y subir fotos; cada práctica requiere revisión y confirmación.

## Compilar

Instalar Node 22, JDK 21 y Android SDK 36. Ejecutar `npm ci`, `node node_modules/@capacitor/cli/bin/capacitor sync android` y, desde `android/`, `gradlew.bat assembleDebug` con `JAVA_HOME` y `ANDROID_HOME` configurados.

La salida es `android/app/build/outputs/apk/debug/app-debug.apk`. El archivo distribuido se llama `Balmer-Aprende-0.4.7.apk`. Es una compilación de prueba firmada con clave debug, apta para instalación manual; no es una publicación de Google Play. Las futuras actualizaciones requieren conservar el certificado de firma, o desinstalar la versión anterior.

El código Android y el código del Site se versionan juntos. Los APK y sus sumas SHA-256 se adjuntan a GitHub Releases; las claves, datos locales, SDK, dependencias y salidas de compilación se excluyen del repositorio.

Desde 0.4.6 los padres entran con ChatGPT y los niños con un código privado generado al crear su perfil por nombre. Los códigos duran 30 días; regenerarlos o retirar el acceso invalida los códigos y sesiones anteriores. No se incluye registro por email.

Desde 0.4.6, cambiar de niño a padre cierra la sesión infantil antes de comprobar la identidad de ChatGPT y el código del adulto. Desde 0.4.7, Android inicia la autenticación oficial de Sites en el navegador y vuelve con un ticket de un solo uso (120 segundos) vinculado a un verificador aleatorio conservado por la app. La sesión de identidad dura 7 días y el desbloqueo por código de padre 8 horas. El código no se omite al regresar. No se implementan rutas OAuth de la plataforma ni se copian sus cookies.

