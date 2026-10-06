import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levenshtein, levenshteinAcotada, mergePhones, normalizeText } from './textUtils';

test('normalizeText quita tildes, mayúsculas y espacios sobrantes', () => {
  assert.equal(normalizeText('  José   PÉREZ  '), 'jose perez');
});

test('levenshteinAcotada coincide con levenshtein cuando la distancia está dentro del umbral', () => {
  const pares: Array<[string, string]> = [
    ['123456', '123457'],
    ['123456', '12345'],
    ['juan perez', 'juan peres'],
    ['abc', 'abc'],
    ['', 'ab'],
  ];
  for (const [a, b] of pares) {
    const exacta = levenshtein(a, b);
    if (exacta <= 3) {
      assert.equal(levenshteinAcotada(a, b, 3), exacta, `${a} vs ${b}`);
    }
  }
});

test('levenshteinAcotada devuelve max+1 cuando la distancia supera el umbral', () => {
  assert.equal(levenshteinAcotada('1000', '9999', 2), 3);
  assert.equal(levenshteinAcotada('abcdef', 'x', 2), 3); // diferencia de longitud
});

test('levenshteinAcotada es consistente con levenshtein en cadenas aleatorias', () => {
  const alfabeto = 'abcd';
  const aleatoria = (n: number) => Array.from({ length: n }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join('');
  for (let i = 0; i < 500; i++) {
    const a = aleatoria(Math.floor(Math.random() * 8));
    const b = aleatoria(Math.floor(Math.random() * 8));
    const exacta = levenshtein(a, b);
    const acotada = levenshteinAcotada(a, b, 2);
    if (exacta <= 2) {
      assert.equal(acotada, exacta, `${a} vs ${b}`);
    } else {
      assert.equal(acotada, 3, `${a} vs ${b}`);
    }
  }
});

test('mergePhones prioriza los teléfonos nuevos y elimina duplicados (máximo 3)', () => {
  assert.deepEqual(mergePhones(['300', '', '311'], ['311', '320', '330']), ['300', '311', '320']);
  assert.deepEqual(mergePhones([undefined, undefined, undefined], ['320', '', '']), ['320', '', '']);
});
