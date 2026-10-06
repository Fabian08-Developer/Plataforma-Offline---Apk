import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import bcrypt from 'bcryptjs';

/** Usuario de la sesión. Nunca incluye la contraseña: solo se guarda su hash en SQLite */
export interface User {
  id?: number;
  nombre: string;
  usuario: string;
  /** Solo se usa como entrada al crear o cambiar credenciales; nunca se devuelve ni se guarda en claro */
  password?: string;
  rol: 'admin' | 'encuestador';
}

/** Hash bcrypt (mismo formato que genera el backend) */
const ES_HASH_BCRYPT = /^\$2[aby]\$\d{2}\$/;
const COSTO_HASH = 10;

function sinPassword<T extends { password?: string }>(fila: T): Omit<T, 'password'> {
  const { password: _password, ...resto } = fila;
  return resto;
}

export interface Survey {
  id?: number;
  encuestador_id?: number;
  encuestador_usuario?: string;
  tipo_documento: string;
  documento_identidad: string;
  nombres: string;
  apellidos: string;
  telefono_1: string;
  telefono_2?: string;
  telefono_3?: string;
  direccion: string;
  fecha_registro: string;
  hora_registro?: string;
  creado_en?: string;
  /** Última modificación de los datos. El servidor la usa para resolver conflictos (gana la más reciente) */
  actualizado_en?: string;
  sincronizado_en?: string;
  profesion?: string;
  estado_sincronizacion: 'pendiente' | 'sincronizado';
}

class DatabaseService {
  private sqlite!: SQLiteConnection;
  private db!: SQLiteDBConnection;
  private isInitialized = false;

  constructor() {}

  async init(): Promise<void> {
    if (this.isInitialized) return;
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    try {
      if (Capacitor.getPlatform() === 'web') {
        const jeepEl = document.querySelector('jeep-sqlite');
        if (jeepEl) {
          await customElements.whenDefined('jeep-sqlite');
          await this.sqlite.initWebStore();
        }
      }

      const ret = await this.sqlite.checkConnectionsConsistency();
      const isConn = (await this.sqlite.isConnection('encuestas_db', false)).result;

      if (ret.result && isConn) {
        this.db = await this.sqlite.retrieveConnection('encuestas_db', false);
      } else {
        this.db = await this.sqlite.createConnection('encuestas_db', false, 'no-encryption', 1, false);
      }

      await this.db.open();

      // Eliminado el DROP TABLE de pruebas para que los datos persistan


      const schemaUsuarios = `
        CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          usuario TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          rol TEXT NOT NULL
        );
      `;
      await this.db.execute(schemaUsuarios);

      // Ya no se crea ningún administrador local con contraseña por defecto: el primer inicio de sesión debe ser en línea.

      // Migración de seguridad: las contraseñas guardadas en texto plano (versiones anteriores) se invalidan.
      // Cada usuario vuelve a iniciar sesión en línea una vez y su contraseña queda guardada como hash.
      await this.db.run(`UPDATE usuarios SET password = '' WHERE password NOT LIKE '$2%';`);

      const schema = `
        CREATE TABLE IF NOT EXISTS encuestas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          encuestador_id INTEGER,
          encuestador_usuario TEXT,
          tipo_documento TEXT NOT NULL,
          documento_identidad TEXT NOT NULL,
          nombres TEXT NOT NULL,
          apellidos TEXT NOT NULL,
          telefono_1 TEXT NOT NULL,
          telefono_2 TEXT,
          telefono_3 TEXT,
          direccion TEXT NOT NULL,
          fecha_registro TEXT NOT NULL,
          profesion TEXT,
          estado_sincronizacion TEXT NOT NULL
        );
      `;
      
      await this.db.execute(schema);
      try {
        await this.db.execute('ALTER TABLE encuestas ADD COLUMN encuestador_usuario TEXT;');
      } catch {
        // Columna ya existe en tablas creadas previamente
      }
      try {
        await this.db.execute('ALTER TABLE encuestas ADD COLUMN hora_registro TEXT;');
      } catch {
        // Columna ya existe
      }
      try {
        await this.db.execute('ALTER TABLE encuestas ADD COLUMN creado_en TEXT;');
      } catch {
        // Columna ya existe
      }
      try {
        await this.db.execute('ALTER TABLE encuestas ADD COLUMN actualizado_en TEXT;');
      } catch {
        // Columna ya existe
      }

      if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing SQLite database:', error);
      throw error;
    }
  }

  // --- Usuarios ---

  /** Fila completa con el hash de la contraseña. Solo para uso interno de este servicio */
  private async getUsuarioFila(usuario: string): Promise<(User & { id: number; password: string }) | undefined> {
    const result = await this.db.query(`SELECT * FROM usuarios WHERE usuario = ? LIMIT 1;`, [usuario]);
    const values = result.values;
    return values && values.length > 0 ? (values[0] as User & { id: number; password: string }) : undefined;
  }

  /** Usuario sin contraseña (para comprobar si existe o mostrar datos) */
  async getUserByCredentials(usuario: string): Promise<User | undefined> {
    const fila = await this.getUsuarioFila(usuario);
    return fila ? sinPassword(fila) : undefined;
  }

  /**
   * Inicio de sesión sin conexión. Solo acepta usuarios con contraseña guardada como hash.
   * Un usuario sin hash (creado sin contraseña o migrado) debe iniciar sesión en línea primero.
   */
  async verifyLocalCredentials(usuario: string, password: string): Promise<User | undefined> {
    const fila = await this.getUsuarioFila(usuario);
    if (!fila || !ES_HASH_BCRYPT.test(fila.password ?? '')) return undefined;
    const coincide = await bcrypt.compare(password, fila.password);
    return coincide ? sinPassword(fila) : undefined;
  }

  /**
   * Guarda o actualiza el usuario local después de un inicio de sesión exitoso en línea.
   * La contraseña se guarda como hash, así el acceso sin conexión queda habilitado.
   */
  async guardarUsuarioTrasLoginEnLinea(user: { nombre: string; usuario: string; rol: string }, password: string): Promise<User> {
    const hash = await bcrypt.hash(password, COSTO_HASH);
    const existente = await this.getUsuarioFila(user.usuario);
    if (existente) {
      await this.db.run(`UPDATE usuarios SET nombre = ?, password = ?, rol = ? WHERE id = ?`, [user.nombre, hash, user.rol, existente.id]);
    } else {
      await this.db.run(`INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)`, [user.nombre, user.usuario, hash, user.rol]);
    }
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
    return (await this.getUserByCredentials(user.usuario)) as User;
  }

  async getAllEncuestadores(): Promise<User[]> {
    const query = `SELECT * FROM usuarios WHERE rol = 'encuestador' ORDER BY nombre ASC;`;
    const result = await this.db.query(query);
    return (result.values as User[] || []).map((u) => sinPassword(u));
  }

  /**
   * Crea un usuario local. Sin contraseña, el usuario queda sin acceso sin conexión
   * (password = '') hasta que inicie sesión en línea.
   */
  async addUsuario(user: User): Promise<void> {
    const hash = user.password ? await bcrypt.hash(user.password, COSTO_HASH) : '';
    const query = `INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)`;
    await this.db.run(query, [user.nombre, user.usuario, hash, user.rol]);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  /** Si no se indica contraseña, se conserva la actual (antes se reseteaba a '123456') */
  async updateUsuario(id: number, user: User): Promise<void> {
    if (user.password) {
      const hash = await bcrypt.hash(user.password, COSTO_HASH);
      await this.db.run(`UPDATE usuarios SET nombre = ?, usuario = ?, password = ? WHERE id = ?`, [user.nombre, user.usuario, hash, id]);
    } else {
      await this.db.run(`UPDATE usuarios SET nombre = ?, usuario = ? WHERE id = ?`, [user.nombre, user.usuario, id]);
    }
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  async deleteUsuario(id: number, usuario?: string): Promise<void> {
    if (usuario) {
      await this.db.run(`DELETE FROM encuestas WHERE encuestador_id = ? OR encuestador_usuario = ?`, [id, usuario]);
    } else {
      await this.db.run(`DELETE FROM encuestas WHERE encuestador_id = ?`, [id]);
    }
    const query = `DELETE FROM usuarios WHERE id = ?`;
    await this.db.run(query, [id]);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  // --- Encuestas ---
  async getSurveyByDocumento(documento_identidad: string): Promise<Survey | undefined> {
    const query = `SELECT * FROM encuestas WHERE documento_identidad = ? LIMIT 1;`;
    const result = await this.db.query(query, [documento_identidad]);
    const values = result.values;
    return values && values.length > 0 ? (values[0] as Survey) : undefined;
  }

  /**
   * Guarda una encuesta nueva, o actualiza la existente con el mismo documento.
   * `desdeServidor`: la copia viene del servidor y conserva su fecha de modificación.
   * En cualquier otro caso es una edición local y queda marcada como la más reciente.
   */
  async addSurvey(survey: Survey, opciones: { desdeServidor?: boolean } = {}): Promise<void> {
    const actualizadoEn = opciones.desdeServidor && survey.actualizado_en ? survey.actualizado_en : new Date().toISOString();

    // Si el documento ya existe en SQLite local, actualizamos la encuesta existente para evitar duplicados
    const existing = await this.getSurveyByDocumento(survey.documento_identidad);
    if (existing && existing.id) {
      await this.escribirEncuesta(existing.id, { ...survey, id: existing.id }, actualizadoEn);
      return;
    }

    const query = `
      INSERT INTO encuestas (
        encuestador_id, encuestador_usuario, tipo_documento, documento_identidad, nombres, apellidos, telefono_1, telefono_2, telefono_3,
        direccion, fecha_registro, profesion, estado_sincronizacion, hora_registro, creado_en, actualizado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const values = [
      survey.encuestador_id || null,
      survey.encuestador_usuario || '',
      survey.tipo_documento,
      survey.documento_identidad,
      survey.nombres,
      survey.apellidos,
      survey.telefono_1,
      survey.telefono_2 || '',
      survey.telefono_3 || '',
      survey.direccion,
      survey.fecha_registro,
      survey.profesion || '',
      survey.estado_sincronizacion,
      survey.hora_registro || '',
      survey.creado_en || '',
      actualizadoEn
    ];
    await this.db.run(query, values);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  /** Edición local: la encuesta queda con la fecha de modificación actual */
  async updateSurvey(id: number, survey: Survey): Promise<void> {
    await this.escribirEncuesta(id, survey, new Date().toISOString());
  }

  private async escribirEncuesta(id: number, survey: Survey, actualizadoEn: string): Promise<void> {
    const query = `
      UPDATE encuestas SET
        encuestador_id = ?, encuestador_usuario = ?, tipo_documento = ?, documento_identidad = ?, nombres = ?, apellidos = ?, telefono_1 = ?, telefono_2 = ?, telefono_3 = ?,
        direccion = ?, fecha_registro = ?, profesion = ?, estado_sincronizacion = ?, hora_registro = ?, creado_en = ?, actualizado_en = ?
      WHERE id = ?;
    `;
    const values = [
      survey.encuestador_id || null,
      survey.encuestador_usuario || '',
      survey.tipo_documento,
      survey.documento_identidad,
      survey.nombres,
      survey.apellidos,
      survey.telefono_1,
      survey.telefono_2 || '',
      survey.telefono_3 || '',
      survey.direccion,
      survey.fecha_registro,
      survey.profesion || '',
      survey.estado_sincronizacion,
      survey.hora_registro || '',
      survey.creado_en || '',
      actualizadoEn,
      id
    ];
    await this.db.run(query, values);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  /**
   * Devuelve solo los campos mínimos necesarios para la detección de similitud.
   * Más eficiente que getAllSurveys() cuando solo se necesita comparar documentos/nombres.
   */
  async getAllSurveysLight(): Promise<{ id: number; documento_identidad: string; nombres: string; apellidos: string; tipo_documento: string; encuestador_usuario?: string }[]> {
    const query = `SELECT id, documento_identidad, nombres, apellidos, tipo_documento, encuestador_usuario FROM encuestas ORDER BY id DESC;`;
    const result = await this.db.query(query);
    return result.values as any[] || [];
  }

  async getAllSurveys(): Promise<Survey[]> {
    const query = `SELECT * FROM encuestas ORDER BY id DESC;`;
    const result = await this.db.query(query);
    return result.values as Survey[] || [];
  }
  
  async getSurveysByEncuestador(encuestador_id?: number, encuestador_usuario?: string): Promise<Survey[]> {
    let query = `SELECT * FROM encuestas WHERE 1=1`;
    const params: any[] = [];
    if (encuestador_usuario && encuestador_id) {
      query += ` AND (encuestador_id = ? OR encuestador_usuario = ?)`;
      params.push(encuestador_id, encuestador_usuario);
    } else if (encuestador_id) {
      query += ` AND encuestador_id = ?`;
      params.push(encuestador_id);
    } else if (encuestador_usuario) {
      query += ` AND encuestador_usuario = ?`;
      params.push(encuestador_usuario);
    }
    query += ` ORDER BY id DESC;`;
    const result = await this.db.query(query, params);
    return result.values as Survey[] || [];
  }

  async getSurveyById(id: number): Promise<Survey | undefined> {
    const query = `SELECT * FROM encuestas WHERE id = ? LIMIT 1;`;
    const result = await this.db.query(query, [id]);
    const values = result.values;
    return values && values.length > 0 ? (values[0] as Survey) : undefined;
  }

  async getPendingSurveys(): Promise<Survey[]> {
    const query = `SELECT * FROM encuestas WHERE estado_sincronizacion = 'pendiente';`;
    const result = await this.db.query(query);
    return result.values as Survey[] || [];
  }

  async markAsSynchronized(
    id: number, 
    documento_identidad?: string,
    phones?: { telefono_1?: string; telefono_2?: string; telefono_3?: string }
  ): Promise<void> {
    const byId = await this.db.query(`SELECT id FROM encuestas WHERE id = ? LIMIT 1;`, [id]);
    const targetId = (byId.values && byId.values.length > 0) ? id : null;

    if (phones && (phones.telefono_1 || phones.telefono_2 || phones.telefono_3)) {
      const t1 = phones.telefono_1 || '';
      const t2 = phones.telefono_2 || '';
      const t3 = phones.telefono_3 || '';
      if (targetId) {
        await this.db.run(
          `UPDATE encuestas SET estado_sincronizacion = 'sincronizado', telefono_1 = ?, telefono_2 = ?, telefono_3 = ? WHERE id = ?;`,
          [t1, t2, t3, targetId]
        );
      } else if (documento_identidad) {
        await this.db.run(
          `UPDATE encuestas SET estado_sincronizacion = 'sincronizado', telefono_1 = ?, telefono_2 = ?, telefono_3 = ? WHERE documento_identidad = ?;`,
          [t1, t2, t3, documento_identidad]
        );
      }
    } else {
      if (targetId) {
        await this.db.run(`UPDATE encuestas SET estado_sincronizacion = 'sincronizado' WHERE id = ?;`, [targetId]);
      } else if (documento_identidad) {
        await this.db.run(`UPDATE encuestas SET estado_sincronizacion = 'sincronizado' WHERE documento_identidad = ?;`, [documento_identidad]);
      }
    }
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  async deleteSurvey(id: number): Promise<void> {
    const query = `DELETE FROM encuestas WHERE id = ?;`;
    await this.db.run(query, [id]);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  async deleteSurveyByDocumento(documento_identidad: string): Promise<void> {
    const query = `DELETE FROM encuestas WHERE documento_identidad = ?;`;
    await this.db.run(query, [documento_identidad]);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  /**
   * Purga del SQLite local todas las encuestas que estaban marcadas como 'sincronizado'
   * pero que ya no existen en la lista de documentos activos devuelta por el servidor central.
   */
  async purgeDeletedSurveys(activeDocs: string[]): Promise<number> {
    const activeSet = new Set(activeDocs.map((d) => String(d).trim()));
    const all = await this.getAllSurveys();
    let purged = 0;
    for (const s of all) {
      if (s.estado_sincronizacion === 'sincronizado' && !activeSet.has(String(s.documento_identidad).trim())) {
        if (s.documento_identidad) await this.deleteSurveyByDocumento(s.documento_identidad);
        if (s.id) await this.deleteSurvey(s.id);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Un encuestador solo conserva localmente sus propias encuestas. Borra las copias sincronizadas
   * de otros encuestadores (o sin autor, de versiones anteriores). Nunca borra encuestas pendientes.
   * Los datos propios siguen en el servidor y se consultan con "mis encuestas".
   */
  async deleteSyncedNotOwned(usuario: string): Promise<number> {
    const condicion = `estado_sincronizacion = 'sincronizado' AND (encuestador_usuario IS NULL OR encuestador_usuario = '' OR encuestador_usuario != ?)`;
    const conteo = await this.db.query(`SELECT COUNT(*) AS n FROM encuestas WHERE ${condicion};`, [usuario]);
    const n = Number(conteo.values?.[0]?.n ?? 0);
    if (n > 0) {
      await this.db.run(`DELETE FROM encuestas WHERE ${condicion};`, [usuario]);
      if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
    }
    return n;
  }

  /** Cédulas que este dispositivo tiene ya sincronizadas (las únicas candidatas a reconciliación) */
  async getSyncedDocumentos(): Promise<string[]> {
    const result = await this.db.query(`SELECT documento_identidad FROM encuestas WHERE estado_sincronizacion = 'sincronizado';`);
    return (result.values ?? []).map((r: any) => String(r.documento_identidad).trim()).filter(Boolean);
  }

  /**
   * Borra localmente las encuestas sincronizadas que el servidor confirmó como eliminadas.
   * Nunca borra encuestas pendientes de sincronizar.
   */
  async deleteSyncedByDocumentos(documentos: string[]): Promise<number> {
    for (const documento of documentos) {
      await this.db.run(
        `DELETE FROM encuestas WHERE estado_sincronizacion = 'sincronizado' AND documento_identidad = ?;`,
        [documento]
      );
    }
    if (documentos.length > 0 && Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
    return documentos.length;
  }
}

export const dbService = new DatabaseService();
