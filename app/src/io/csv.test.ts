import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSubtasks, joinList, parseCsv, parseSubtasks, splitList, toCsv } from './csv.ts';

test('parseCsv handles quotes, escapes, multiline and CRLF', () => {
  assert.deepEqual(parseCsv('a,"b, ""c""",d\n'), [['a', 'b, "c"', 'd']]);
  assert.deepEqual(parseCsv('a,"x\ny",\r\n1,2,3'), [['a', 'x\ny', ''], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('﻿h\n""\n'), [['h'], ['']]);
  assert.throws(() => parseCsv('a,"b'));
  assert.throws(() => parseCsv('a,b"c"'));
  assert.throws(() => parseCsv('"a"b,c'));
});

test('toCsv round trips through parseCsv', () => {
  const rows = [{ a: 'x, "y"', b: 'l1\nl2', c: null, d: true, e: 'p;q|r' }, { a: 3 }];
  const text = toCsv(rows, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(parseCsv(text), [['a', 'b', 'c', 'd', 'e'], ['x, "y"', 'l1\nl2', '', 'true', 'p;q|r'], ['3', '', '', '', '']]);
});

test('list and subtask escapes', () => {
  assert.deepEqual(splitList('Setup\\; VMs ; HDFS problems;'), ['Setup; VMs', 'HDFS problems']);
  assert.deepEqual(parseSubtasks('Read "x, y"|25; Pipes \\| filters|25'), [{ name: 'Read "x, y"', plan_min: 25 }, { name: 'Pipes | filters', plan_min: 25 }]);
  assert.throws(() => parseSubtasks('Recap'));
  assert.throws(() => parseSubtasks('Recap|ten'));
  const subs = [{ name: 'a;b', plan_min: 5 }, { name: 'c|d', plan_min: 10 }];
  assert.deepEqual(parseSubtasks(formatSubtasks(subs)), subs);
  assert.deepEqual(splitList(joinList(['x;y', 'z'])), ['x;y', 'z']);
  assert.deepEqual(parseSubtasks(''), []);
});
