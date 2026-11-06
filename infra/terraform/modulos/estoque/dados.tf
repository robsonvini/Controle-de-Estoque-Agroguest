# Banco de dados gerenciado, armazenamento de arquivos e segredos.

resource "aws_kms_key" "principal" {
  description             = "Criptografia de dados em repouso — ${local.nome}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = local.tags
}

resource "aws_kms_alias" "principal" {
  name          = "alias/${local.nome}"
  target_key_id = aws_kms_key.principal.key_id
}

# ---------------- RDS PostgreSQL ----------------

resource "aws_db_subnet_group" "principal" {
  name       = local.nome
  subnet_ids = aws_subnet.privada[*].id
  tags       = local.tags
}

resource "aws_db_parameter_group" "principal" {
  name   = local.nome
  family = "postgres17"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  tags = local.tags
}

resource "random_password" "banco" {
  length  = 32
  special = false
}

resource "aws_db_instance" "principal" {
  identifier                      = local.nome
  engine                          = "postgres"
  engine_version                  = "17"
  instance_class                  = var.rds_classe
  allocated_storage               = var.rds_armazenamento_gb
  max_allocated_storage           = var.rds_armazenamento_gb * 4
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.principal.arn
  db_name                         = "estoque"
  username                        = "estoque"
  password                        = random_password.banco.result
  db_subnet_group_name            = aws_db_subnet_group.principal.name
  vpc_security_group_ids          = [aws_security_group.rds.id]
  parameter_group_name            = aws_db_parameter_group.principal.name
  multi_az                        = var.rds_multi_az
  publicly_accessible             = false
  backup_retention_period         = var.rds_retencao_backup_dias
  backup_window                   = "05:00-06:00"
  maintenance_window              = "sun:06:30-sun:07:30"
  copy_tags_to_snapshot           = true
  deletion_protection             = var.protecao_exclusao
  skip_final_snapshot             = !var.protecao_exclusao
  final_snapshot_identifier       = var.protecao_exclusao ? "${local.nome}-final" : null
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.principal.arn
  enabled_cloudwatch_logs_exports = ["postgresql"]
  auto_minor_version_upgrade      = true
  apply_immediately               = false
  tags                            = local.tags
}

# Recuperação de desastres: backups automáticos replicados para outra região (PITR na região DR)
resource "aws_kms_key" "dr" {
  count               = var.replicar_backups_dr ? 1 : 0
  provider            = aws.dr
  description         = "Backups replicados — ${local.nome}"
  enable_key_rotation = true
  tags                = local.tags
}

resource "aws_db_instance_automated_backups_replication" "dr" {
  count                  = var.replicar_backups_dr ? 1 : 0
  provider               = aws.dr
  source_db_instance_arn = aws_db_instance.principal.arn
  kms_key_id             = aws_kms_key.dr[0].arn
  retention_period       = var.rds_retencao_backup_dias
}

# ---------------- S3: imagens e documentos ----------------

resource "aws_s3_bucket" "arquivos" {
  bucket        = "${local.nome}-arquivos-${data.aws_caller_identity.atual.account_id}"
  force_destroy = !var.protecao_exclusao
  tags          = local.tags
}

resource "aws_s3_bucket_public_access_block" "arquivos" {
  bucket                  = aws_s3_bucket.arquivos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.principal.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  rule {
    id     = "versoes-antigas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

resource "aws_s3_bucket_policy" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SomenteTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.arquivos.arn, "${aws_s3_bucket.arquivos.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# ---------------- Segredos da aplicação ----------------

resource "random_password" "jwt_acesso" {
  length  = 64
  special = false
}

resource "random_password" "jwt_integracao" {
  length  = 64
  special = false
}

resource "random_bytes" "crypto_key" {
  length = 32
}

resource "aws_secretsmanager_secret" "aplicacao" {
  name                    = "${local.nome}/aplicacao"
  description             = "Segredos da API do Estoque Agrogest (${var.ambiente})"
  kms_key_id              = aws_kms_key.principal.arn
  recovery_window_in_days = var.protecao_exclusao ? 30 : 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "aplicacao" {
  secret_id = aws_secretsmanager_secret.aplicacao.id
  secret_string = jsonencode({
    DATABASE_URL          = "postgresql://estoque:${random_password.banco.result}@${aws_db_instance.principal.address}:5432/estoque?schema=public&sslmode=require"
    JWT_ACCESS_SECRET     = random_password.jwt_acesso.result
    JWT_INTEGRACAO_SECRET = random_password.jwt_integracao.result
    CRYPTO_KEY            = random_bytes.crypto_key.base64
  })
}
