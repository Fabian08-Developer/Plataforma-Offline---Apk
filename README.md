# 📱 Plataforma Offline - App de Encuestas & Gestión de Campo (APK / Web)

Una solución integral para la toma de datos y encuestas en campo diseñada bajo la filosofía **Offline-First**. Permite capturar información de manera fluida sin necesidad de conexión a Internet, almacenando los datos de forma nativa en **SQLite** dentro del dispositivo móvil y sincronizándolos automáticamente con un servidor **Backend RESTful (Express + Prisma)** al recuperar la conectividad.

---

## 🚀 Características Principales

- 📶 **Modo Offline-First**: Funciona de forma 100% autónoma en zonas sin cobertura móvil o Wi-Fi.
- 💾 **Persistencia Nativa en SQLite**: Almacenamiento local mediante `@capacitor-community/sqlite` con consultas SQL relacionales directas.
- 🔄 **Sincronización Automática (Online)**: Detección inteligente de red que envía automáticamente los registros "Pendientes" al servidor backend cuando se restablece la conexión.
- 📞 **Lógica MRU de Contactos**: Algoritmo de actualización dinámica (*Most Recently Used*) que gestiona y prioriza hasta 3 números telefónicos de contacto por encuesta.
- 🎨 **Diseño Moderno & Adaptativo**: Interfaz limpia con *Glassmorphism*, paleta de colores curada, micro-animaciones y soporte responsive.
- 📦 **Empaquetado Móvil Nativo**: Generación de instalables nativos Android (`.apk`) mediante **CapacitorJS**.
- 🛠️ **Backend Integrado**: Servidor API RESTful con TypeScript, Express, Prisma ORM y base de datos PostgreSQL.

---

## 🛠️ Stack Tecnológico

### Frontend & Capa Móvil (`/`)
- **Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Navegación**: React Router DOM v7
- **Base de Datos Local**: `@capacitor-community/sqlite` (Móvil) / `jeep-sqlite` & `sql.js` (Web)
- **Empaquetador Nativo**: [Capacitor 8](https://capacitorjs.com/) (Android)
- **UI & Estilos**: Vanilla CSS3, Lucide React (iconografía)

### Backend (`/backend`)
- **Servidor**: Node.js, [Express 5](https://expressjs.com/)
- **ORM / Base de Datos**: [Prisma 7](https://www.prisma.io/), PostgreSQL
- **Autenticación & Seguridad**: JWT (JSON Web Tokens), bcryptjs
- **Utilidades**: Multer (Carga de archivos), Cors

---

## 📁 Estructura del Proyecto

```text
Plataforma Offline - Apk/
├── android/                 # Proyecto nativo generado por Capacitor para Android Studio
├── backend/                 # API RESTful en Node.js + Express + Prisma
│   ├── prisma/              # Esquemas de Base de Datos y migraciones
│   ├── src/                 # Rutas, controladores y lógica de backend
│   └── package.json
├── public/                  # Recursos estáticos
├── src/                     # Código fuente de la aplicación React (Frontend Móvil/Web)
│   ├── assets/              # Imágenes y assets vectoriales
│   ├── components/          # Componentes reutilizables (SyncService, etc.)
│   ├── context/             # Contextos globales de React
│   ├── pages/               # Vistas principales (SurveyForm, SurveyList)
│   ├── services/            # Servicios de negocio (Lógica MRU de teléfonos)
│   ├── App.tsx              # Enrutador principal
│   ├── db.ts                # Configuración e inicialización del motor SQLite
│   ├── index.css            # Sistema de diseño global y Glassmorphism
│   └── main.tsx             # Punto de entrada de la app
├── capacitor.config.ts      # Configuración de CapacitorJS
├── DOCUMENTACION.md         # Manual detallado del sistema y compilación
├── package.json             # Dependencias del frontend
└── README.md                # Este archivo
```

---

## ⚙️ Requisitos Previos

- **Node.js**: v18.0.0 o superior
- **npm** o **yarn**
- **Android Studio** (Requerido únicamente para compilar la aplicación nativa `.apk`)
- **PostgreSQL** (Opcional, para la base de datos en producción del backend)

---

## 🚦 Guía de Instalación y Ejecución

### 1. Clonar el repositorio
```bash
git clone https://github.com/Fabian08-Developer/Plataforma-Offline---Apk.git
cd "Plataforma Offline - Apk"
```

### 2. Frontend / App Web & Móvil
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo en el navegador
npm run dev
```
La aplicación web estará disponible en `http://localhost:5173`.

### 3. Backend (Opcional)
```bash
cd backend

# Instalar dependencias del backend
npm install

# Iniciar backend en modo desarrollo
npm run dev
```

---

## 📱 Compilación del APK para Android

Para generar el archivo instalable Android (`.apk`), sigue estos pasos:

1. **Construir el proyecto web**:
   ```bash
   npm run build
   ```

2. **Sincronizar assets con el proyecto nativo**:
   ```bash
   npx cap sync
   ```

3. **Abrir en Android Studio**:
   ```bash
   npx cap open android
   ```

4. **Generar APK**:
   - En Android Studio, presiona el botón **Sync Project with Gradle Files** (ícono del elefante).
   - Ve a `Build` > `Build Bundle(s) / APK(s)` > `Build APK(s)`.
   - Una vez finalizada la compilación, haz clic en **Locate** en la notificación para obtener el archivo `app-debug.apk`.

> [!TIP]
> Para instrucciones detalladas paso a paso sobre el entorno de desarrollo y la base de datos, consulta la [DOCUMENTACION.md](file:///c:/Users/leide/OneDrive/Documentos/GitHub/Plataforma%20Offline%20-%20Apk/DOCUMENTACION.md).

---

## 📄 Licencia

Este proyecto está bajo la Licencia ISC. Consulta el archivo `package.json` para más detalles.
