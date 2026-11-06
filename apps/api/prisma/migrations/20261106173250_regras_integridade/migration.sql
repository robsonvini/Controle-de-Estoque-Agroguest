-- =====================================================================
-- Regras de integridade que não são expressas no schema Prisma:
-- CHECKs, índices únicos parciais, triggers de imutabilidade e views.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restrições de domínio (CHECK)
-- ---------------------------------------------------------------------

-- Saldo nunca negativo e reserva nunca maior que o saldo físico
ALTER TABLE saldos_estoque
  ADD CONSTRAINT ck_saldo_quantidade_nao_negativa CHECK (quantidade >= 0),
  ADD CONSTRAINT ck_saldo_reservado_nao_negativo CHECK (reservado >= 0),
  ADD CONSTRAINT ck_saldo_reservado_ate_quantidade CHECK (reservado <= quantidade);

ALTER TABLE movimentacao_itens
  ADD CONSTRAINT ck_mov_item_quantidade_positiva CHECK (quantidade > 0),
  ADD CONSTRAINT ck_mov_item_custo_nao_negativo CHECK (custo_unitario >= 0),
  ADD CONSTRAINT ck_mov_item_tem_local CHECK (local_origem_id IS NOT NULL OR local_destino_id IS NOT NULL),
  ADD CONSTRAINT ck_mov_item_locais_distintos CHECK (
    local_origem_id IS NULL OR local_destino_id IS NULL OR local_origem_id <> local_destino_id
  );

ALTER TABLE movimentacoes
  ADD CONSTRAINT ck_mov_responsavel CHECK (usuario_id IS NOT NULL OR cliente_api_id IS NOT NULL),
  ADD CONSTRAINT ck_mov_estorno_coerente CHECK ((tipo = 'ESTORNO') = (estorno_de_id IS NOT NULL));

ALTER TABLE produtos
  ADD CONSTRAINT ck_produto_precos CHECK (preco_custo >= 0 AND preco_venda >= 0 AND custo_medio >= 0),
  ADD CONSTRAINT ck_produto_minimo CHECK (estoque_minimo >= 0),
  ADD CONSTRAINT ck_produto_maximo CHECK (estoque_maximo IS NULL OR estoque_maximo >= estoque_minimo);

ALTER TABLE pedidos_compra_itens
  ADD CONSTRAINT ck_compra_item_quantidade CHECK (quantidade > 0),
  ADD CONSTRAINT ck_compra_item_recebida CHECK (quantidade_recebida >= 0 AND quantidade_recebida <= quantidade),
  ADD CONSTRAINT ck_compra_item_preco CHECK (preco_unitario >= 0);

ALTER TABLE pedido_itens
  ADD CONSTRAINT ck_pedido_item_quantidade CHECK (quantidade > 0),
  ADD CONSTRAINT ck_pedido_item_preco CHECK (preco_unitario >= 0);

ALTER TABLE reservas
  ADD CONSTRAINT ck_reserva_quantidade CHECK (quantidade > 0);

ALTER TABLE inventario_itens
  ADD CONSTRAINT ck_inventario_item_contagem CHECK (quantidade_contada IS NULL OR quantidade_contada >= 0);

ALTER TABLE ajuste_itens
  ADD CONSTRAINT ck_ajuste_item_delta CHECK (quantidade_delta <> 0);

-- Segregação de funções: quem solicita não aprova
ALTER TABLE ajustes
  ADD CONSTRAINT ck_ajuste_segregacao CHECK (decidido_por_id IS NULL OR decidido_por_id <> solicitado_por_id),
  ADD CONSTRAINT ck_ajuste_decisao CHECK ((status = 'PENDENTE') = (decidido_por_id IS NULL));

ALTER TABLE categorias
  ADD CONSTRAINT ck_categoria_pai CHECK (pai_id IS NULL OR pai_id <> id);

ALTER TABLE locais_armazenamento
  ADD CONSTRAINT ck_local_pai CHECK (pai_id IS NULL OR pai_id <> id);

ALTER TABLE fornecedores
  ADD CONSTRAINT ck_fornecedor_documento CHECK (
    (tipo_pessoa = 'PF' AND documento ~ '^[0-9]{11}$') OR
    (tipo_pessoa = 'PJ' AND documento ~ '^[0-9]{14}$') OR
    anonimizado_em IS NOT NULL
  );

ALTER TABLE usuarios
  ADD CONSTRAINT ck_usuario_email_minusculo CHECK (email = lower(email));

ALTER TABLE clientes_api
  ADD CONSTRAINT ck_cliente_api_escopos CHECK (cardinality(escopos) > 0);

ALTER TABLE tarefas
  ADD CONSTRAINT ck_tarefa_tentativas CHECK (tentativas >= 0 AND tentativas <= max_tentativas);

-- ---------------------------------------------------------------------
-- 2. Índices únicos parciais e auxiliares
-- ---------------------------------------------------------------------

-- Nome de categoria único dentro do mesmo nível (sem diferenciar maiúsculas)
CREATE UNIQUE INDEX uq_categorias_nome_por_pai
  ON categorias (COALESCE(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));

-- Um único alerta aberto por chave de deduplicação
CREATE UNIQUE INDEX uq_notificacoes_dedup_aberta
  ON notificacoes (chave_deduplicacao)
  WHERE resolvida = false AND chave_deduplicacao IS NOT NULL;

-- Uma única tarefa pendente/em processamento por chave
CREATE UNIQUE INDEX uq_tarefas_chave_ativa
  ON tarefas (chave_unica)
  WHERE status IN ('PENDENTE', 'PROCESSANDO') AND chave_unica IS NOT NULL;

-- Busca textual sem diferenciar maiúsculas
CREATE INDEX idx_produtos_nome_lower ON produtos (lower(nome));
CREATE INDEX idx_fornecedores_razao_lower ON fornecedores (lower(razao_social));
CREATE INDEX idx_crm_clientes_nome_lower ON crm_clientes (lower(nome));

-- ---------------------------------------------------------------------
-- 3. Imutabilidade do livro-razão e da auditoria
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_impedir_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: % não permite %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimentacoes_imutavel
  BEFORE UPDATE OR DELETE ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION fn_impedir_alteracao();

CREATE TRIGGER trg_movimentacao_itens_imutavel
  BEFORE UPDATE OR DELETE ON movimentacao_itens
  FOR EACH ROW EXECUTE FUNCTION fn_impedir_alteracao();

CREATE TRIGGER trg_entradas_imutavel
  BEFORE UPDATE OR DELETE ON entradas
  FOR EACH ROW EXECUTE FUNCTION fn_impedir_alteracao();

CREATE TRIGGER trg_saidas_imutavel
  BEFORE UPDATE OR DELETE ON saidas
  FOR EACH ROW EXECUTE FUNCTION fn_impedir_alteracao();

-- Auditoria: nunca pode ser alterada; exclusão apenas pelo expurgo de retenção,
-- que habilita explicitamente a variável de sessão estoque.expurgo_auditoria.
CREATE OR REPLACE FUNCTION fn_proteger_auditoria() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('estoque.expurgo_auditoria', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Registro de auditoria imutável: % não permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_logs_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON logs_auditoria
  FOR EACH ROW EXECUTE FUNCTION fn_proteger_auditoria();

-- Pedidos confirmados ou cancelados não voltam de status
CREATE OR REPLACE FUNCTION fn_pedido_transicao() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'RESERVADO' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Transição de status inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedidos_transicao
  BEFORE UPDATE OF status ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_pedido_transicao();

-- ---------------------------------------------------------------------
-- 4. Conciliação: saldo calculado a partir do livro-razão
-- ---------------------------------------------------------------------

CREATE VIEW vw_saldo_ledger AS
SELECT produto_id, local_id, SUM(qtd)::numeric(18, 4) AS quantidade
FROM (
  SELECT produto_id, local_destino_id AS local_id, quantidade AS qtd
    FROM movimentacao_itens WHERE local_destino_id IS NOT NULL
  UNION ALL
  SELECT produto_id, local_origem_id AS local_id, -quantidade AS qtd
    FROM movimentacao_itens WHERE local_origem_id IS NOT NULL
) m
GROUP BY produto_id, local_id;

-- Divergências entre o saldo materializado e o livro-razão (deve estar sempre vazia)
CREATE VIEW vw_conciliacao_saldos AS
SELECT
  COALESCE(s.produto_id, l.produto_id) AS produto_id,
  COALESCE(s.local_id, l.local_id) AS local_id,
  COALESCE(s.quantidade, 0) AS saldo_materializado,
  COALESCE(l.quantidade, 0) AS saldo_ledger
FROM saldos_estoque s
FULL OUTER JOIN vw_saldo_ledger l ON l.produto_id = s.produto_id AND l.local_id = s.local_id
WHERE COALESCE(s.quantidade, 0) <> COALESCE(l.quantidade, 0);
