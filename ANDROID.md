# Balmer Aprende para Android

Desde 0.4.2 la app consulta la última versión estable de GitHub al abrirse (como máximo una vez por hora mientras el proceso siga activo). Si encuentra una versión superior, muestra «Actualizar» y «Más tarde». En el bloque Android del Site aparece «Buscar actualizaciones» cuando se abre dentro de una APK compatible. La descarga se realiza en segundo plano; se verifican tamaño, SHA-256 de GitHub, paquete, versionCode superior y mismo certificado de firma antes de abrir el instalador. Android requiere aprobación explícita de instalación y, la primera vez, permitir instalaciones desde Aprende. No hay instalaciones silenciosas. Las APK anteriores necesitan instalar 0.4.2 manualmente una vez para incorporar este mecanismo.

Para validar detección sin publicar una versión ficticia, Gradle admite `-PaprendeVersionCode=2 -PaprendeVersionName=0.4.1` en una compilación QA local. Nunca subir esa salida como release; la distribución usa los valores predeterminados 12 / 0.5.1 y se conserva aparte antes de la prueba.

Versión 0.5.1 (versionCode 12), paquete `com.balmer.aprende`, Android 7 o posterior.

La APK abre por HTTPS el Site publicado. Requiere Internet y utiliza su autenticación, base de datos y almacenamiento. No contiene claves de OpenAI ni una copia del servidor. OpenAI está configurado como secreto del servidor. El inicio guía a los padres para crear su familia, añadir niños y subir fotos; cada práctica requiere revisión y confirmación.

## Compilar

Instalar Node 22, JDK 21 y Android SDK 36. Ejecutar `npm ci`, `node node_modules/@capacitor/cli/bin/capacitor sync android` y, desde `android/`, `gradlew.bat assembleDebug` con `JAVA_HOME` y `ANDROID_HOME` configurados.

La salida es `android/app/build/outputs/apk/debug/app-debug.apk`. El archivo distribuido se llama `Balmer-Aprende-0.5.1.apk`. Es una compilación de prueba firmada con clave debug, apta para instalación manual; no es una publicación de Google Play. Las futuras actualizaciones requieren conservar el certificado de firma, o desinstalar la versión anterior.

El código Android y el código del Site se versionan juntos. Los APK y sus sumas SHA-256 se adjuntan a GitHub Releases; las claves, datos locales, SDK, dependencias y salidas de compilación se excluyen del repositorio.

Desde 0.4.6 los padres entran con ChatGPT y los niños con un código privado generado al crear su perfil por nombre. Los códigos duran 30 días; regenerarlos o retirar el acceso invalida los códigos y sesiones anteriores. No se incluye registro por email.

Desde 0.4.6, cambiar de niño a padre cierra la sesión infantil antes de comprobar la identidad de ChatGPT y el código del adulto. Desde 0.4.7, Android inicia la autenticación oficial de Sites en el navegador y vuelve con un ticket de un solo uso (120 segundos) vinculado a un verificador aleatorio conservado por la app. La sesión de identidad dura 7 días. Desde 0.4.8, el padre puede recordar el acceso durante 30 días en ese dispositivo; si desmarca la opción, dura 8 horas. La sesión recordada conserva su identidad sin repetir el inicio de sesión. Cerrar sesión revoca el acceso. El código no se omite al regresar. No se implementan rutas OAuth de la plataforma ni se copian sus cookies.


## Familia compartida (0.4.8)

El padre accede directamente a su panel familiar y al seguimiento de cada niño. Puede editar perfiles, generar o retirar códigos, subir varias fotos, revisar borradores y asignar o copiar prácticas aprobadas a sus hijos. Eliminar un perfil revoca su acceso y elimina sus resultados; conserva las fotos y devuelve sus tareas a borradores.

El administrador principal puede crear una invitación privada vinculada al correo de ChatGPT de otro adulto. Se comparte manualmente, caduca en 7 días y solo se usa una vez. El invitado entra con su cuenta y su código personal, acepta la invitación y comparte niños, fotos, tareas y avances. El administrador puede revocar el acceso; cada petición verifica la pertenencia a la familia en el servidor. No se envían correos ni se comparte el PIN del administrador.

Las pruebas automatizadas cubren sesión recordada, expiración y cierre; aislamiento entre familias y niños; invitaciones, revocación, edición, asignación y seguimiento compartido. Las pruebas de integración usan identidades y contenido sintéticos.


Desde 0.4.9, las prácticas subidas permiten avanzar con «Siguiente ejercicio» sin volver al listado. La barra numerada permite elegir cualquier ejercicio asignado al niño y muestra Por empezar, En práctica o Logrado según sus resultados de la revisión actual. Al terminar el último ejercicio se puede repasar. Saltar un ejercicio no lo marca como terminado.


## Biblioteca y notificaciones (0.5.0)

Las fotos se conservan en la biblioteca familiar con sus ejercicios y resultados. El padre puede buscar, cambiar el título, consultar referencias e historial, archivar y reactivar fotos o ejercicios. Archivar no elimina datos y retira las tareas del niño hasta reactivarlas. Asignar nueva práctica reutiliza un ejercicio aprobado y su referencia con una tarea nueva para el mismo niño o un hermano, conservando la anterior.

Se detectan fotos idénticas por SHA-256 de los bytes normalizados; no se usa reconocimiento visual para deduplicar fotos tomadas otra vez. Los análisis de fotos que ya tienen ejercicios se reutilizan, incluso ante solicitudes simultáneas. El análisis fallido puede reintentarse desde la foto guardada.

Los resultados guardados generan avisos dentro de Aprende, visibles a los padres de la familia, con niño, actividad, resultado y fecha. Cada adulto marca sus propios avisos como leídos. La lista se consulta al abrir la app y se actualiza cada 30 segundos mientras está activa; no son notificaciones push de Android con la app cerrada. No requieren correo ni otro servicio.

Versión anterior: 0.5.0, versionCode 11. Compilación Android correcta y 40 pruebas de integración y componentes satisfactorias.


## Voz de los ejercicios (0.5.1)

Antes de asignar una página o aprobar un ejercicio, el servidor genera voz natural en español para la consigna y las tres opciones mediante OpenAI gpt-4o-mini-tts (coral). El archivo WAV se finaliza, valida y guarda en R2, vinculado al contenido revisado dentro de su familia. Si falla la voz, el borrador permanece guardado y no se asigna hasta reintentar con éxito. No se envía la respuesta correcta al sintetizador.

El padre puede escuchar antes de confirmar. Al pulsar Escuchar en una tarea antigua sin archivo, se prepara y conserva automáticamente. El reproductor permite pausar, repetir y avanzar. Las copias y nuevas prácticas reutilizan el audio cuando la consigna y opciones coinciden; una corrección genera un audio distinto. Se comprueba el acceso familiar e infantil en cada petición y se admiten solicitudes Range. La voz se identifica como generada por IA. Las prácticas familiares necesitan conexión para cargar su audio; no se promete descarga sin conexión.

Validación 0.5.1: 44 pruebas, archivo real de OpenAI y decodificación/reproducción en navegador sin errores.
