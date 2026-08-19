import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

export interface User {
  id?: number;
  nombre: string;
  usuario: string;
  password?: string;
  rol: 'admin' | 'encuestador';
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

      const usersCount = await this.db.query('SELECT COUNT(*) as count FROM usuarios');
      if (usersCount.values && usersCount.values[0].count === 0) {
        // Solo insertamos el admin por defecto
        await this.db.run("INSERT INTO usuarios (nombre, usuario, password, rol) VALUES ('Administrador General', 'admin', '123456', 'admin')");
      }

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

      if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing SQLite database:', error);
      throw error;
    }
  }

  // --- Usuarios ---
  async getUserByCredentials(usuario: string, password?: string): Promise<User | undefined> {
    const query = password 
      ? `SELECT * FROM usuarios WHERE usuario = ? AND password = ? LIMIT 1;`
      : `SELECT * FROM usuarios WHERE usuario = ? LIMIT 1;`;
    const params = password ? [usuario, password] : [usuario];
    const result = await this.db.query(query, params);
    const values = result.values;
    return values && values.length > 0 ? (values[0] as User) : undefined;
  }

  async getAllEncuestadores(): Promise<User[]> {
    const query = `SELECT * FROM usuarios WHERE rol = 'encuestador' ORDER BY nombre ASC;`;
    const result = await this.db.query(query);
    return result.values as User[] || [];
  }

  async addUsuario(user: User): Promise<void> {
    const query = `INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)`;
    await this.db.run(query, [user.nombre, user.usuario, user.password || '123456', user.rol]);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }
  
  async updateUsuario(id: number, user: User): Promise<void> {
    const query = `UPDATE usuarios SET nombre = ?, usuario = ?, password = ? WHERE id = ?`;
    await this.db.run(query, [user.nombre, user.usuario, user.password || '123456', id]);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  async deleteUsuario(id: number): Promise<void> {
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

  async addSurvey(survey: Survey): Promise<void> {
    // Si el documento ya existe en SQLite local, actualizamos la encuesta existente para evitar duplicados
    const existing = await this.getSurveyByDocumento(survey.documento_identidad);
    if (existing && existing.id) {
      await this.updateSurvey(existing.id, {
        ...survey,
        id: existing.id
      });
      return;
    }

    const query = `
      INSERT INTO encuestas (
        encuestador_id, encuestador_usuario, tipo_documento, documento_identidad, nombres, apellidos, telefono_1, telefono_2, telefono_3,
        direccion, fecha_registro, profesion, estado_sincronizacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
      survey.estado_sincronizacion
    ];
    await this.db.run(query, values);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }

  async updateSurvey(id: number, survey: Survey): Promise<void> {
    const query = `
      UPDATE encuestas SET
        encuestador_id = ?, encuestador_usuario = ?, tipo_documento = ?, documento_identidad = ?, nombres = ?, apellidos = ?, telefono_1 = ?, telefono_2 = ?, telefono_3 = ?,
        direccion = ?, fecha_registro = ?, profesion = ?, estado_sincronizacion = ?
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
      id
    ];
    await this.db.run(query, values);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
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

  async markAsSynchronized(id: number): Promise<void> {
    const query = `UPDATE encuestas SET estado_sincronizacion = 'sincronizado' WHERE id = ?;`;
    await this.db.run(query, [id]);
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore('encuestas_db');
  }
}

export const dbService = new DatabaseService();
