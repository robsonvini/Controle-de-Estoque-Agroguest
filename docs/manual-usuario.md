# Manual do usuário — Estoque Agrogest

Este manual explica como usar o sistema no dia a dia. O que você vê no menu depende do seu
**perfil de acesso**: se faltar alguma opção, peça ao administrador.

## 1. Acesso

1. Abra o endereço do sistema e informe seu **e-mail** e sua **senha**.
2. No primeiro acesso, ou quando o administrador redefinir sua senha, o sistema pede uma senha
   nova. Ela precisa ter no mínimo 10 caracteres, com letra maiúscula, letra minúscula, número e
   símbolo.
3. Depois de 5 tentativas erradas o acesso fica bloqueado por 15 minutos. O administrador pode
   desbloquear antes, em **Usuários e permissões**.
4. Em **Minha conta** (menu no canto superior direito) você troca a senha e encerra sessões abertas
   em outros dispositivos.

> **Acessibilidade:** todo o sistema funciona pelo teclado. Ao abrir uma página, a primeira tecla
> **Tab** mostra o link _Pular para o conteúdo_. Os campos obrigatórios têm asterisco (*), e os
> erros aparecem logo abaixo do campo.

## 2. Dashboard

É a visão geral do estoque, atualizada automaticamente a cada minuto:

- **Indicadores:** produtos cadastrados, produtos disponíveis, estoque baixo, sem estoque e valor
  total do estoque (pelo custo médio).
- **Entradas e saídas:** gráfico por dia. Use **Ver dados em tabela** para os números exatos.
- **Produtos mais movimentados**, **alertas de reposição** (com sugestão de compra) e
  **pendências** (ajustes a aprovar, inventários abertos, pedidos reservados e situação da
  integração).
- **Entradas e saídas recentes.**

O sino no topo mostra as **notificações** não lidas; em vermelho, há alertas críticos.

## 3. Produtos

- **Novo produto:** informe código interno, SKU, nome, unidade de medida e, se quiser, código de
  barras, categoria, preços, estoque mínimo e máximo, localização padrão e fornecedores.
  - O **estoque mínimo** gera alertas de reposição.
  - O **estoque máximo** é usado na sugestão de compra.
- **Busca:** por nome, SKU, código interno ou **código de barras**. Leitores USB funcionam
  normalmente: posicione o cursor no campo e leia o código.
- **Detalhe do produto:**
  - saldo físico, reservado e disponível, por local;
  - histórico completo de movimentações (kardex);
  - fornecedores;
  - imagens. Toda imagem exige uma descrição curta, lida por leitores de tela.
- **Inativar** um produto (em **Editar**) impede novas entradas e novos pedidos de venda e mantém o histórico. Saídas avulsas continuam permitidas, para zerar o saldo restante.

**Situações do estoque:**

- _Disponível_: acima do mínimo.
- _Estoque baixo_: igual ou abaixo do mínimo.
- _Esgotado_: nenhum saldo disponível.

> _Reservado_ é a quantidade separada para pedidos de venda ainda não confirmados. Ela não pode
> ser usada em outras saídas.

## 4. Categorias e locais

- **Categorias:** organize os produtos em categorias e **subcategorias**, com o botão **Sub**.
  Categorias em uso não podem ser excluídas, só desativadas.
- **Estoque → Locais de armazenamento:** cadastre depósitos, áreas (corredores) e posições
  (prateleiras), indicando o local superior.
- **Estoque → Unidades de medida:** UN, KG, L, SC etc., com as casas decimais permitidas (0 para
  itens contáveis).

## 5. Entradas

Em **Entradas → Nova entrada**, escolha o motivo:

| Motivo                             | Quando usar                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Recebimento de mercadoria / Compra | Mercadoria recebida de um fornecedor, sem pedido de compra. Exige fornecedor e custo unitário |
| Devolução de cliente               | Produto que voltou de um cliente (selecione o cliente do CRM)                                 |
| Ajuste positivo                    | Correção de saldo para mais (somente gestores; exige justificativa)                           |

Informe nota fiscal, série e data quando houver. A data e a hora ficam registradas automaticamente,
mas podem ser ajustadas para o momento real do recebimento, nunca no futuro. Ao salvar, o saldo e o
**custo médio** são atualizados na hora.

> Para mercadorias de um **pedido de compra**, use **Compras → pedido → Receber mercadorias**.
> Assim o sistema controla o que ainda falta chegar.

## 6. Saídas e transferências

Em **Saídas → Nova saída**:

| Motivo                  | Observação                              |
| ----------------------- | --------------------------------------- |
| Venda                   | Opcionalmente, vincule o cliente do CRM |
| Consumo interno         | Informe o setor ou destino              |
| Perda / Avaria          | Descreva o ocorrido (obrigatório)       |
| Devolução ao fornecedor | Selecione o fornecedor                  |

O sistema **não permite** retirar mais do que o disponível no local e mostra quanto há disponível.

**Transferência** (em **Estoque** ou **Saídas**): move a quantidade de um local para outro. O
saldo total do produto não muda.

### Estorno

Movimentações registradas **não podem ser editadas nem excluídas**, para garantir a auditoria. Se
houve erro, abra a movimentação e clique em **Estornar** (somente gestores), informando a
justificativa. O sistema cria uma movimentação inversa, vinculada à original.

Saídas de pedidos de venda não são estornadas: registre uma **entrada por devolução de cliente**.

## 7. Compras

1. **Compras → Novo pedido de compra:** escolha o fornecedor, os produtos, as quantidades e os
   preços. O pedido nasce como _Rascunho_ e pode ser editado.
2. **Marcar como enviado** quando o pedido for enviado ao fornecedor.
3. **Receber mercadorias:** informe a nota fiscal, as quantidades recebidas e o local de cada item.
   O recebimento pode ser **parcial**; o pedido mostra o que ainda está pendente.
4. **Cancelar pedido:** os recebimentos já feitos são mantidos.

O histórico de compras de cada fornecedor fica em **Fornecedores → fornecedor → Histórico de
compras**.

## 8. Pedidos de venda

- Pedidos podem ser criados no sistema (**Pedidos de venda → Novo pedido**) ou chegar do **CRM**
  pela integração, identificados com a etiqueta _CRM_.
- Ao criar o pedido, a quantidade fica **reservada**.
- **Confirmar venda:** dá baixa no estoque (saída por venda). Não pode ser desfeito.
- **Cancelar pedido:** libera a reserva. Só é possível antes da confirmação.

## 9. Inventário e ajustes

1. **Inventário → Novo inventário:** escolha o local e/ou a categoria. Marque _Incluir produtos sem
   saldo_ para encontrar itens que não constam no sistema.
2. **Contagem às cegas:** registre as quantidades contadas (é possível localizar o item pelo código
   de barras) e clique em **Salvar contagens** quantas vezes precisar. O saldo do sistema fica
   oculto para não influenciar a contagem.
3. **Concluir contagem:** o sistema compara o físico com o sistema e destaca as divergências.
4. Então você pode **Recontar** ou **Solicitar ajuste das divergências**, com justificativa.
5. Um **gestor diferente de quem solicitou** aprova ou rejeita o ajuste em **Inventário → Ajustes**.
   Só com a aprovação o saldo é corrigido e o inventário finalizado.

Também é possível **solicitar um ajuste manual**, fora de inventário, com quantidade positiva
(acréscimo) ou negativa (baixa).

## 10. Fornecedores e clientes

- **Fornecedores:** dados cadastrais (CPF ou CNPJ validados), endereço, contatos, situação (ativo,
  inativo ou bloqueado), produtos fornecidos e histórico de compras. Fornecedores inativos ou
  bloqueados não podem receber novos pedidos de compra.
- **Clientes (CRM):** consulta dos clientes sincronizados do CRM, somente leitura. Cadastros e
  alterações de clientes são feitos **no CRM**.

## 11. Relatórios

Escolha o relatório, os filtros (período, produto, categoria, fornecedor, local e tipo) e clique em
**Gerar relatório**. Use **Exportar PDF** ou **Exportar Excel** para baixar o arquivo, conforme sua
permissão.

| Relatório                      | Mostra                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| Posição atual do estoque       | Saldo, reservado, disponível, mínimo, situação e valor por produto |
| Histórico de entradas e saídas | Todas as movimentações do período                                  |
| Produtos mais vendidos         | Ranking por quantidade vendida, com valor de venda e custo         |
| Produtos com baixo giro        | Produtos parados em relação às saídas, com dias de cobertura       |
| Produtos sem movimentação      | Itens sem nenhuma movimentação na janela de dias                   |
| Inventários e divergências     | Diferenças encontradas e o valor correspondente                    |
| Valor financeiro do estoque    | Valor por categoria e a participação no total                      |
| Histórico de compras           | Pedidos de compra, valores pedidos e recebidos                     |
| Perdas e ajustes               | Perdas, avarias e ajustes, com o impacto financeiro                |

## 12. Notificações e alertas

O sistema avisa automaticamente sobre:

- estoque abaixo do mínimo;
- produto esgotado;
- necessidade de reposição (com quantidade sugerida, para compras);
- movimentação fora do padrão (quantidade muito acima do normal, saída que consome quase todo o
  saldo, registro fora do horário de operação);
- divergência de inventário;
- ajuste aguardando aprovação;
- falha de sincronização com o CRM.

Os alertas de estoque se **resolvem sozinhos** quando o saldo volta ao normal. Os gestores podem
recebê-los também por e-mail (**Configurações**).

## 13. Integração com o CRM

Para administradores:

- **Visão geral e configuração:** URL do CRM, ativação, intervalo de sincronização, **Testar
  conexão** e **Sincronizar agora**.
- **Execuções e Logs:** histórico de cada sincronização e de cada chamada, com erros e tempos.
- **Eventos (webhooks):** eventos recebidos do CRM, com **Reprocessar** quando houver erro.
- **Clientes de API:** credenciais para o CRM acessar o Estoque. O segredo aparece uma única vez,
  então guarde-o com segurança.
- **Fila de processamento:** tarefas pendentes e com falha, com **Reprocessar**.

## 14. Usuários, permissões e configurações

- **Usuários:** crie usuários com senha temporária, altere o perfil, desative, redefina a senha e
  desbloqueie.
- **Perfis e permissões:** marque as permissões por módulo. Alterações valem em até 30 segundos.
- **Configurações:**
  - **Parâmetros do sistema:** regras dos alertas, horário de operação, e-mails e retenção de dados;
  - **Auditoria:** quem fez o quê, e quando;
  - **LGPD:** consulta e exportação dos dados pessoais de um titular.
