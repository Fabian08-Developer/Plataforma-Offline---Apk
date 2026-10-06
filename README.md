# 📱 Plataforma Offline - App de Encuestas & Gestión de Campo (APK / Web)

Una solución integral para la toma de datos y encuestas en campo diseñada bajo la filosofía **Offline-First**, complementada con un **Panel Web Administrativo centralizado** y un **Backend RESTful modular de alto rendimiento (Express 5 + Prisma 7 + PostgreSQL)**.

Permite capturar información de manera 100% fluida sin necesidad de conexión a Internet en dispositivos Android (APK) o navegadores Web, almacenando los datos de forma nativa en **SQLite** y sincronizándolos automáticamente con el servidor central al recuperar conectividad mediante transacciones serializables seguras.

---

## 🚀 Características Principales

- 📶 **Modo Offline-First Nativo**: Funciona de forma 100% autónoma en zonas rurales o sin cobertura móvil ni Wi-Fi.
- 💾 **Persistencia Relacional en SQLite**: Almacenamiento local directo con `@capacitor-community/sqlite` (en Android) y `jeep-sqlite` / `sql.js` (en Web).
- 🔄 **Sincronización Bidireccional Inteligente**: Detección automática de conectividad en segundo plano con transacciones `Serializable` que evitan duplicados concurrentes.
- 🗑️ **Reconciliación de Eliminaciones**: Si un administrador elimina una encuesta en el servidor, los dispositivos móviles la purgan automáticamente de su SQLite local en el siguiente ciclo de sincronización.
- 📞 **Lógica MRU de Contactos**: Algoritmo dinámico (*Most Recently Used*) que gestiona, fusiona y prioriza hasta 3 números telefónicos únicos por encuesta.
- 🔍 **Bandeja de Detección de Duplicados**: Análisis fonético y distancia de **Levenshtein** para detectar cédulas erróneas y nombres similares, con opciones de **Aprobar**, **Fusionar teléfonos** o **Descartar**.
- ⏱️ **Filtros Avanzados y Franjas Horarias**:
  - Filtros por fecha (Hoy, Ayer, Esta Semana, Este Mes, Rango personalizado).
  - Filtro por horario *"De una hora a otra"* con atajos de turnos laborales (Mañana, Tarde, Noche).
  - Búsqueda reactiva instantánea y chips de filtros activos.
- 📊 **Exportación Profesional a Excel (`.xlsx`)**: Generación con estilos corporativos mediante **ExcelJS**, compatible con navegadores y dispositivos móviles mediante Capacitor Filesystem/Share.
- 📲 **Centro de Actualizaciones OTA (Over The Air)**: Carga y distribución centralizada de nuevos archivos APK para actualización móvil automática.
- 👥 **Gestión y Seguridad por Roles**:
  - Roles `admin` y `encuestador` protegidos con tokens **JWT** y cifrado **bcryptjs**.
  - Eliminación de encuestadores protegida mediante confirmación de contraseña de administrador.
- 🧱 **Backend Modular por Capas**: Arquitectura limpia de 7 capas desacopladas con punto de entrada `index.ts` ultra liviano.

---

## 🛠️ Stack Tecnológico

### Frontend & Capa Móvil (`/`)
- **Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Navegación**: [React Router DOM v7](https://reactrouter.com/)
- **Base de Datos Local**: `@capacitor-community/sqlite` (Android) / `jeep-sqlite` & `sql.js` (Web)
- **Empaquetador Nativo**: [Capacitor 8](https://capacitorjs.com/) (Android nativo)
- **Exportación de Datos**: [ExcelJS](https://github.com/exceljs/exceljs)
- **UI & Estilos**: Vanilla CSS3 con Glassmorphism, Iconografía con [Lucide React](https://lucide.dev/)

### Backend (`/backend`)
- **Servidor**: Node.js, [Express 5](https://expressjs.com/)
- **ORM / Base de Datos**: [Prisma 7](https://www.prisma.io/), [PostgreSQL](https://www.postgresql.org/) (con `@prisma/adapter-pg` y pool de conexiones `pg`)
- **Autenticación**: JWT (JSON Web Tokens), bcryptjs
- **Subida de Archivos**: Multer (almacenamiento de binarios APK con límites)
- **Arquitectura**: Capas desacopladas (`config`, `middlewares`, `utils`, `services`, `controllers`, `routes`)

---

## 📁 Estructura del Proyecto

```text
Plataforma Offline - Apk/
├── android/                     # Proyecto nativo de Android Studio generado por Capacitor
├── backend/                     # API RESTful en Node.js + Express + Prisma
│   ├── prisma/                  # Esquema Prisma (schema.prisma) y seeds
│   ├── public/apk/              # Directorio de almacenamiento de binarios APK publicados
│   ├── src/
│   │   ├── config/              # Variables de entorno (env.ts), DB pool (db.ts), Multer (multer.ts)
│   │   ├── controllers/         # Controladores (auth, version, sync, survey, admin, duplicados)
│   │   ├── middlewares/         # Autenticación JWT (auth.ts) y logging (logger.ts)
│   │   ├── routes/              # Rutas desacopladas con soporte dual (/api y raíz)
│   │   ├── services/            # Lógica de sincronización atómica y detección de duplicados
│   │   ├── utils/               # Normalización de texto, Levenshtein y rotación MRU de teléfonos
│   │   └── index.ts             # Punto de entrada limpio (~38 líneas)
│   ├── tsconfig.json
│   └── package.json
├── public/                      # Archivos estáticos públicos
├── src/                         # Aplicación React (Frontend Web y Móvil)
│   ├── components/              # Componentes (SyncService, ConfirmModal, Toast, etc.)
│   ├── context/                 # Contextos de autenticación (AuthContext) y notificaciones (ToastContext)
│   ├── pages/
│   │   ├── Login.tsx            # Inicio de sesión para administradores y encuestadores
│   │   ├── SurveyForm.tsx       # Formulario de registro y edición con validación de cédula
│   │   ├── SurveyList.tsx       # Lista de campo para encuestadores con búsqueda y filtros rápidos
│   │   └── admin/
│   │       ├── Dashboard.tsx            # Panel administrativo (4 KPIs + 3 módulos de gestión)
│   │       ├── AdminEncuestasList.tsx   # Gestión global de encuestas con filtros avanzados y Excel
│   │       ├── EncuestadoresList.tsx    # Listado y creación de encuestadores
│   │       ├── EncuestadorDetalle.tsx   # Encuestas por encuestador con filtros y exportación propia
│   │       ├── AdminDuplicados.tsx      # Bandeja de auditoría, fusión y aprobación de duplicados
│   │       └── AdminActualizaciones.tsx # Publicación y versionamiento de APKs
│   ├── services/                # Exportación a Excel (exportExcel.ts), filtros (filterUtils.ts), similitud
│   ├── App.tsx                  # Enrutador principal y rutas protegidas por rol
│   ├── db.ts                    # Motor de base de datos SQLite y consultas SQL
│   ├── index.css                # Sistema de diseño con Glassmorphism y variables CSS
│   └── main.tsx                 # Inicialización de la aplicación
├── capacitor.config.ts          # Configuración de Capacitor
├── DOCUMENTACION.md             # Manual detallado de arquitectura, sincronización y compilación
├── package.json                 # Dependencias y scripts del frontend
└── README.md                    # Este archivo
```

---

## ⚙️ Requisitos Previos

- **Node.js**: v18.0.0 o superior (Recomendado v20+)
- **npm**: v9.0.0 o superior
- **PostgreSQL**: Base de datos relacional para el backend
- **Android Studio**: Requerido para compilar el instalador móvil nativo (`.apk`)

---

## 🚦 Guía de Instalación y Ejecución

### 1. Clonar el repositorio
```bash
git clone https://github.com/Fabian08-Developer/Plataforma-Offline---Apk.git
cd "Plataforma Offline - Apk"
```

### 2. Configurar el Backend
```bash
cd backend
npm install

# Configurar variables de entorno (.env) — ver sección "Configuración de seguridad" en DOCUMENTACION.md
# DATABASE_URL="postgresql://usuario:password@localhost:5432/encuestas_db"
# PORT=3005
# JWT_SECRET="al menos 32 caracteres aleatorios"   (obligatorio: el servidor no arranca sin él)

# Aplicar el esquema de Prisma (revisar antes backend/prisma/sql/)
npx prisma db push

# Crear el administrador inicial (una sola vez)
ADMIN_PASSWORD="una-contraseña-de-al-menos-8-caracteres" npx prisma db seed

# Iniciar servidor backend en desarrollo
npm run dev
```
El servidor backend correrá en `http://localhost:3005`.

Para ejecutar las pruebas del backend: `npm test` (dentro de `backend/`).

### 3. Configurar el Frontend (Web & Móvil)
En una nueva terminal en la raíz del proyecto:
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo Vite
npm run dev
```
La aplicación web estará disponible en `http://localhost:5173`.

### 4. Administrador inicial
- Usuario: `admin`
- Contraseña: la que definiste en `ADMIN_PASSWORD` al ejecutar el seed (no existe contraseña por defecto).
- El primer inicio de sesión en cada dispositivo debe hacerse **con conexión** para habilitar el acceso sin conexión.

---

## 📱 Compilación del APK para Android

Para empaquetar y generar el instalador Android (`.apk`):

1. **Construir el bundle web**:
   ```bash
   npm run build
   ```

2. **Sincronizar assets con el proyecto nativo Android**:
   ```bash
   npx cap sync android
   ```

3. **Abrir en Android Studio**:
   ```bash
   npx cap open android
   ```

4. **Compilar el APK**:
   - En Android Studio, presiona el botón **Sync Project with Gradle Files** (ícono del elefante).
   - Ve a `Build` > `Build Bundle(s) / APK(s)` > `Build APK(s)`.
   - Al finalizar, haz clic en **Locate** en la notificación para obtener tu archivo `app-debug.apk`.

> [!TIP]
> Para el manual completo de usuario, arquitectura de datos y configuración paso a paso, consulta [DOCUMENTACION.md](file:///c:/Users/leide/OneDrive/Documentos/GitHub/Plataforma%20Offline%20-%20Apk/DOCUMENTACION.md).

---

## 📄 Licencia

Este proyecto está bajo la Licencia ISC. Consulta el archivo `package.json` para más detalles.
