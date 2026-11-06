-- CreateEnum
CREATE TYPE "StatusProduto" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "SituacaoFornecedor" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoLocal" AS ENUM ('DEPOSITO', 'AREA', 'POSICAO');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE', 'ESTORNO');

-- CreateEnum
CREATE TYPE "MotivoMovimentacao" AS ENUM ('COMPRA', 'RECEBIMENTO', 'DEVOLUCAO_CLIENTE', 'AJUSTE_POSITIVO', 'VENDA', 'CONSUMO_INTERNO', 'PERDA', 'AVARIA', 'DEVOLUCAO_FORNECEDOR', 'AJUSTE_NEGATIVO', 'TRANSFERENCIA', 'AJUSTE_INVENTARIO', 'ESTORNO');

-- CreateEnum
CREATE TYPE "OrigemMovimentacao" AS ENUM ('MANUAL', 'COMPRA', 'PEDIDO_VENDA', 'AJUSTE', 'ESTORNO');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('RASCUNHO', 'ENVIADO', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('RESERVADO', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemPedido" AS ENUM ('MANUAL', 'CRM_API');

-- CreateEnum
CREATE TYPE "StatusReserva" AS ENUM ('ATIVA', 'CONSUMIDA', 'LIBERADA');

-- CreateEnum
CREATE TYPE "StatusInventario" AS ENUM ('EM_CONTAGEM', 'EM_REVISAO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusAjuste" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "OrigemAjuste" AS ENUM ('MANUAL', 'INVENTARIO');

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('ESTOQUE_MINIMO', 'ESTOQUE_ESGOTADO', 'REPOSICAO', 'MOVIMENTACAO_ATIPICA', 'FALHA_SINCRONIZACAO', 'DIVERGENCIA_INVENTARIO', 'AJUSTE_PENDENTE');

-- CreateEnum
CREATE TYPE "Severidade" AS ENUM ('INFO', 'ALERTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "StatusExecucao" AS ENUM ('EM_ANDAMENTO', 'SUCESSO', 'FALHA');

-- CreateEnum
CREATE TYPE "DirecaoIntegracao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusEventoRecebido" AS ENUM ('RECEBIDO', 'PROCESSADO', 'IGNORADO', 'ERRO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "perfil_id" UUID NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "provedor_auth" VARCHAR(30) NOT NULL DEFAULT 'local',
    "id_externo" VARCHAR(100),
    "tentativas_falhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_ate" TIMESTAMPTZ(3),
    "deve_trocar_senha" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_login_em" TIMESTAMPTZ(3),
    "anonimizado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfis" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "descricao" VARCHAR(200),
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissoes" (
    "codigo" VARCHAR(60) NOT NULL,
    "modulo" VARCHAR(40) NOT NULL,
    "descricao" VARCHAR(200) NOT NULL,

    CONSTRAINT "permissoes_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "perfil_permissoes" (
    "perfil_id" UUID NOT NULL,
    "permissao_codigo" VARCHAR(60) NOT NULL,

    CONSTRAINT "perfil_permissoes_pkey" PRIMARY KEY ("perfil_id","permissao_codigo")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "familia" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogada_em" TIMESTAMPTZ(3),
    "motivo_revogacao" VARCHAR(60),
    "substituida_em" TIMESTAMPTZ(3),
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" UUID,
    "cliente_api_id" UUID,
    "acao" VARCHAR(60) NOT NULL,
    "entidade" VARCHAR(60) NOT NULL,
    "entidade_id" VARCHAR(100),
    "dados" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "descricao" VARCHAR(200),
    "pai_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_medida" (
    "id" UUID NOT NULL,
    "sigla" VARCHAR(10) NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "casas_decimais" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locais_armazenamento" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "descricao" VARCHAR(200),
    "tipo" "TipoLocal" NOT NULL,
    "pai_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locais_armazenamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL,
    "codigo_interno" VARCHAR(30) NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "codigo_barras" VARCHAR(50),
    "nome" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "categoria_id" UUID,
    "unidade_medida_id" UUID NOT NULL,
    "preco_custo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "preco_venda" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "custo_medio" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estoque_minimo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estoque_maximo" DECIMAL(18,4),
    "local_padrao_id" UUID,
    "status" "StatusProduto" NOT NULL DEFAULT 'ATIVO',
    "id_externo_crm" VARCHAR(100),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_imagens" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "chave" VARCHAR(300) NOT NULL,
    "nome_arquivo" VARCHAR(200) NOT NULL,
    "mime_type" VARCHAR(60) NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "texto_alternativo" VARCHAR(200) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_imagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" UUID NOT NULL,
    "tipo_pessoa" "TipoPessoa" NOT NULL,
    "documento" VARCHAR(14) NOT NULL,
    "razao_social" VARCHAR(200) NOT NULL,
    "nome_fantasia" VARCHAR(200),
    "inscricao_estadual" VARCHAR(30),
    "email" VARCHAR(160),
    "telefone" VARCHAR(20),
    "cep" VARCHAR(8),
    "logradouro" VARCHAR(200),
    "numero" VARCHAR(20),
    "complemento" VARCHAR(100),
    "bairro" VARCHAR(100),
    "cidade" VARCHAR(100),
    "uf" CHAR(2),
    "situacao" "SituacaoFornecedor" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "anonimizado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedor_contatos" (
    "id" UUID NOT NULL,
    "fornecedor_id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "cargo" VARCHAR(80),
    "email" VARCHAR(160),
    "telefone" VARCHAR(20),

    CONSTRAINT "fornecedor_contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_fornecedores" (
    "produto_id" UUID NOT NULL,
    "fornecedor_id" UUID NOT NULL,
    "codigo_no_fornecedor" VARCHAR(50),
    "prazo_entrega_dias" INTEGER,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_preco_compra" DECIMAL(18,4),

    CONSTRAINT "produto_fornecedores_pkey" PRIMARY KEY ("produto_id","fornecedor_id")
);

-- CreateTable
CREATE TABLE "saldos_estoque" (
    "produto_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reservado" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saldos_estoque_pkey" PRIMARY KEY ("produto_id","local_id")
);

-- CreateTable
CREATE TABLE "movimentacoes" (
    "id" UUID NOT NULL,
    "numero" BIGSERIAL NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "motivo" "MotivoMovimentacao" NOT NULL,
    "origem" "OrigemMovimentacao" NOT NULL DEFAULT 'MANUAL',
    "data_movimentacao" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" UUID,
    "cliente_api_id" UUID,
    "observacao" VARCHAR(1000),
    "valor_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estorno_de_id" UUID,
    "pedido_id" UUID,
    "ajuste_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacao_itens" (
    "id" UUID NOT NULL,
    "movimentacao_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "local_origem_id" UUID,
    "local_destino_id" UUID,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "custo_unitario" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "valor_total" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "movimentacao_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas" (
    "movimentacao_id" UUID NOT NULL,
    "fornecedor_id" UUID,
    "cliente_crm_id" UUID,
    "pedido_compra_id" UUID,
    "numero_documento" VARCHAR(60),
    "serie_documento" VARCHAR(10),
    "data_documento" DATE,

    CONSTRAINT "entradas_pkey" PRIMARY KEY ("movimentacao_id")
);

-- CreateTable
CREATE TABLE "saidas" (
    "movimentacao_id" UUID NOT NULL,
    "cliente_crm_id" UUID,
    "fornecedor_id" UUID,
    "destino" VARCHAR(120),
    "numero_documento" VARCHAR(60),

    CONSTRAINT "saidas_pkey" PRIMARY KEY ("movimentacao_id")
);

-- CreateTable
CREATE TABLE "pedidos_compra" (
    "id" UUID NOT NULL,
    "numero" BIGSERIAL NOT NULL,
    "fornecedor_id" UUID NOT NULL,
    "status" "StatusPedidoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "data_pedido" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previsao_entrega" DATE,
    "observacao" VARCHAR(1000),
    "valor_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "motivo_cancelamento" VARCHAR(500),
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pedidos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_compra_itens" (
    "id" UUID NOT NULL,
    "pedido_compra_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "quantidade_recebida" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "preco_unitario" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "pedidos_compra_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_clientes" (
    "id" UUID NOT NULL,
    "crm_id" UUID NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "razao_social" VARCHAR(200),
    "cnpj" VARCHAR(14),
    "cpf" VARCHAR(11),
    "email" VARCHAR(160),
    "telefone" VARCHAR(20),
    "cidade" VARCHAR(100),
    "uf" VARCHAR(2),
    "hash" VARCHAR(64) NOT NULL,
    "removido_no_crm" BOOLEAN NOT NULL DEFAULT false,
    "sincronizado_em" TIMESTAMPTZ(3) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "crm_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL,
    "numero" BIGSERIAL NOT NULL,
    "origem" "OrigemPedido" NOT NULL DEFAULT 'MANUAL',
    "id_externo" VARCHAR(100),
    "cliente_crm_id" UUID,
    "status" "StatusPedido" NOT NULL DEFAULT 'RESERVADO',
    "observacao" VARCHAR(1000),
    "valor_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "criado_por_id" UUID,
    "cliente_api_id" UUID,
    "confirmado_em" TIMESTAMPTZ(3),
    "cancelado_em" TIMESTAMPTZ(3),
    "motivo_cancelamento" VARCHAR(500),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_itens" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "preco_unitario" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" UUID NOT NULL,
    "pedido_item_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "status" "StatusReserva" NOT NULL DEFAULT 'ATIVA',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerrada_em" TIMESTAMPTZ(3),

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventarios" (
    "id" UUID NOT NULL,
    "numero" BIGSERIAL NOT NULL,
    "descricao" VARCHAR(150) NOT NULL,
    "status" "StatusInventario" NOT NULL DEFAULT 'EM_CONTAGEM',
    "local_id" UUID,
    "categoria_id" UUID,
    "observacao" VARCHAR(1000),
    "criado_por_id" UUID NOT NULL,
    "iniciado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisado_em" TIMESTAMPTZ(3),
    "finalizado_em" TIMESTAMPTZ(3),
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_itens" (
    "id" UUID NOT NULL,
    "inventario_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade_sistema" DECIMAL(18,4),
    "quantidade_contada" DECIMAL(18,4),
    "divergencia" DECIMAL(18,4),
    "contado_por_id" UUID,
    "contado_em" TIMESTAMPTZ(3),

    CONSTRAINT "inventario_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes" (
    "id" UUID NOT NULL,
    "numero" BIGSERIAL NOT NULL,
    "origem" "OrigemAjuste" NOT NULL DEFAULT 'MANUAL',
    "inventario_id" UUID,
    "status" "StatusAjuste" NOT NULL DEFAULT 'PENDENTE',
    "justificativa" VARCHAR(1000) NOT NULL,
    "solicitado_por_id" UUID NOT NULL,
    "solicitado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidido_por_id" UUID,
    "decidido_em" TIMESTAMPTZ(3),
    "motivo_rejeicao" VARCHAR(500),

    CONSTRAINT "ajustes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajuste_itens" (
    "id" UUID NOT NULL,
    "ajuste_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade_delta" DECIMAL(18,4) NOT NULL,
    "quantidade_sistema" DECIMAL(18,4),
    "quantidade_contada" DECIMAL(18,4),

    CONSTRAINT "ajuste_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracoes" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "base_url" VARCHAR(300) NOT NULL,
    "auth_header_nome" VARCHAR(60),
    "auth_header_valor_cifrado" TEXT,
    "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
    "intervalo_sync_minutos" INTEGER NOT NULL DEFAULT 15,
    "webhook_saida_ativo" BOOLEAN NOT NULL DEFAULT false,
    "webhook_saida_url" VARCHAR(300),
    "webhook_saida_segredo_cifrado" TEXT,
    "webhook_entrada_segredo_cifrado" TEXT,
    "falhas_consecutivas" INTEGER NOT NULL DEFAULT 0,
    "ultima_sincronizacao_em" TIMESTAMPTZ(3),
    "ultimo_sucesso_em" TIMESTAMPTZ(3),
    "ultimo_erro" VARCHAR(1000),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao_execucoes" (
    "id" UUID NOT NULL,
    "integracao_id" UUID NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "gatilho" VARCHAR(20) NOT NULL,
    "status" "StatusExecucao" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "disparado_por_id" UUID,
    "iniciado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMPTZ(3),
    "total_recebidos" INTEGER NOT NULL DEFAULT 0,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "inalterados" INTEGER NOT NULL DEFAULT 0,
    "removidos" INTEGER NOT NULL DEFAULT 0,
    "invalidos" INTEGER NOT NULL DEFAULT 0,
    "erro" VARCHAR(1000),

    CONSTRAINT "integracao_execucoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao_logs" (
    "id" BIGSERIAL NOT NULL,
    "integracao_id" UUID,
    "execucao_id" UUID,
    "direcao" "DirecaoIntegracao" NOT NULL,
    "operacao" VARCHAR(80) NOT NULL,
    "metodo" VARCHAR(10),
    "url" VARCHAR(500),
    "status_http" INTEGER,
    "duracao_ms" INTEGER,
    "tentativa" INTEGER NOT NULL DEFAULT 1,
    "sucesso" BOOLEAN NOT NULL,
    "erro" VARCHAR(1000),
    "detalhes" JSONB,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integracao_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao_eventos_recebidos" (
    "id" UUID NOT NULL,
    "origem" VARCHAR(40) NOT NULL,
    "evento_id" VARCHAR(100) NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusEventoRecebido" NOT NULL DEFAULT 'RECEBIDO',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" VARCHAR(1000),
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMPTZ(3),

    CONSTRAINT "integracao_eventos_recebidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_api" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "client_id" VARCHAR(60) NOT NULL,
    "segredo_hash" VARCHAR(255) NOT NULL,
    "escopos" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_em" TIMESTAMPTZ(3),
    "revogado_em" TIMESTAMPTZ(3),

    CONSTRAINT "clientes_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chaves_idempotencia" (
    "escopo" VARCHAR(120) NOT NULL,
    "chave" VARCHAR(100) NOT NULL,
    "hash_requisicao" VARCHAR(64) NOT NULL,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "status_http" INTEGER,
    "resposta" JSONB,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chaves_idempotencia_pkey" PRIMARY KEY ("escopo","chave")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" BIGSERIAL NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusTarefa" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "max_tentativas" INTEGER NOT NULL DEFAULT 8,
    "proxima_tentativa_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "travada_em" TIMESTAMPTZ(3),
    "ultimo_erro" VARCHAR(2000),
    "chave_unica" VARCHAR(120),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_em" TIMESTAMPTZ(3),

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "severidade" "Severidade" NOT NULL DEFAULT 'ALERTA',
    "titulo" VARCHAR(150) NOT NULL,
    "mensagem" VARCHAR(1000) NOT NULL,
    "entidade" VARCHAR(60),
    "entidade_id" VARCHAR(100),
    "link" VARCHAR(300),
    "permissao_alvo" VARCHAR(60) NOT NULL,
    "chave_deduplicacao" VARCHAR(150),
    "resolvida" BOOLEAN NOT NULL DEFAULT false,
    "resolvida_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao_leituras" (
    "notificacao_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "lida_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_leituras_pkey" PRIMARY KEY ("notificacao_id","usuario_id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "chave" VARCHAR(60) NOT NULL,
    "valor" JSONB NOT NULL,
    "atualizado_por_id" UUID,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_perfil_id_idx" ON "usuarios"("perfil_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_provedor_auth_id_externo_key" ON "usuarios"("provedor_auth", "id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_nome_key" ON "perfis"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_refresh_token_hash_key" ON "sessoes"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_familia_idx" ON "sessoes"("familia");

-- CreateIndex
CREATE INDEX "logs_auditoria_entidade_entidade_id_idx" ON "logs_auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_usuario_id_criado_em_idx" ON "logs_auditoria"("usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "logs_auditoria_criado_em_idx" ON "logs_auditoria"("criado_em");

-- CreateIndex
CREATE INDEX "categorias_pai_id_idx" ON "categorias"("pai_id");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_medida_sigla_key" ON "unidades_medida"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "locais_armazenamento_codigo_key" ON "locais_armazenamento"("codigo");

-- CreateIndex
CREATE INDEX "locais_armazenamento_pai_id_idx" ON "locais_armazenamento"("pai_id");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_interno_key" ON "produtos"("codigo_interno");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_sku_key" ON "produtos"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_barras_key" ON "produtos"("codigo_barras");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_id_externo_crm_key" ON "produtos"("id_externo_crm");

-- CreateIndex
CREATE INDEX "produtos_categoria_id_idx" ON "produtos"("categoria_id");

-- CreateIndex
CREATE INDEX "produtos_status_idx" ON "produtos"("status");

-- CreateIndex
CREATE INDEX "produtos_nome_idx" ON "produtos"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "produto_imagens_chave_key" ON "produto_imagens"("chave");

-- CreateIndex
CREATE INDEX "produto_imagens_produto_id_idx" ON "produto_imagens"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_documento_key" ON "fornecedores"("documento");

-- CreateIndex
CREATE INDEX "fornecedores_razao_social_idx" ON "fornecedores"("razao_social");

-- CreateIndex
CREATE INDEX "fornecedor_contatos_fornecedor_id_idx" ON "fornecedor_contatos"("fornecedor_id");

-- CreateIndex
CREATE INDEX "produto_fornecedores_fornecedor_id_idx" ON "produto_fornecedores"("fornecedor_id");

-- CreateIndex
CREATE INDEX "saldos_estoque_local_id_idx" ON "saldos_estoque"("local_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacoes_numero_key" ON "movimentacoes"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacoes_estorno_de_id_key" ON "movimentacoes"("estorno_de_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacoes_ajuste_id_key" ON "movimentacoes"("ajuste_id");

-- CreateIndex
CREATE INDEX "movimentacoes_tipo_data_movimentacao_idx" ON "movimentacoes"("tipo", "data_movimentacao");

-- CreateIndex
CREATE INDEX "movimentacoes_motivo_data_movimentacao_idx" ON "movimentacoes"("motivo", "data_movimentacao");

-- CreateIndex
CREATE INDEX "movimentacoes_data_movimentacao_idx" ON "movimentacoes"("data_movimentacao");

-- CreateIndex
CREATE INDEX "movimentacoes_usuario_id_idx" ON "movimentacoes"("usuario_id");

-- CreateIndex
CREATE INDEX "movimentacoes_pedido_id_idx" ON "movimentacoes"("pedido_id");

-- CreateIndex
CREATE INDEX "movimentacao_itens_movimentacao_id_idx" ON "movimentacao_itens"("movimentacao_id");

-- CreateIndex
CREATE INDEX "movimentacao_itens_produto_id_idx" ON "movimentacao_itens"("produto_id");

-- CreateIndex
CREATE INDEX "entradas_fornecedor_id_idx" ON "entradas"("fornecedor_id");

-- CreateIndex
CREATE INDEX "entradas_pedido_compra_id_idx" ON "entradas"("pedido_compra_id");

-- CreateIndex
CREATE INDEX "entradas_numero_documento_idx" ON "entradas"("numero_documento");

-- CreateIndex
CREATE INDEX "saidas_cliente_crm_id_idx" ON "saidas"("cliente_crm_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_numero_key" ON "pedidos_compra"("numero");

-- CreateIndex
CREATE INDEX "pedidos_compra_fornecedor_id_idx" ON "pedidos_compra"("fornecedor_id");

-- CreateIndex
CREATE INDEX "pedidos_compra_status_idx" ON "pedidos_compra"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_itens_pedido_compra_id_produto_id_key" ON "pedidos_compra_itens"("pedido_compra_id", "produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_clientes_crm_id_key" ON "crm_clientes"("crm_id");

-- CreateIndex
CREATE INDEX "crm_clientes_nome_idx" ON "crm_clientes"("nome");

-- CreateIndex
CREATE INDEX "crm_clientes_cnpj_idx" ON "crm_clientes"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- CreateIndex
CREATE INDEX "pedidos_status_idx" ON "pedidos"("status");

-- CreateIndex
CREATE INDEX "pedidos_cliente_crm_id_idx" ON "pedidos"("cliente_crm_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_origem_id_externo_key" ON "pedidos"("origem", "id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_itens_pedido_id_produto_id_local_id_key" ON "pedido_itens"("pedido_id", "produto_id", "local_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_pedido_item_id_key" ON "reservas"("pedido_item_id");

-- CreateIndex
CREATE INDEX "reservas_produto_id_local_id_status_idx" ON "reservas"("produto_id", "local_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_numero_key" ON "inventarios"("numero");

-- CreateIndex
CREATE INDEX "inventarios_status_idx" ON "inventarios"("status");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_itens_inventario_id_produto_id_local_id_key" ON "inventario_itens"("inventario_id", "produto_id", "local_id");

-- CreateIndex
CREATE UNIQUE INDEX "ajustes_numero_key" ON "ajustes"("numero");

-- CreateIndex
CREATE INDEX "ajustes_status_idx" ON "ajustes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ajuste_itens_ajuste_id_produto_id_local_id_key" ON "ajuste_itens"("ajuste_id", "produto_id", "local_id");

-- CreateIndex
CREATE UNIQUE INDEX "integracoes_codigo_key" ON "integracoes"("codigo");

-- CreateIndex
CREATE INDEX "integracao_execucoes_integracao_id_iniciado_em_idx" ON "integracao_execucoes"("integracao_id", "iniciado_em");

-- CreateIndex
CREATE INDEX "integracao_logs_criado_em_idx" ON "integracao_logs"("criado_em");

-- CreateIndex
CREATE INDEX "integracao_logs_sucesso_criado_em_idx" ON "integracao_logs"("sucesso", "criado_em");

-- CreateIndex
CREATE INDEX "integracao_eventos_recebidos_status_idx" ON "integracao_eventos_recebidos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integracao_eventos_recebidos_origem_evento_id_key" ON "integracao_eventos_recebidos"("origem", "evento_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_api_client_id_key" ON "clientes_api"("client_id");

-- CreateIndex
CREATE INDEX "chaves_idempotencia_expira_em_idx" ON "chaves_idempotencia"("expira_em");

-- CreateIndex
CREATE INDEX "tarefas_status_proxima_tentativa_em_idx" ON "tarefas"("status", "proxima_tentativa_em");

-- CreateIndex
CREATE INDEX "notificacoes_criado_em_idx" ON "notificacoes"("criado_em");

-- CreateIndex
CREATE INDEX "notificacoes_tipo_resolvida_idx" ON "notificacoes"("tipo", "resolvida");

-- CreateIndex
CREATE INDEX "notificacao_leituras_usuario_id_idx" ON "notificacao_leituras"("usuario_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_permissao_codigo_fkey" FOREIGN KEY ("permissao_codigo") REFERENCES "permissoes"("codigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locais_armazenamento" ADD CONSTRAINT "locais_armazenamento_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_unidade_medida_id_fkey" FOREIGN KEY ("unidade_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_local_padrao_id_fkey" FOREIGN KEY ("local_padrao_id") REFERENCES "locais_armazenamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_imagens" ADD CONSTRAINT "produto_imagens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedor_contatos" ADD CONSTRAINT "fornecedor_contatos_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fornecedores" ADD CONSTRAINT "produto_fornecedores_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fornecedores" ADD CONSTRAINT "produto_fornecedores_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_estoque" ADD CONSTRAINT "saldos_estoque_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_estoque" ADD CONSTRAINT "saldos_estoque_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_cliente_api_id_fkey" FOREIGN KEY ("cliente_api_id") REFERENCES "clientes_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_estorno_de_id_fkey" FOREIGN KEY ("estorno_de_id") REFERENCES "movimentacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_ajuste_id_fkey" FOREIGN KEY ("ajuste_id") REFERENCES "ajustes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_itens" ADD CONSTRAINT "movimentacao_itens_movimentacao_id_fkey" FOREIGN KEY ("movimentacao_id") REFERENCES "movimentacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_itens" ADD CONSTRAINT "movimentacao_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_itens" ADD CONSTRAINT "movimentacao_itens_local_origem_id_fkey" FOREIGN KEY ("local_origem_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_itens" ADD CONSTRAINT "movimentacao_itens_local_destino_id_fkey" FOREIGN KEY ("local_destino_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_movimentacao_id_fkey" FOREIGN KEY ("movimentacao_id") REFERENCES "movimentacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_cliente_crm_id_fkey" FOREIGN KEY ("cliente_crm_id") REFERENCES "crm_clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_pedido_compra_id_fkey" FOREIGN KEY ("pedido_compra_id") REFERENCES "pedidos_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saidas" ADD CONSTRAINT "saidas_movimentacao_id_fkey" FOREIGN KEY ("movimentacao_id") REFERENCES "movimentacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saidas" ADD CONSTRAINT "saidas_cliente_crm_id_fkey" FOREIGN KEY ("cliente_crm_id") REFERENCES "crm_clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saidas" ADD CONSTRAINT "saidas_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra_itens" ADD CONSTRAINT "pedidos_compra_itens_pedido_compra_id_fkey" FOREIGN KEY ("pedido_compra_id") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra_itens" ADD CONSTRAINT "pedidos_compra_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_crm_id_fkey" FOREIGN KEY ("cliente_crm_id") REFERENCES "crm_clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_api_id_fkey" FOREIGN KEY ("cliente_api_id") REFERENCES "clientes_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "pedido_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_inventario_id_fkey" FOREIGN KEY ("inventario_id") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_contado_por_id_fkey" FOREIGN KEY ("contado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_inventario_id_fkey" FOREIGN KEY ("inventario_id") REFERENCES "inventarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_itens" ADD CONSTRAINT "ajuste_itens_ajuste_id_fkey" FOREIGN KEY ("ajuste_id") REFERENCES "ajustes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_itens" ADD CONSTRAINT "ajuste_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_itens" ADD CONSTRAINT "ajuste_itens_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_execucoes" ADD CONSTRAINT "integracao_execucoes_integracao_id_fkey" FOREIGN KEY ("integracao_id") REFERENCES "integracoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_logs" ADD CONSTRAINT "integracao_logs_integracao_id_fkey" FOREIGN KEY ("integracao_id") REFERENCES "integracoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_logs" ADD CONSTRAINT "integracao_logs_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "integracao_execucoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_api" ADD CONSTRAINT "clientes_api_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao_leituras" ADD CONSTRAINT "notificacao_leituras_notificacao_id_fkey" FOREIGN KEY ("notificacao_id") REFERENCES "notificacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao_leituras" ADD CONSTRAINT "notificacao_leituras_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
