# Integración selectiva

Frontend origen: `QA-LAB-Record-Kevin`, revisión `ccc9656736d94192992a871e1d111ca51ac445e8`.
Frontend destino: rama actual `QA-LAB-Record`.
Backend origen: `codex/upload-all-current-changes-20260925`, revisión `4b06991`.
Backend destino: rama actual `QA_Record_V2_Final`.

## Incorporado

- Login, sesión, cambio de contraseña y administración de usuarios/roles.
- Propagación del bearer token por el frontend y sus proxies al backend.
- Generación/descarga de PDF en backend y nombre/extensión de descarga en frontend.
- Generación de escenarios en segundo plano, consulta de estado e indicador de carga. Se conserva la lógica existente de captura y generación del motor.
- Protección de respuestas tardías frente a cambio de proyecto, nueva grabación o apertura de otra grabación.
- Conservadas las modificaciones locales previas de selección, datasets, TestRail, polling y carga de grabaciones.

## Excluido

La proyección de Chromium quedó excluida inicialmente. Tras la autorización posterior del usuario, se incorporó mediante puntos de conexión mínimos sobre la página actual del grabador. No se reemplazaron estos archivos por los de la rama origen.

No se incorporaron los cambios de captura, derivación interna, discovery, ejecución, scheduler ni autopom de la rama origen.

## Comprobaciones

- Los 469 archivos protegidos del backend conservan su hash anterior a esta integración, incluyendo cualquier modificación local previa.
- `npx vite build`: terminado correctamente.
- `npm run build` / TypeScript global: falla en archivos ajenos a la integración (incluye backups de TestLaunch, tests y errores existentes). Detalles en `kevin-typecheck.log`.
- Tras corregir los dos errores introducidos durante la adaptación, TypeScript no informa errores en login, identidad, indicador de carga ni hook de generación importados.
- No se ejecutó ningún job de negocio ni se realizaron pruebas end to end.

Los cambios están en los directorios de trabajo, sin commit, push o despliegue. No se inicializó ni modificó la base de datos real de identidad. Para activar la autenticación deben existir un administrador inicializado con `npm.cmd run auth:init` y `AUTH_ENABLED=true` en el backend.

## Chromium integrado

- Es la presentación estándar de grabaciones web, sin flag de activación. Android conserva su flujo actual.
- Chromium corre sin ventana separada, con el mismo contexto y tamaño de página previos. La imagen se transmite por CDP/WebSocket y los controles se envían al navegador real.
- Se conserva íntegra la lógica del capturador; la comparación contra el archivo anterior confirma que sus únicas diferencias son el accessor `liveViewTarget`, la importación del tipo CDP y `headless: true` al lanzar el navegador.
- El runner registra la transmisión, su propietario y la cierra antes del stop existente. Las entradas remotas aceptadas se procesan en orden antes de cerrar.
- El endpoint valida sesión, permisos y proyecto. El proxy del frontend transmite WebSocket a la URL del motor ya configurada.
- La vista usa las dimensiones anunciadas por el navegador y permite reconectar sin iniciar otra grabación.
- `npx vite build` terminó correctamente. TypeScript no informa errores en los nuevos módulos de transmisión; siguen los errores globales previos.
- No se ejecutó una grabación ni una prueba end to end. La preservación de código no sustituye una comprobación física de captura.
- Reiniciar backend y frontend es necesario para que los procesos existentes carguen la integración.

## Corrección de permisos y transmisión

- Se declaró `POST /api/recordings/execute-batch` con `tests.launch` y alcance de proyecto obligatorio, igual que la ejecución individual. Se conserva el rechazo de rutas sin política.
- La vista decodifica una imagen a la vez y conserva como máximo una imagen siguiente. Una llegada continua de imágenes ya no descarta indefinidamente la imagen que termina de decodificarse.
- El nuevo cliente confirma cada imagen procesada; el backend conserva una imagen en vuelo y únicamente el estado visual pendiente más reciente por cliente. Las confirmaciones visuales y pings no esperan detrás de los controles del navegador.
- Se agrupan únicamente movimientos consecutivos del mouse todavía pendientes. Los clics, teclas, texto y navegación conservan su orden.
- Se redujo la transmisión visual a una de cada tres imágenes producidas por Chromium y las consultas del resumen a una por segundo. Estos cambios no eliminan acciones capturadas.
- Vite compiló correctamente. No se ejecutaron jobs de negocio ni grabaciones físicas; la mejora de latencia todavía requiere observación real.
