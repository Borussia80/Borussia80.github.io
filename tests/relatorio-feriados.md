# Conferência cruzada de feriados

Gerado por `tests/feriados-cruzado.mjs`. Base: `dias-uteis/feriados-br.json`. Referência: [joaopbini/feriados-brasil](https://github.com/joaopbini/feriados-brasil) (MIT), commit `f89f5bd`. Anos comparados: 2020–2026. Só entram datas de segunda a sexta.

**86 divergências** (23 grupos). A coluna "Classificação" vem de `tests/feriados-divergencias.json`.

| UF | Feriado | Lado | Anos | Classificação |
| --- | --- | --- | --- | --- |
| AC | Alusivo ao Dia Internacional da Mulher | só na nossa base | 2021, 2022, 2023 | Mantido. Decretos do AC listam 8 de março como feriado estadual; o date-holidays aplica a transferência prevista na Lei AC 2.126/2009. |
| AC | Dia da Amazônia | só na referência | 2022, 2023, 2024 | Transferência anual (Lei AC 2.126/2009) calculada de forma diferente nas duas bases. Mantido o date-holidays; confirmar no decreto do ano. |
| AC | Dia da Amazônia | só na nossa base | 2022, 2023, 2024 | Transferência anual (Lei AC 2.126/2009) calculada de forma diferente nas duas bases. Mantido o date-holidays; confirmar no decreto do ano. |
| AC | Dia da Mulher | só na referência | 2021, 2022, 2023 | Mesma data com transferência anual diferente nas duas bases. Mantido o date-holidays. |
| AC | Dia do Católico | só na referência | 2026 | Data legal 20/01 (Lei AC 3.137/2016). Em 2026 o decreto adiou a comemoração para 22/01; transferências anuais por decreto não são modeladas. |
| AC | Dia do Católico | só na nossa base | 2026 | Data legal 20/01 (Lei AC 3.137/2016). Em 2026 o decreto adiou a comemoração para 22/01; transferências anuais por decreto não são modeladas. |
| AC | Revolução Acreana | só na referência | 2020, 2021, 2024, 2025, 2026 | Ponto facultativo nos decretos do AC (ex.: Decreto 11.808/2025), não feriado. Referência errada. |
| AP | Dia da Consciência Negra | só na referência | 2020, 2023 | Anos anteriores à lei nacional (Lei 14.759/2023). Histórico, sem efeito em prazos atuais. Não ajustado. |
| AP | Dia do Evangélico | só na referência | 2020, 2021, 2022, 2023, 2026 | Uma fonte de imprensa cita 30/11 em Macapá; sem lei estadual localizada. A revisar. |
| AP | N. Sra. Conceição | só na referência | 2020, 2021, 2022, 2023, 2025 | 8/12 é feriado municipal em Macapá; estadual só no AM e no MA. Referência errada. |
| ES | Aniversário do Estado | só na referência | 2026 | Só em 2026 na referência. A revisar. |
| ES | Dia de Nossa Senhora da Penha | só na nossa base | 2020, 2021, 2022, 2023, 2024, 2025, 2026 | Data móvel (8 dias após a Páscoa), também no feriados-dev-oss. Mantido. |
| GO | Fundação da Cidade de Goiás | só na nossa base | 2021, 2022, 2023, 2024 | Feriado estadual pela Lei GO 10.460/1988 (TJGO e Governo de Goiás). Referência incompleta. |
| GO | Lançamento da pedra fundamental de Goiânia | só na nossa base | 2022, 2023, 2024, 2025 | Feriado estadual para órgãos do estado pela Lei GO 10.460/1988 (Governo de Goiás). Mantido. |
| MA | Consciência Negra | só na referência | 2020, 2023 | Anos anteriores à lei nacional (Lei 14.759/2023). Histórico, sem efeito em prazos atuais. Não ajustado. |
| MA | Nossa Senhora da Conceição | só na nossa base | 2020, 2021, 2022, 2023, 2025, 2026 | Adicionado por ajuste: feriado estadual no MA (imprensa). Ausente na referência. |
| PA | N. Sra. Conceição | só na referência | 2020, 2021, 2022, 2023, 2025, 2026 | 8/12 é feriado municipal em Belém; estadual só no AM e no MA. Referência errada. |
| PE | Dia de São João | só na referência | 2020, 2021, 2022, 2024, 2025, 2026 | Não é feriado estadual: a Lei PE 16.241/2017 só prevê a Data Magna. É municipal em Recife e outras cidades. Referência errada. |
| PR | Emancipação política do estado do Paraná | só na nossa base | 2022, 2023, 2024, 2025 | 19/12, também no feriados-dev-oss. Mantido; confirmar lei estadual. |
| RR | Dia da Consciência Negra | só na referência | 2020, 2023 | Anos anteriores à lei nacional (Lei 14.759/2023). Histórico, sem efeito em prazos atuais. Não ajustado. |
| SC | Dia de Santa Catarina | só na referência | 2020, 2021, 2022, 2023, 2025, 2026 | 11/08 é transferido para o domingo seguinte (Lei SC 17.335/2017). Nossa base está certa. |
| SP | Dia da Consciência Negra | só na nossa base | 2023 | 2023, antes da vigência da lei nacional. Histórico. Não ajustado. |
| TO | Autonomia do Estado | só na nossa base | 2020, 2021, 2022, 2024, 2025, 2026 | 18/03, também no feriados-dev-oss. Mantido. |
