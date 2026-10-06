# 📚 Documentación Técnica y Manual del Sistema: Plataforma Offline de Encuestas

Este documento describe en profundidad la arquitectura del sistema, el flujo de sincronización bidireccional, las reglas de negocio, el manual de usuario de las interfaces y la guía de compilación y despliegue del proyecto.

---

## 1. Arquitectura General del Sistema

La plataforma implementa una arquitectura híbrida **Offline-First**, diseñada para operar con máxima confiabilidad en campo sin acceso a internet y sincronizarse de manera atómica con un servidor central al recuperar conectividad.

```
┌─────────────────────────────────────────────────────────┐
│                    DISPOSITIVOS EN CAMPO                │
│  Android (APK Nativo)           Navegadores Web (PWA)   │
│  React 19 + Capacitor           React 19 + Vite         │
│  SQLite Nativo                  jeep-sqlite / sql.js    │
└────────────────────────────┬────────────────────────────┘
                             │  HTTP / REST (JSON)
                             │  SyncService en segundo plano
                             ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND CENTRALIZADO (Node.js)             │
│  Express 5 + TypeScript + Prisma 7 + PostgreSQL Pool    │
│  Arquitectura Modular por Capas (index.ts ~38 líneas)   │
│  Aislamiento Serializable + Auditoría de Duplicados     │
└─────────────────────────────────────────────────────────┘
```

### A. Capa Cliente (Frontend Móvil y Web)
- **Framework Core**: [React 19](https://react.dev/) estructurado con [Vite](https://vitejs.dev/) para empaquetado veloz y Hot Module Replacement (HMR).
- **Lenguaje**: TypeScript con tipado estricto.
- **Persistencia Local**:
  - **Móvil (Android)**: `@capacitor-community/sqlite` con acceso directo al motor SQLite del dispositivo.
  - **Web**: `jeep-sqlite` y `sql.js` ejecutados sobre WebAssembly e IndexedDB para simular SQLite nativo en el navegador durante desarrollo.
- **Empaquetador Nativo**: [Capacitor 8](https://capacitorjs.com/) de Ionic, que compila el bundle web dentro de un proyecto nativo Android sin puentes lentos.
- **Exportación de Datos**: [ExcelJS](https://github.com/exceljs/exceljs) para generación de hojas de cálculo con colores, estilos, bordes y metadatos.
- **Interfaz y Estilos**: Vanilla CSS3 estructurado bajo la técnica *Glassmorphism*, diseño responsive y variables de color dinámicas.

### B. Capa Servidor (Backend RESTful)
- **Entorno**: Node.js con [Express 5](https://expressjs.com/).
- **ORM & Conexión**: [Prisma 7](https://www.prisma.io/) con `@prisma/adapter-pg` y pool de conexiones nativo `pg.Pool`.
- **Estructura Modular por Capas**:
  - `config/`: Configuración de entorno (`env.ts`), pool de base de datos (`db.ts`) y almacenamiento Multer (`multer.ts`).
  - `middlewares/`: Autenticación JWT (`auth.ts`) y logger HTTP (`logger.ts`).
  - `utils/`: Algoritmos de texto, distancia de Levenshtein y fusión MRU de teléfonos (`textUtils.ts`).
  - `services/`: Sincronización serializable (`syncService.ts`) y detección de duplicados (`duplicateService.ts`).
  - `controllers/`: Manejadores desacoplados de peticiones (`auth`, `version`, `sync`, `survey`, `adminUser`, `adminSurvey`, `duplicate`).
  - `routes/`: Enrutadores por dominio agregados en `routes/index.ts` con compatibilidad dual (`/api/...` y `/...`).
  - `index.ts`: Punto de arranque limpio de ~38 líneas.

---

## 2. Flujo de Datos y Sincronización Bidireccional

### A. Captura Offline de Encuestas
1. El encuestador diligencia el formulario en la aplicación móvil.
2. Si el dispositivo tiene conexión, el formulario verifica en línea si la cédula ya existe en la base central.
3. Si el dispositivo está **offline**, la validación se realiza contra la base de datos local SQLite.
4. **Lógica MRU de Contactos**: Se pueden almacenar hasta 3 teléfonos de contacto. Al guardar, los teléfonos nuevos pasan a ser prioritarios (Posición 1) y los anteriores rotan hacia abajo sin duplicarse.
5. El registro se almacena en SQLite con estado `estado_sincronizacion = 'pendiente'`.

### B. Proceso de Sincronización en Segundo Plano (`SyncService.tsx`)
1. El componente `SyncService` monitorea los eventos de conectividad (`window.addEventListener('online')` y red de Capacitor).
2. Al detectar conexión, consulta las encuestas en SQLite con estado `'pendiente'`.
3. Envía el lote completo en una petición `POST /api/sync` incluyendo el token de autenticación del encuestador.

### C. Transacción Atómica Serializable en Backend (`syncService.ts`)
Para evitar condiciones de carrera donde dos encuestadores envíen la misma cédula al mismo tiempo:
1. La operación de inserción/actualización se ejecuta con nivel de aislamiento `Serializable` de PostgreSQL:
   ```ts
   await prisma.$transaction(async (tx) => { ... }, {
     isolationLevel: 'Serializable',
     maxWait: 5000,
     timeout: 10000,
   });
   ```
2. **Si el registro ya existe**: Se combinan los teléfonos preservando el historial y se actualizan los datos de contacto, manteniendo el encuestador original.
3. **Si el registro es nuevo**: Se calcula la distancia de Levenshtein contra los registros existentes. Si hay una similitud sospechosa (ej. 1 carácter de diferencia en la cédula o nombres idénticos con cédula distinta), se registra una advertencia de duplicado sin bloquear el proceso.

### D. Reconciliación de Encuestas Eliminadas por el Administrador
Un problema común en sistemas offline es que, si un administrador borra una encuesta en el servidor, los dispositivos en campo aún la conservan en SQLite y podrían volver a subirla al sincronizar.
- **Solución implementada**:
  1. El backend mantiene una tabla de auditoría `encuestas_eliminadas (documento_identidad, eliminado_en)`.
  2. Cuando el administrador borra una encuesta (o descarta un duplicado), su cédula se registra en esta tabla.
  3. Durante el `POST /api/sync`, si el lote enviado contiene una encuesta previamente eliminada, el backend la rechaza y devuelve su ID en el arreglo `eliminadas: [{ localId, documento_identidad }]`.
  4. El cliente móvil recibe la respuesta y elimina inmediatamente ese registro de su SQLite local con `dbService.deleteSurveyByDocumento()`.

---

## 3. Módulos del Sistema y Manual de Usuario

### 📱 Módulo de Encuestador (Campo)

1. **Pantalla Principal (`SurveyList.tsx`)**:
   - Barra de búsqueda rápida por nombre o cédula.
   - Píldoras de filtro rápido: **Todas**, **Hoy**, **Ayer**, **Esta Semana**.
   - Indicador dinámico de conexión: `En línea` (Verde) / `Modo Offline` (Amarillo).
   - Contador de encuestas totales y encuestas pendientes de sincronización.
   - Botón de sincronización manual para forzar la subida de datos.
2. **Formulario de Encuesta (`SurveyForm.tsx`)**:
   - Validación de tipo y número de documento.
   - Captura de nombres, apellidos, hasta 3 teléfonos, dirección, profesión y fecha.
   - Registro automático de la hora de captura (`hora_registro`) y marca de tiempo ISO (`creado_en`).

---

### 🖥️ Módulo de Administración (Panel Web)

Acceso exclusivo para usuarios con rol `admin` (`/admin`).

#### 1. Dashboard Principal (`Dashboard.tsx`)
Distribución equilibrada y simétrica dividida en tres áreas:
- **Indicadores Clave (4 KPIs)**:
  - **Total Encuestas**: Conteo global con enlace directo a gestión.
  - **Sincronizadas**: Porcentaje de encuestas respaldadas en el servidor central.
  - **Pendientes de Sync**: Conteo de registros que aún no han subido al servidor.
  - **Posibles Duplicados**: Alerta visual con badge `"Por revisar"` si existen casos sospechosos.
- **Módulos de Gestión (3 Columnas de Acción Rápida)**:
  - **Equipo de Encuestadores**: Número de encuestadores activos y botón directo.
  - **Actualizaciones de la App**: Estado del APK móvil y acceso a publicación.
  - **Bandeja de Duplicados**: Resumen de alertas y acceso a resolución.
- **Tabla de Últimas Encuestas**:
  - Vista rápida de las 5 encuestas más recientes con nombre, cédula, encuestador que la realizó, fecha/hora exacta y botón de edición.

#### 2. Gestión Global de Encuestas (`AdminEncuestasList.tsx`)
- **Filtros por Fecha**:
  - Presets: *Todas*, *Hoy*, *Ayer*, *Esta Semana*, *Este Mes*.
  - Rango de fechas personalizado (*Desde* - *Hasta*).
- **Filtros por Franja Horaria ("De una hora a otra")**:
  - Selector de hora inicio (`HH:MM`) y hora fin (`HH:MM`).
  - Accesos directos a turnos de trabajo:
    - 🌅 **Turno Mañana**: `06:00` - `12:00`
    - ☀️ **Turno Tarde**: `12:00` - `18:00`
    - 🌙 **Turno Noche**: `18:00` - `23:59`
- **Filtro por Encuestador y Estado de Sincronización**.
- **Búsqueda Reactiva**: Filtra por cualquier coincidencia en documento, nombres, teléfonos o dirección.
- **Chips de Filtros Activos**: Visualiza cada filtro aplicado con botón para removerlo individualmente o botón de *Restablecer filtros*.
- **Exportación a Excel**: Descarga de reporte `.xlsx` formateado respetando los filtros activos.

#### 3. Detalle de Encuestador (`EncuestadorDetalle.tsx`)
- Vista dedicada a las encuestas de un encuestador en particular.
- Incluye la misma potencia de filtros: fechas, franjas horarias y turnos laborales.
- **Exportación Excel Exclusiva**: Genera un archivo con nombre automático ej. `encuestas_juan_perez_2026-09-12.xlsx` que contiene únicamente los registros de ese encuestador.
- Acciones individuales: Editar encuesta y eliminar encuesta con modal de confirmación.

#### 4. Bandeja de Auditoría de Duplicados (`AdminDuplicados.tsx`)
Detecta similitudes mediante análisis cruzado de la base de datos:
- **Criterios de Detección**:
  - Cédula idéntica registrada más de una vez.
  - Cédula con 1 o 2 dígitos de diferencia (posible error de digitación).
  - Nombre completo idéntico con cédula diferente.
  - Nombre fonéticamente o por Levenshtein muy similar (distancia ≤ 2 caracteres).
- **Acciones Disponibles**:
  - **Aprobar como Legítimo**: Marca el par como revisado para no volver a alertar.
  - **Fusionar Encuestas**: Unifica la información en un solo registro maestro, combina los teléfonos de ambos según la regla MRU (hasta 3 teléfonos) y elimina el registro redundante.
  - **Descartar / Eliminar**: Elimina la encuesta duplicada y registra su cédula en `encuestas_eliminadas` para que se borre de los dispositivos locales.

#### 5. Centro de Actualizaciones APK (`AdminActualizaciones.tsx`)
- Permite subir nuevos archivos `.apk` directamente desde el panel web.
- Registra el número de versión (ej: `1.0.2`), notas de versión y si la actualización es obligatoria.
- Los dispositivos móviles consultan periódicamente `/api/version` y, si hay una versión superior, descargan el instalador automáticamente desde `/api/version/download`.

#### 6. Gestión de Encuestadores (`EncuestadoresList.tsx`)
- Creación de nuevos usuarios con rol `encuestador`.
- Edición de nombre, usuario y contraseña.
- **Eliminación Segura con Contraseña**: Si el encuestador tiene encuestas registradas, el sistema exige ingresar la contraseña del administrador actual antes de ejecutar la eliminación en cascada.

---

## 4. Manual de Compilación del APK (Android Studio)

Para compilar la aplicación móvil nativa `.apk`:

### Requisitos
1. **Android Studio**: Descargado e instalado con el SDK de Android (API 34 o superior).
2. **Node.js** y dependencias instaladas (`npm install`).

### Procedimiento Paso a Paso

1. **Construir el código web empaquetado**:
   ```bash
   npm run build
   ```
   Esto genera los archivos optimizados en la carpeta `/dist`.

2. **Sincronizar Capacitor con el proyecto nativo Android**:
   ```bash
   npx cap sync android
   ```
   Este comando copia el bundle web hacia `android/app/src/main/assets/public` y actualiza los plugins de SQLite, Filesystem y Share.

3. **Abrir Android Studio**:
   ```bash
   npx cap open android
   ```

4. **Sincronizar Gradle**:
   - En Android Studio, haz clic en el ícono del elefante en la barra superior derecha (**Sync Project with Gradle Files**).
   - Espera a que termine la descarga e indexación de dependencias.

5. **Generar el archivo APK**:
   - En el menú superior, ve a **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
   - Cuando termine la compilación, aparecerá una notificación abajo a la derecha: *"APK(s) generated successfully"*.
   - Haz clic en **Locate** para abrir la carpeta que contiene el archivo `app-debug.apk`.

---

## 5. Guía de Despliegue en Producción (Backend & Base de Datos)

### Variables de Entorno del Backend (`backend/.env`)
```env
PORT=3005
DATABASE_URL="postgresql://usuario:password@localhost:5432/encuestas_prod?schema=public"
JWT_SECRET="clave_secreta_de_al_menos_32_caracteres_aleatorios"
# Opcional: orígenes web adicionales permitidos por CORS, separados por coma
CORS_ORIGINS="https://tu-dominio.com"
# Número de proxies inversos delante de la API (1 por defecto; 0 si la API se expone directamente)
TRUST_PROXY=1
```
El servidor **no arranca** si `JWT_SECRET` falta o tiene menos de 32 caracteres, ni si falta `DATABASE_URL`.

### Configuración del Frontend para Producción (`src/config.ts`)
Configura la URL de tu servidor backend en la nube:
```ts
export const BACKEND_URL = 'https://tu-dominio-o-ip.com';
```

### Comandos de Despliegue del Backend
```bash
cd backend
npm install
npx prisma db push
ADMIN_PASSWORD="contraseña-inicial-de-al-menos-8-caracteres" npx prisma db seed   # solo la primera vez
npm run build
# Iniciar con PM2 para alta disponibilidad
pm2 start dist/index.js --name "encuestas-backend"
```

---

## 7. Configuración de Seguridad y Migración

### Cambios de comportamiento (versión segura)
- **Autenticación en cada petición:** el token se valida contra la base de datos. Un usuario desactivado o eliminado pierde el acceso de inmediato.
- **Sincronización (`POST /api/sync`) requiere sesión.** El usuario al que se atribuyen las encuestas es siempre el del token. Lotes de máximo 200 encuestas (la app envía lotes de 100).
- **Sin administrador automático:** el login ya no crea el usuario `admin` con la contraseña que se envíe. El administrador inicial se crea con el seed (`ADMIN_PASSWORD`).
- **Gestión de usuarios:** los endpoints de encuestadores solo afectan cuentas con rol `encuestador`. Los administradores no pueden eliminarse ni cambiarse desde la API de encuestadores.
- **Contraseñas de encuestadores:** mínimo 8 caracteres al crear o cambiar.
- **Acceso sin conexión:** la contraseña se guarda en SQLite como hash bcrypt. Un usuario solo puede entrar sin conexión después de haber iniciado sesión **en línea** en ese dispositivo. Las contraseñas en texto plano de versiones anteriores se invalidan en el primer arranque de la nueva versión.
- **Eliminaciones:** eliminar encuestas o encuestadores registra las cédulas en `encuestas_eliminadas` dentro de la misma transacción, para que los dispositivos no las vuelvan a subir.
- **Conflictos de sincronización:** cada encuesta tiene `actualizado_en`. Si el servidor tiene una modificación más reciente, se conservan sus datos (los teléfonos siempre se combinan). El servidor informa estos casos en `conflictos`.
- **Reconciliación:** el dispositivo envía sus cédulas sincronizadas a `POST /api/encuestas/documentos-faltantes` y recibe solo las que ya no existen. Ya no existe el listado completo de cédulas (`GET /api/encuestas/documentos-activos`).
- **Límites:** login (50 por IP y 10 por usuario cada 15 minutos) y búsquedas de cédulas (120 por minuto por usuario). Estos contadores viven en memoria del proceso.
- **Subida de APK:** solo archivos `.apk` válidos (firma ZIP) y versión con formato numérico.
- **Logs:** las cédulas en las rutas de búsqueda no se registran.
- **Privacidad entre encuestadores:** un encuestador solo ve sus propias encuestas completas. Si una cédula o un nombre coinciden con un registro de otro encuestador, el servidor responde únicamente con un aviso genérico, sin cédula, nombre, teléfono ni dirección de esa persona. El administrador ve todo.
- **Cédula repetida al sincronizar:** si otro encuestador envía una cédula que ya pertenece a alguien, la encuesta original **no se modifica**. Se guarda un **aviso de cédula** (tabla `AvisoCedula`) con la versión existente y la captura recibida. El administrador decide en el panel ("Avisos de cédula repetida"): **mantener el registro actual** o **usar la captura recibida**. El encuestador dueño no cambia. Un reenvío de la misma captura actualiza el aviso pendiente y no crea otro.
- **Copias locales:** el dispositivo de un encuestador borra al sincronizar las copias de encuestas de otros encuestadores. Nunca borra encuestas pendientes.
- **Teléfono principal en la fusión de duplicados:** queda el de la encuesta que se conserva. Los teléfonos de la otra encuesta se agregan después (máximo 3).

### Migración adicional: avisos de cédula
Ejecutar en la base de producción, después de los pasos 1 y 2:
```bash
psql "$DATABASE_URL" -f backend/prisma/sql/03_avisos_cedula.sql
```

### Migración de la base de datos (una sola vez)
1. Verificar que no hay cédulas repetidas. Debe devolver 0 filas:
   ```bash
   psql "$DATABASE_URL" -f backend/prisma/sql/01_verificar_duplicados.sql
   ```
2. Si hay filas, corregirlas desde la Bandeja de Duplicados antes de continuar.
3. Aplicar el cambio de esquema (columna `actualizado_en` y cédula única):
   ```bash
   psql "$DATABASE_URL" -f backend/prisma/sql/02_columna_y_unicidad.sql
   ```
4. Aplicar también `03_avisos_cedula.sql` (sección "Migración adicional" más abajo).

### Orden de despliegue en el VPS
1. **Respaldo** de la base de producción (`pg_dump -Fc`) antes de cualquier cambio.
2. **Base de datos:** ejecutar `01_verificar_duplicados.sql` (debe dar 0 filas), luego `02_columna_y_unicidad.sql` y `03_avisos_cedula.sql`. Para comprobar el esquema, `npx prisma migrate diff --from-schema <esquema anterior> --to-schema prisma/schema.prisma --script` debe mostrar solo lo que hacen estos scripts.
3. **`.env` del VPS:** cambiar `JWT_SECRET` (mínimo 32 caracteres). Revisar `TRUST_PROXY` según el proxy real (1 si hay un proxy como nginx delante). Si el frontend web se sirve desde otro dominio, agregarlo en `CORS_ORIGINS`.
4. **Código:** subir el repositorio, y en `backend/` ejecutar `npm ci`, `npx prisma generate` y `npm run build`.
5. **Arranque:** reiniciar desde la carpeta `backend/` (así se lee su `.env`): `pm2 restart encuestas-backend` (o `pm2 start dist/index.js --name encuestas-backend` la primera vez).
6. **APK:** en la raíz del proyecto, `npm run build`, luego `npx cap sync android`, y compilar el APK en Android Studio. La versión ya está en 1.2.0 (`versionCode 3`). Publicarlo en el panel con la versión `1.2.0`.
7. **Verificación:** `GET /api/version` responde 200; `POST /api/sync` sin token responde 401; el login de admin funciona.

Los dispositivos con versiones anteriores dejan de consultar `documentos-activos` y no pueden sincronizar sin sesión iniciada en línea. Por eso conviene publicar el APK 1.2.0 pronto.

### Limitaciones conocidas
- La base de datos local SQLite no está cifrada. Las cédulas y los datos de encuestas siguen legibles en un dispositivo con acceso root. Solo se protegen las credenciales y las copias de seguridad (`allowBackup="false"`).
- El rate limit vive en memoria: con varios procesos del backend, cada proceso cuenta por separado.
- Las búsquedas de cédulas siguen devolviendo el registro completo a cualquier encuestador autenticado, porque el formulario lo usa para autocompletar. Restringirlo a registros propios requiere una decisión de producto.

---

## 6. Mantenimiento y Extensibilidad

### Cómo agregar un campo nuevo a la Encuesta
1. **Base de Datos SQLite (Móvil)**:
   - Modifica la interfaz `Survey` en `src/db.ts`.
   - Agrega la columna en la sentencia `CREATE TABLE IF NOT EXISTS encuestas (...)` dentro de `src/db.ts`.
2. **Formulario de Captura**:
   - Agrega el input y el estado correspondiente en `src/pages/SurveyForm.tsx`.
3. **Base de Datos Central (Backend)**:
   - Modifica el modelo `Encuesta` en `backend/prisma/schema.prisma`.
   - Ejecuta `npx prisma db push` en la carpeta `backend/`.
   - Actualiza los controladores en `backend/src/controllers/adminSurveyController.ts` y `backend/src/services/syncService.ts`.
4. **Exportación a Excel**:
   - Agrega la columna en `src/services/exportExcel.ts`.
5. **Recompilar**:
   - Ejecuta `npm run build` y `npx cap sync android`.
