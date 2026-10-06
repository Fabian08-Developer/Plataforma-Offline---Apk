import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitarPeticiones } from './rateLimit';

function simularRespuesta() {
  const headers: Record<string, string> = {};
  return {
    estado: 200,
    cuerpo: undefined as unknown,
    setHeader(nombre: string, valor: string) {
      headers[nombre] = valor;
    },
    status(codigo: number) {
      this.estado = codigo;
      return this;
    },
    json(cuerpo: unknown) {
      this.cuerpo = cuerpo;
      return this;
    },
    headers,
  };
}

test('limitarPeticiones deja pasar hasta el máximo y luego responde 429', () => {
  const limite = limitarPeticiones({
    ventanaMs: 60_000,
    maximo: 2,
    clave: () => 'misma-clave',
    mensaje: 'bloqueado',
  });

  const pasadas: number[] = [];
  const res = simularRespuesta();
  for (let i = 0; i < 3; i++) {
    limite({ ip: '1.1.1.1' } as any, res as any, () => pasadas.push(i));
  }

  assert.deepEqual(pasadas, [0, 1]);
  assert.equal(res.estado, 429);
  assert.deepEqual(res.cuerpo, { error: 'bloqueado' });
  assert.ok(Number(res.headers['Retry-After']) > 0);
});

test('limitarPeticiones cuenta por clave: otra clave no se ve afectada', () => {
  const limite = limitarPeticiones({
    ventanaMs: 60_000,
    maximo: 1,
    clave: (req) => String((req as any).ip),
    mensaje: 'bloqueado',
  });

  let pasadas = 0;
  const res = simularRespuesta();
  limite({ ip: 'a' } as any, res as any, () => pasadas++);
  limite({ ip: 'a' } as any, res as any, () => pasadas++);
  limite({ ip: 'b' } as any, res as any, () => pasadas++);

  assert.equal(pasadas, 2);
});
