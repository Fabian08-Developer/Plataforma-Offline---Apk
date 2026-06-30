import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

export interface Survey {
  id?: number;
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

  constructor() {
  }

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

      await this.db.execute('DROP TABLE IF EXISTS encuestas;');

      const schema = `
        CREATE TABLE IF NOT EXISTS encuestas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing SQLite database:', error);
      throw error;
    }
  }

  async addSurvey(survey: Survey): Promise<void> {
    const query = `
      INSERT INTO encuestas (
        tipo_documento, documento_identidad, nombres, apellidos, telefono_1, telefono_2, telefono_3,
        direccion, fecha_registro, profesion, estado_sincronizacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const values = [
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
        tipo_documento = ?, documento_identidad = ?, nombres = ?, apellidos = ?, telefono_1 = ?, telefono_2 = ?, telefono_3 = ?,
        direccion = ?, fecha_registro = ?, profesion = ?, estado_sincronizacion = ?
      WHERE id = ?;
    `;
    const values = [
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
