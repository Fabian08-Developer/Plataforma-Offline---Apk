# Documentación y Manual del Sistema: App de Encuestas Offline/Online

Este documento describe la arquitectura tecnológica, el flujo de datos del sistema y proporciona un manual de usuario detallado para la configuración y compilación del entorno móvil.

---

## 1. Stack Tecnológico

El proyecto está diseñado bajo una arquitectura moderna que combina tecnologías web con capacidades nativas móviles (PWA/Híbrida).

### Frontend (Aplicación Web/UI)
- **Framework Core**: React.js 18+ estructurado con Vite para un rendimiento extremadamente rápido y Hot-Reloading.
- **Lenguaje**: TypeScript, que garantiza un código robusto, seguro y tipado.
- **Estilos (UI)**: Vanilla CSS con un enfoque en diseño "Premium", implementando *Glassmorphism*, paletas de colores modernas y micro-animaciones para mejorar la experiencia de usuario.
- **Iconografía**: `lucide-react` para iconos ligeros y vectoriales.

### Capa Móvil (APK)
- **Empaquetador**: **CapacitorJS** de Ionic. Permite tomar toda la aplicación web construida en React y encapsularla en un proyecto nativo de Android sin tener que escribir código en Java o Kotlin.

### Base de Datos y Almacenamiento Local (Offline)
- **Motor de Base de Datos**: **SQLite Nativo** (`@capacitor-community/sqlite`).
- **Características**: Todo se almacena localmente en el dispositivo utilizando consultas SQL reales (`INSERT`, `SELECT`, `UPDATE`). Esto garantiza una persistencia de datos segura y compatible con cualquier estructura backend relacional a la que te conectes en el futuro.
- **Entorno de Pruebas Web**: `jeep-sqlite` para soportar la ejecución del motor SQLite dentro del navegador web durante el desarrollo en PC (`npm run dev`).

### Backend (En la Nube / Sincronización)
- **Estado Actual**: Simulado (Mock) localmente. El sistema detecta eventos de red, pero la comunicación con un servidor real está en pausa hasta definir los endpoints.
- **Integración Futura**: Se requerirá una **API RESTful** (en Node.js, PHP, Python, etc.) para conectar con tu Base de Datos Principal en la nube (MySQL, PostgreSQL, SQL Server, etc.).

---

## 2. Flujo del Sistema

El objetivo principal del sistema es garantizar que el trabajo de campo no se detenga por falta de cobertura móvil o internet.

### A. Registro de Encuestas
1. El usuario abre la app y diligencia los datos (Documento, Nombres, etc.).
2. **Lógica MRU de Contactos**: El sistema administra hasta 3 teléfonos de contacto.
   - Si se ingresa un teléfono nuevo, este se guarda en la Posición 1 (Principal).
   - Los teléfonos antiguos se "empujan" hacia abajo (el 1 pasa al 2, el 2 al 3, y el 3 se borra si existía).
   - Si el teléfono ingresado ya existía en la posición 2 o 3, salta automáticamente a la posición 1 y reordena los demás.
3. El formulario se guarda en la base de datos local SQLite con estado de sincronización: **"Pendiente"**.

### B. Modo Offline
- La aplicación no depende de internet para funcionar. La lista de encuestas siempre carga desde SQLite, independientemente de la conexión.
- El usuario verá un indicador visual (amarillo) de que el registro está "Pendiente" por enviarse.

### C. Sincronización Automática (Online)
1. Un componente en segundo plano (`SyncService`) escucha de forma invisible el estado de la antena WiFi o de Datos Móviles del celular.
2. Al momento de reconectarse a Internet, el servicio se dispara.
3. Consulta a SQLite buscando registros con estado "Pendiente".
4. Simula la transmisión de datos hacia la base de datos principal de la nube.
5. Cambia el estado de los registros locales a **"Sincronizado"** y notifica a la interfaz gráfica, cambiando el color a verde.

---

## 3. Manual de Usuario: Instalación y Configuración de Android Studio

Para poder generar el archivo de instalación de Android (`.apk`), tu computadora necesita contar con Android Studio y sus herramientas de desarrollo. Sigue estos pasos cuidadosamente:

### Fase 1: Descarga e Instalación Básica
1. Visita la página oficial de descarga: [https://developer.android.com/studio](https://developer.android.com/studio)
2. Descarga el ejecutable para Windows y ábrelo.
3. En la pantalla del instalador, presiona **Next**. Asegúrate de **dejar marcadas todas las casillas** (incluyendo Android Virtual Device si te lo pregunta).
4. Elige la ruta de instalación por defecto y presiona **Install**.

> [!WARNING]
> La primera vez que abras Android Studio tras la instalación, se lanzará un "Setup Wizard" (Asistente de configuración inicial). **No lo canceles**. Dale "Next" a todo para que descargue e instale el "Android SDK", que es fundamental.

### Fase 2: Configuración del SDK (Si el Asistente falló)
Si por error no descargaste el SDK, te saldrá un cuadro rojo pidiendo la ruta del SDK (como sucedió anteriormente):
1. Abre Android Studio.
2. Haz clic en **Tools** > **SDK Manager** (o el ícono del cubo azul con flecha hacia abajo).
3. En la pestaña **SDK Platforms**, marca la versión de Android más reciente (Ej. API 34 o "UpsideDownCake").
4. Haz clic en **Apply**, acepta los términos y espera a que descargue todo.

### Fase 3: Preparación del Proyecto Capacitor
Antes de compilar, necesitas tener la última versión web construida. En tu terminal o consola:
1. Asegúrate de estar en la carpeta de tu proyecto.
2. Ejecuta: `npm run build` (Esto empaqueta la interfaz web).
3. Ejecuta: `npx cap sync` (Esto copia la web empaquetada dentro de la carpeta nativa de Android).

### Fase 4: Abriendo Android Studio
1. Ejecuta el siguiente comando para que Capacitor abra el proyecto correctamente:
   ```bash
   npx cap open android
   ```
2. Al abrirse Android Studio, en la esquina **superior derecha**, ubica un ícono pequeño de un elefante con una flechita de sincronización (se llama **Sync Project with Gradle Files**). 
3. **Paso Crítico:** Haz clic en ese elefante. 
4. En la parte de abajo de la ventana verás una barra que dice `Gradle Sync...` cargando. Esto instalará automáticamente las dependencias de SQLite en Android.
5. Sabrás que ha terminado cuando la barra de abajo desaparezca y cuando la carpeta `app` que está en el menú de la izquierda tenga un pequeño ícono de un Androide verde (o un punto verde).

### Fase 5: Compilar y Obtener el APK
1. Una vez finalizada la sincronización (paso anterior), ve al menú principal en la parte superior izquierda (las 4 líneas horizontales o menú hamburguesa).
2. Pasa el ratón sobre **Build**.
3. Haz clic en **Build Bundle(s) / APK(s)**.
4. Selecciona **Build APK(s)**.
5. Android Studio empezará a compilar todo el sistema. Verás el progreso abajo.
6. Cuando acabe, saldrá una notificación en la esquina inferior derecha: **"APK(s) generated successfully"**.
7. En esa notificación habrá un texto azul llamado **locate**. Dale clic.
8. Se te abrirá la carpeta en Windows mostrándote tu archivo `app-debug.apk`. 

¡Felicidades! Ese es el archivo instalable de tu proyecto, transfiérelo a tu teléfono Android y ábrelo para instalar.

---

## 4. Visualización de los Datos Ingresados

Existen dos maneras de auditar y visualizar la información que se ha registrado en el sistema:

### A. A través de la Interfaz Gráfica (Usuarios Normales)
- En la pantalla principal de la aplicación aparece un listado de todas las encuestas creadas. Allí podrás ver un resumen rápido con el Documento, Nombre, Teléfono 1 y Estado de Sincronización.
- Para inspeccionar un registro a fondo (para ver la dirección, profesión, o teléfonos secundarios), haz clic en el botón con el **ícono de Lápiz (Editar)** que se encuentra en la tarjeta del registro. Esto desplegará la información completa tal cual fue digitada.

### B. Inspección Cruda de la Base de Datos (Para Desarrolladores)
Si necesitas verificar directamente cómo se almacenan las tablas dentro del motor de base de datos durante el desarrollo web, puedes hacerlo usando las herramientas del navegador:
1. Abre tu navegador (Google Chrome o Edge) en la ventana donde corre la aplicación (`http://localhost:5173/`).
2. Presiona **F12** en tu teclado para abrir las Herramientas de Desarrollador (DevTools).
3. Navega hasta la pestaña **Application** (Aplicación).
4. En el menú lateral izquierdo, busca la sección **Storage** (Almacenamiento) y abre la carpeta **IndexedDB**.
5. Allí encontrarás una base de datos local llamada **`jeep-sqlite`**. 
6. Al desplegarla, podrás ver y navegar por la tabla principal donde SQLite está guardando físicamente los archivos binarios de los registros generados.

---

## 5. Estructura del Proyecto y Manual del Sistema (Para Desarrolladores)

Si necesitas escalar, modificar o dar mantenimiento a la plataforma en el futuro, esta es la estructura central de la aplicación y la responsabilidad de cada archivo:

### Árbol de Directorios del Código Fuente (`src/`)

```text
src/
├── App.tsx                 # Enrutador principal (React Router) que maneja la navegación entre la lista y el formulario.
├── db.ts                   # Motor central de la base de datos. Configura e inicializa la conexión con SQLite Nativo y define los esquemas.
├── index.css               # Hoja de estilos global Vanilla CSS con variables, glassmorphism y micro-animaciones.
├── main.tsx                # Punto de entrada de React. Inicializa SQLite y envuelve la app.
│
├── assets/                 # Archivos estáticos
│   ├── hero.png            # Imagen demostrativa usada en el frontend.
│   └── vite.svg            # Logo.
│
├── components/
│   └── SyncService.tsx     # Servicio invisible que corre en segundo plano. Escucha la conexión a Internet y despacha la sincronización de encuestas "pendientes".
│
├── pages/
│   ├── SurveyForm.tsx      # Interfaz y lógica del Formulario de Encuestas (Creación y Edición). Implementa el guardado en la base de datos.
│   └── SurveyList.tsx      # Interfaz de la Lista Principal. Lee los registros de SQLite y escucha el evento "surveys-updated" para recargar en tiempo real.
│
└── services/
    └── phoneLogic.ts       # Algoritmo de negocio (MRU - Most Recently Used) encargado de rotar y priorizar los 3 números de teléfono de contacto.
```

### Manual de Modificación del Sistema

1. **Modificar Estructura de la Base de Datos:**
   Si deseas añadir nuevos campos a la encuesta (Ej: correo electrónico), debes:
   - Ir a `src/db.ts` y modificar la interfaz TypeScript `Survey`.
   - Bajar a la función `init()` en `db.ts` y modificar el string SQL: `CREATE TABLE IF NOT EXISTS surveys (...)` añadiendo tu nueva columna.

2. **Modificar la Lógica de Envío al Backend:**
   Cuando tengas el servidor real activo:
   - Abre `src/components/SyncService.tsx`.
   - Localiza la función `syncPendingData()`.
   - Elimina la promesa falsa `await new Promise(...)`.
   - Añade tu bloque de código `fetch('https://tu-api.com', { method: 'POST', body: JSON.stringify(survey) })`.

3. **Compilar Cambios Nuevos:**
   Cualquier cambio que realices en estos archivos (`.tsx`, `.ts`, `.css`) **no** se reflejará mágicamente en Android Studio. Siempre que cambies código y quieras un nuevo instalador APK, debes ejecutar en tu terminal:
   ```bash
   npm run build
   npx cap sync
   ```
   *Y solo entonces, generar de nuevo el APK en Android Studio.*
