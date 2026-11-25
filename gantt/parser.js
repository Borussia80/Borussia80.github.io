// Mini-Gantt — leitura da lista de tarefas (sem DOM). Testado em tests/gantt.test.mjs.
//
// Uma tarefa por linha:   Tarefa; início; duração; dependências
//   - separador: ponto e vírgula ou tabulação (colar do Excel funciona);
//   - início: DD/MM/AAAA ou AAAA-MM-DD; vazio = logo depois das dependências (ou no início do projeto);
//   - duração: "10du" ou "10" (dias úteis), "10d" (dias corridos), "0" (marco);
//   - dependências: nomes de outras tarefas separados por vírgula ("Projeto básico, Compra").
// Linhas vazias e linhas que começam com # são ignoradas. Um cabeçalho "Tarefa; Início; ..." na primeira linha também.

import { lerData, formatarData } from '../lib/dias-uteis.js';

export const LIMITE_TAREFAS = 500;
export const LIMITE_DURACAO = 3650;
const RE_DURACAO = /^(\d{1,4})\s*(du|d)?$/i;

/** Chave de comparação de nomes: sem acento, sem caixa, espaços normalizados. */
export function chave(nome) {
  return String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function separar(linha) {
  const sep = linha.includes('\t') ? '\t' : ';';
  return linha.split(sep).map(c => c.trim().replace(/^"(.*)"$/, '$1').trim());
}

/**
 * Lê o texto. Devolve { tarefas, erros }; erros têm { linha, msg } com o número da linha no texto.
 * Cada tarefa: { id, linha, nome, inicio: ISO | null, duracao, unidade: 'du' | 'd', deps: [id] }.
 */
export function lerLista(texto) {
  const tarefas = [], erros = [];
  const porChave = new Map();
  const pendentes = [];
  const linhas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  linhas.forEach((bruta, i) => {
    const n = i + 1;
    const linha = bruta.trim();
    if (!linha || linha.startsWith('#')) return;
    const [nome = '', ini = '', dur = '', deps = '', ...resto] = separar(linha);
    if (!tarefas.length && !erros.length && chave(nome) === 'tarefa') return; // cabeçalho
    if (resto.some(Boolean)) erros.push({ linha: n, msg: 'colunas demais (use: tarefa; início; duração; dependências)' });
    if (!nome) { erros.push({ linha: n, msg: 'falta o nome da tarefa' }); return; }
    if (nome.length > 120) { erros.push({ linha: n, msg: 'nome com mais de 120 caracteres' }); return; }
    const k = chave(nome);
    if (porChave.has(k)) { erros.push({ linha: n, msg: `tarefa repetida: "${nome}" (já está na linha ${porChave.get(k).linha})` }); return; }
    let inicio = null;
    if (ini) { inicio = lerData(ini); if (!inicio) { erros.push({ linha: n, msg: `data de início inválida: "${ini}" (use DD/MM/AAAA)` }); return; } }
    const m = RE_DURACAO.exec(dur.replace(/\s+/g, ' '));
    if (!m) { erros.push({ linha: n, msg: dur ? `duração inválida: "${dur}" (ex.: 10du, 10d ou 0)` : 'falta a duração (ex.: 10du)' }); return; }
    const duracao = +m[1];
    if (duracao > LIMITE_DURACAO) { erros.push({ linha: n, msg: `duração acima de ${LIMITE_DURACAO} dias` }); return; }
    const unidade = (m[2] || 'du').toLowerCase();
    if (tarefas.length >= LIMITE_TAREFAS) { erros.push({ linha: n, msg: `limite de ${LIMITE_TAREFAS} tarefas` }); return; }
    const t = { id: `t${tarefas.length + 1}`, linha: n, nome, inicio, duracao, unidade, deps: [] };
    tarefas.push(t); porChave.set(k, t);
    if (deps) pendentes.push([t, deps.split(',').map(s => s.trim()).filter(Boolean)]);
  });
  for (const [t, nomes] of pendentes) {
    for (const d of nomes) {
      const alvo = porChave.get(chave(d));
      if (!alvo) erros.push({ linha: t.linha, msg: `dependência não encontrada: "${d}"` });
      else if (alvo === t) erros.push({ linha: t.linha, msg: 'a tarefa depende dela mesma' });
      else if (!t.deps.includes(alvo.id)) t.deps.push(alvo.id);
    }
  }
  erros.sort((a, b) => a.linha - b.linha);
  return { tarefas, erros };
}

/** Escreve a lista de volta em texto (mesmo formato), por exemplo depois de arrastar uma barra. */
export function escreverLista(tarefas) {
  const nomes = new Map(tarefas.map(t => [t.id, t.nome]));
  const cab = 'Tarefa; Início; Duração; Dependências';
  return [cab, ...tarefas.map(t => [
    t.nome,
    t.inicio ? formatarData(t.inicio) : '',
    t.duracao === 0 ? '0' : `${t.duracao}${t.unidade}`,
    t.deps.map(d => nomes.get(d)).filter(Boolean).join(', ')
  ].join('; ').replace(/(; )+$/, ''))].join('\n') + '\n';
}
