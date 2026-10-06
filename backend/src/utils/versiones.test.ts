import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararVersiones } from './versiones';

test('compararVersiones ordena por partes numéricas, no como texto', () => {
  assert.ok(compararVersiones('1.10.0', '1.9.0') > 0);
  assert.ok(compararVersiones('1.2.0', '1.1.0') > 0);
  assert.ok(compararVersiones('1.1.0', '1.2.0') < 0);
  assert.equal(compararVersiones('1.2.0', '1.2.0'), 0);
});

test('compararVersiones trata versiones con distinto número de partes', () => {
  assert.equal(compararVersiones('1.2', '1.2.0'), 0);
  assert.ok(compararVersiones('1.2.1', '1.2') > 0);
});

test('compararVersiones: 3.0.1 es mayor que 1.2.0 (caso real del panel)', () => {
  assert.ok(compararVersiones('3.0.1', '1.2.0') > 0);
});
