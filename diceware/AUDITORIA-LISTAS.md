# Auditoria das listas Diceware

## Conclusão

A auditoria de 28/10/2026 reprovou as duas listas que o app usava: a ULIF PT-BR tinha 3.735 pares a uma edição de distância e termos vulgares, e a antiga compacta inspirada no estudo da Unicamp tinha 508 pares a distância 1 e continha `merda`. O processo que gerou a compacta antiga não estava no repositório.

As duas listas foram refeitas por um pipeline reproduzível (`tools/`), com as mesmas regras e um validador independente. O app oferece só as duas listas auditadas: a **Completa, de 7.776 palavras** (padrão), e a **Curta, de 1.296 palavras**. A ULIF foi retirada do app; o arquivo `wordlist-pt-br-ULIF.txt` fica no repositório só como evidência desta auditoria. A compacta antiga foi arquivada fora do repositório.

Selo das listas novas: **auditada (estrutural) + curadoria semântica por proxy automático**.

## Critérios e resultado

| Critério | Completa 7.776 | Curta 1.296 | ULIF (retirada do app) |
|---|---|---|---|
| Tamanho exato (6⁵ / 6⁴) | ✅ 7.776 | ✅ 1.296 | ✅ 7.776 |
| Palavras únicas | ✅ | ✅ | ✅ |
| Só `a–z`, sem acentos | ✅ | ✅ | ✅ |
| Comprimento | ✅ 4–9 letras (média 7,38) | ✅ 4–7 letras (média 5,925) | — |
| Pares a distância de Levenshtein 1 | ✅ 0 | ✅ 0 | ❌ 3.735 |
| Pares a distância 2 (informativo) | 20.381 | 3.518 | 52.020 |
| Nenhuma palavra é prefixo de outra | ✅ 0 colisões | ✅ 0 colisões | ✅ 0 |
| Blacklist (exata + raiz ancorada) | ✅ 0 ocorrências | ✅ 0 ocorrências | ❌ termos vulgares |
| Toda palavra é verbete do léxico acentuado | ✅ | ✅ | — |
| Classes gramaticais (DELAS) | substantivo, adjetivo, advérbio, verbo | substantivo, adjetivo, advérbio | — |
| Sílabas estimadas (Pyphen pt_BR) | — | 2–3 | — |
| Frequência (ICF máximo selecionado; corte 18,5) | 16,69 | 12,27 | — |
| Ordem alfabética | ✅ | ✅ | ✅ |
| Amostra de controle com reprovação semântica | 0,00% | 0,00% | — |
| SHA-256 (uma palavra por linha, LF) | `343edfbb52f536542885d3eb7324bd5ac678cf0b4b2e3e9a6c0588df68e668ae` | `cfdfecdd6d773ac4b3ea8e177469986630adee591508a55a1da41ca0e6609df1` | — |

Os números das listas novas vêm de `build/relatorio.json` e de `tools/validate_lists.py`. Os da ULIF vêm do mesmo validador rodado sobre `wordlist-pt-br-ULIF.txt`.

## Como as listas são geradas

1. **Fontes fixadas** (`tools/sources.lock.json`, por commit e SHA-256; `tools/fetch_sources.py` baixa para `data/raw/`, fora do git):
   - [fserb/pt-br](https://github.com/fserb/pt-br) @93ba2a6 (MIT): léxico acentuado e frequência ICF (menor = mais comum). O ICF é convertido para inteiro exato (`ICF × 10⁸`, `Decimal`).
   - [DELAS / unitex-pt-br](https://github.com/datasets-br/unitex-pt-br) @e361443 (LGPLLR): classes gramaticais; formas marcadas como nome próprio não contam.
   - [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) pt @5faf2ba (CC-BY-4.0): semente da blacklist.
2. **Funil** (`tools/build_lists.py`), com contagens em `build/relatorio.json`:

   | Etapa | 7.776 (antes → depois) | 1.296 (antes → depois) |
   |---|---|---|
   | só `a–z` minúsculo | 145.744 → 104.073 | 145.744 → 104.073 |
   | comprimento | → 58.956 | → 27.272 |
   | classe gramatical | → 25.913 | → 8.948 |
   | sílabas 2–3 | — | → 8.530 |
   | blacklist | → 22.820 | → 6.948 |
   | frequência (ICF ≤ 18,5) | → 15.007 | → 6.010 |
   | seleção gulosa | → 7.776 | → 1.296 |

3. **Seleção gulosa determinística:** percorre as candidatas por ICF crescente, depois comprimento e ordem alfabética, e aceita uma palavra só se ela não estiver a distância 1 de nenhuma já aceita e não tiver relação de prefixo com nenhuma. Se as candidatas acabassem antes de N, o build falharia em vez de completar fora da regra. As duas listas são selecionadas de forma independente: **a compacta não é subconjunto da lista de 7.776**.
4. **Blacklist** (`data/blacklist.txt`): match exato ou raiz `xxx*` ancorada no início, nunca substring livre. Tem seções manuais (palavrões, insultos, termos sexuais, ofensas, violência, drogas, marcas) e um bloco gerado pela revisão semântica.
5. **Revisão semântica** (`tools/revisao.py`): três juízes automáticos revisaram as listas inteiras. Uma palavra sai se qualquer um a reprovar, por um destes motivos: vulgar ou ofensiva, sensível, nome próprio, estrangeirismo, arcaica ou rara. As reprovadas entram no bloco gerado da blacklist, o build preenche as vagas com as próximas candidatas e o ciclo se repete até não restar palavra pendente. No total foram 2.983 reprovações: 110 vulgares, 586 sensíveis, 193 nomes próprios, 325 estrangeirismos e 1.769 arcaicas ou raras.
6. **Amostra de controle** (`tools/amostra.py`): por lista, 200 palavras sorteadas com semente fixa e as 100 menos frequentes, julgadas à parte (`data/amostra-julgamentos.csv`). A taxa de reprovação caiu conforme os juízes foram acrescentados:

   | Etapa | 7.776 | 1.296 |
   |---|---:|---:|
   | Primeira amostra | 11,00% | 3,67% |
   | Só o juiz 1 | 5,67% | 2,00% |
   | Juízes 1 + 2 | 3,33% | 0,67% |
   | Juízes 1 + 2 + 3 (semente 20261030) | 0,00% | 0,00% |

### Reproduzir

```sh
python3 tools/fetch_sources.py
python3 tools/build_lists.py
python3 tools/validate_lists.py build/lista-7776.txt --expect-size 7776 --max-len 9 --blacklist data/blacklist.txt --accented-lexicon data/raw/lexico-headwords.txt
python3 tools/validate_lists.py build/lista-1296.txt --expect-size 1296 --max-len 7 --blacklist data/blacklist.txt --accented-lexicon data/raw/lexico-headwords.txt
python3 -m unittest tools/test_pipeline.py
python3 tools/gerar_wordlists.py
```

O Pyphen (`pip install --user pyphen`) e o RapidFuzz são necessários para o build. O `wordlists.js` do app é gerado pelo último comando e não deve ser editado à mão.

## Matemática usada no app

A seleção de palavras é uniforme e usa `log2(N)` bits por palavra. Como 7.776 = 6⁵ e 1.296 = 6⁴, ambas as listas usam exatamente o número de dados mostrado e não descartam combinações.

| Lista | Palavras | Bits/palavra | Dados/palavra | Palavras para pelo menos 77 bits |
|---|---:|---:|---:|---:|
| Completa | 7.776 | 12,924813 | 5 | 6 |
| Curta | 1.296 | 10,339850 | 4 | 8 |

A frequência lexical só ordena a seleção fixa da lista; não altera a entropia por palavra quando o sorteio é uniforme. O indicador do app mede os bits das escolhas de palavras e não contabiliza as alterações visuais de compatibilidade (maiúscula, número ou símbolo) como ganho de entropia.

## Limitações declaradas

- **Arcaísmo e raridade por proxy de frequência.** O corte de ICF e a revisão aproximam "palavra conhecida", mas não medem memorizabilidade em usuários reais.
- **Blacklist sem revisão humana especializada.** A blacklist foi montada a partir de uma lista pública e expandida de forma automática; não passou por revisão de linguistas nem de pessoas dos grupos afetados.
- **Juízes e amostra são modelos de IA, não falantes nativos.** A revisão semântica e a amostra de controle foram feitas por modelos de IA. A amostra tem 300 palavras por lista, então 0% na amostra não garante 0% na lista inteira.
- **Excesso de rigor.** A regra de união (basta um juiz reprovar) eliminou também palavras comuns e inofensivas, como `gordo`, `louco`, `tumor`, `pizza` e `cerveja`. Isso reduz a naturalidade, mas não afeta a segurança.
- **Sílabas estimadas pela hifenização ortográfica** do Pyphen pt_BR, não pela fonética.
- **Sem acentos:** palavras que existem com e sem acento (`pais`/`país`) entram apenas na forma sem acento, desde que ela própria seja verbete do léxico.

## Licença das listas

As listas geradas (`build/lista-7776.txt`, `build/lista-1296.txt` e as chaves `audit7776` e `audit1296` do `wordlists.js`) derivam das classes gramaticais do DELAS e são distribuídas sob a **LGPLLR**. O léxico e a frequência do fserb/pt-br são MIT; a semente da blacklist (LDNOOBW) é CC-BY-4.0.

## Listas anteriores

- **ULIF PT-BR** ([ulif/diceware](https://github.com/ulif/diceware)): reprovada na auditoria e retirada do app; `wordlist-pt-br-ULIF.txt` fica no repositório só para reproduzir os números acima.
- **Compacta inspirada no estudo da Unicamp:** 1.296 palavras derivadas de ULIF e Dadoware com filtros inspirados no [resumo do estudo da Unicamp (2017)](https://prp.unicamp.br/inscricao-congresso/resumos/2017P12955A29239O2218.pdf), que não publica os verbetes. Reprovada na auditoria e arquivada fora do repositório (SHA-256 `d505b9b01f1c3a27089941652491ac696899c24b287818cae162d9dcc4b819d2`).
