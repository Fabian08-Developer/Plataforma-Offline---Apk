import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoPosibleDuplicado } from './duplicados';

test('cédula con 1 dígito de diferencia es posible duplicado (alto)', () => {
  const m = motivoPosibleDuplicado('1000000001', 'Ana Ruiz', '1000000002', 'Pedro Gomez');
  assert.equal(m?.nivel, 'high');
});

test('nombre idéntico con cédula distinta es posible duplicado (alto)', () => {
  const m = motivoPosibleDuplicado('1000000001', 'Maria Lopez', '9123456789', 'Maria Lopez');
  assert.equal(m?.nivel, 'high');
});

test('nombre con 3 caracteres de diferencia SÍ es posible duplicado (caso que faltaba en la bandeja)', () => {
  const m = motivoPosibleDuplicado('1000000001', 'Jose Luis Martinez', '9123456789', 'Joze Luiz Martines');
  assert.ok(m, 'debe detectarse');
  assert.equal(m?.nivel, 'medium');
});

test('personas distintas no son posible duplicado', () => {
  assert.equal(motivoPosibleDuplicado('1000000001', 'Ana Ruiz Mora', '9123456789', 'Carlos Perez Diaz'), null);
});

test('nombres cortos no se comparan por similitud', () => {
  assert.equal(motivoPosibleDuplicado('1000000001', 'Eva', '9123456789', 'Eva'), null);
});
