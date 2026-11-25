// Testes do motor de dias úteis (lib/dias-uteis.js) e da base dias-uteis/feriados-br.json.
// Uso: node tests/dias-uteis.test.mjs
// O teste roda a si mesmo em três fusos (TZ) e exige o mesmo resultado: prova de que o cálculo não depende do fuso.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as M from '../lib/dias-uteis.js';

const dados = JSON.parse(readFileSync(new URL('../dias-uteis/feriados-br.json', import.meta.url), 'utf8'));
const BA = M.criarCalendario(dados, { uf: 'BA' });
const SP = M.criarCalendario(dados, { uf: 'SP' });
const BAc = M.criarCalendario(dados, { uf: 'BA', cinzasNaoUtil: true });
const nome = (cal, d) => M.feriadoEm(d, cal)?.nome;

// Assinatura comparada entre fusos (o processo filho só calcula isto e sai).
const assinatura = [M.somarDiasUteis('2026-11-19', 1, BA), M.somarDiasUteis('2026-12-31', 1, BA), M.contarDiasUteis('2020-01-01', '2035-12-31', BA), M.diaDaSemana('2026-07-02')].join('|');
if (process.env.QB_TZ_FILHO) { process.stdout.write(assinatura); process.exit(0); }

// ---- Base de feriados: casos conhecidos ----
assert.equal(dados.anos[0], 2020); assert.equal(dados.anos[1], 2035);
assert.equal(Object.keys(dados.uf).length, 27);
assert.match(dados.licenca, /CC BY-SA 4\.0/);
const tipo = (cal, d) => M.feriadoEm(d, cal)?.tipo;
// 2026
assert.equal(tipo(BA, '2026-04-03'), 'n', 'Sexta-feira Santa 2026');
assert.equal(tipo(BA, '2026-02-16'), 'f'); assert.equal(tipo(BA, '2026-02-17'), 'f', 'Carnaval 2026 tratado como feriado');
assert.equal(tipo(BA, '2026-02-18'), 'c', 'Quarta-feira de Cinzas 2026');
assert.equal(nome(BA, '2026-02-18'), 'Quarta-feira de Cinzas');
assert.equal(tipo(BA, '2026-06-04'), 'f'); assert.equal(nome(BA, '2026-06-04'), 'Corpus Christi');
assert.equal(tipo(BA, '2026-11-20'), 'n', 'Consciência Negra nacional');
assert.equal(M.diaDaSemana('2026-11-20'), 5, '20/11/2026 é sexta');
assert.equal(tipo(BA, '2026-07-02'), 'e'); assert.equal(M.diaDaSemana('2026-07-02'), 4, '2 de Julho de 2026 é quinta');
assert.equal(tipo(SP, '2026-07-02'), undefined, '2 de Julho não vale em SP');
// 2027
assert.equal(tipo(BA, '2027-03-26'), 'n', 'Sexta-feira Santa 2027');
assert.equal(tipo(BA, '2027-02-08'), 'f'); assert.equal(tipo(BA, '2027-02-09'), 'f');
assert.equal(tipo(BA, '2027-05-27'), 'f', 'Corpus Christi 2027');
// Consciência Negra só é nacional a partir de 21/12/2023
assert.equal(dados.nacional['2023'].some(([d]) => d === '2023-11-20'), false);
assert.equal(dados.nacional['2024'].some(([d]) => d === '2024-11-20'), true);
// Ajustes com fonte
const pe = M.criarCalendario(dados, { uf: 'PE' });
assert.equal(nome(pe, '2026-03-06'), 'Data Magna de Pernambuco');
assert.equal(M.feriadoEm('2026-03-01', pe), null, 'PE não usa mais o 1º domingo de março');
assert.equal(M.feriadoEm('2026-06-24', pe), null, 'São João não é feriado estadual em PE');
const ac = M.criarCalendario(dados, { uf: 'AC' });
assert.equal(nome(ac, '2026-01-20'), 'Dia do Católico'); assert.equal(nome(ac, '2026-01-23'), 'Dia do Evangélico');

// ---- Motor: casos do plano ----
assert.equal(M.somarDiasUteis('2026-11-19', 1, BA), '2026-11-23', 'pula a Consciência Negra e o fim de semana');
assert.equal(M.somarDiasUteis('2026-02-13', 1, BA), '2026-02-18', 'pula o Carnaval; Cinzas é útil');
assert.equal(M.somarDiasUteis('2026-02-13', 1, BAc), '2026-02-19', 'com Cinzas não útil');
assert.equal(M.somarDiasUteis('2026-06-03', 1, BA), '2026-06-05', 'pula Corpus Christi');
assert.equal(M.contarDiasUteis('2026-07-01', '2026-07-03', BA, { incluirInicio: true }), 2, '2 de Julho na BA');
assert.equal(M.contarDiasUteis('2026-07-01', '2026-07-03', SP, { incluirInicio: true }), 3, 'SP sem o 2 de Julho');
assert.equal(M.somarDiasUteis('2026-12-31', 1, BA), '2027-01-04', 'virada de ano: 01/01 feriado, 02 e 03 fim de semana');
assert.equal(M.feriadoEm('2028-02-29', BA)?.tipo, 'f', '29/02/2028 é terça de Carnaval (Páscoa em 16/04/2028)');
assert.equal(M.ehDiaUtil('2028-03-01', BA), true, 'Cinzas 2028 útil por padrão');
assert.throws(() => M.paraDia('2027-02-29'), RangeError);
assert.equal(M.somarDiasUteis('2026-11-21', 0, BA), '2026-11-21', 'N = 0');
assert.equal(M.somarDiasUteis('2026-11-21', 1, BA), '2026-11-23', 'início no sábado');
assert.equal(M.somarDiasUteis('2026-11-21', 1, BA, { incluirInicio: true }), '2026-11-23', 'sábado não conta mesmo incluído');
assert.equal(M.somarDiasUteis('2026-11-23', 1, BA, { incluirInicio: true }), '2026-11-23');
assert.equal(M.somarDiasUteis('2026-11-23', -1, BA), '2026-11-19', 'subtrair');
assert.equal(M.contarDiasUteis('2026-11-23', '2026-11-19', BA), -1, 'intervalo invertido');
assert.equal(M.diasCorridos('2026-01-01', '2027-01-01'), 365);
assert.throws(() => M.somarDiasUteis('2035-12-28', 10, BA), /2020 a 2035/);
const extra = M.criarCalendario(dados, { uf: 'BA', extras: [{ data: '24/12/2026', nome: 'Recesso' }] });
assert.equal(M.ehDiaUtil('2026-12-24', extra), false); assert.equal(M.ehDiaUtil('2026-12-24', BA), true);
assert.equal(M.lerData('5/3/2026'), '2026-03-05'); assert.equal(M.lerData('31/02/2026'), null); assert.equal(M.formatarData('2026-03-05'), '05/03/2026');
const resumo = M.resumoDoAno(2026, BA);
assert.equal(resumo.meses.length, 12);
assert.equal(resumo.total, resumo.meses.reduce((s, m) => s + m.uteis, 0));
const fer = M.feriadosNoPeriodo('2026-02-14', '2026-02-18', BA);
assert.deepEqual(fer.map(f => [f.data, f.naoUtil]), [['2026-02-16', true], ['2026-02-17', true], ['2026-02-18', false]]);

// ---- Propriedades (10 mil casos por UF, gerador determinístico) ----
let semente = 20261125;
const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
const ini = M.paraDia('2020-03-01'), fim = M.paraDia('2035-09-30');
let casos = 0;
for (const uf of Object.keys(dados.uf)) {
  const cal = M.criarCalendario(dados, { uf, cinzasNaoUtil: rnd() < 0.5 });
  for (let i = 0; i < 10000; i++) {
    const d = M.deDia(ini + Math.floor(rnd() * (fim - ini)));
    const n = 1 + Math.floor(rnd() * 60);
    const incluirInicio = rnd() < 0.3;
    const r = M.somarDiasUteis(d, n, cal, { incluirInicio });
    assert.ok(M.ehDiaUtil(r, cal), `resultado útil (${uf} ${d} +${n})`);
    assert.equal(M.contarDiasUteis(d, r, cal, { incluirInicio }), n, `contar(somar) = n (${uf} ${d} +${n})`);
    if (!incluirInicio && M.ehDiaUtil(d, cal)) assert.equal(M.somarDiasUteis(r, -n, cal), d, `subtrair desfaz somar (${uf} ${d} ${n})`);
    casos++;
  }
}

// ---- Desempenho ----
const t0 = performance.now();
const total = M.contarDiasUteis('2020-01-01', '2035-12-31', BA);
const ms = performance.now() - t0;
assert.ok(total > 3800 && total < 4100, `dias úteis 2020–2035: ${total}`);
assert.ok(ms < 50, `contagem de 16 anos em ${ms.toFixed(1)} ms`);

// ---- Independência do fuso ----
for (const tz of ['America/Bahia', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: tz, QB_TZ_FILHO: '1' } }).toString();
  assert.equal(out, assinatura, `fuso ${tz}`);
}

console.log(`Dias úteis: base, casos do plano, ${casos.toLocaleString('pt-BR')} casos de propriedade, desempenho (${ms.toFixed(1)} ms) e 5 fusos: OK`);
