# Imagens (ECR), cluster ECS Fargate, permissões e serviços da aplicação.

variable "email_admin_inicial" {
  description = "E-mail do administrador inicial criado pela migração (troca de senha obrigatória no 1º acesso)"
  type        = string
}

resource "random_password" "admin_inicial" {
  length           = 20
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
  override_special = "@#%*-_"
}

resource "aws_secretsmanager_secret" "admin_inicial" {
  name                    = "${local.nome}/admin-inicial"
  description             = "Senha inicial do administrador (trocar no primeiro acesso)"
  kms_key_id              = aws_kms_key.principal.arn
  recovery_window_in_days = var.protecao_exclusao ? 30 : 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "admin_inicial" {
  secret_id     = aws_secretsmanager_secret.admin_inicial.id
  secret_string = random_password.admin_inicial.result
}

# ---------------- ECR ----------------

resource "aws_ecr_repository" "imagens" {
  for_each             = toset(["api", "migracao", "web"])
  name                 = "${local.nome}-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.principal.arn
  }
  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "imagens" {
  for_each   = aws_ecr_repository.imagens
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantém as 30 imagens mais recentes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# ---------------- Cluster e logs ----------------

resource "aws_ecs_cluster" "principal" {
  name = local.nome
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
  tags = local.tags
}

resource "aws_cloudwatch_log_group" "servicos" {
  for_each          = toset(["api", "worker", "web", "migracao"])
  name              = "/ecs/${local.nome}/${each.key}"
  retention_in_days = var.ambiente == "prod" ? 365 : 30
  kms_key_id        = aws_kms_key.principal.arn
  tags              = local.tags
}

# ---------------- IAM ----------------

data "aws_iam_policy_document" "assumir_ecs" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Papel de execução: baixar imagens, gravar logs e ler segredos
resource "aws_iam_role" "execucao" {
  name               = "${local.nome}-execucao"
  assume_role_policy = data.aws_iam_policy_document.assumir_ecs.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "execucao_padrao" {
  role       = aws_iam_role.execucao.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execucao_segredos" {
  role = aws_iam_role.execucao.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.aplicacao.arn, aws_secretsmanager_secret.admin_inicial.arn]
      },
      { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [aws_kms_key.principal.arn] },
    ]
  })
}

# Papel da tarefa: somente o necessário em tempo de execução (S3 do bucket e envio de e-mail)
resource "aws_iam_role" "tarefa" {
  name               = "${local.nome}-tarefa"
  assume_role_policy = data.aws_iam_policy_document.assumir_ecs.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "tarefa" {
  role = aws_iam_role.tarefa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = ["${aws_s3_bucket.arquivos.arn}/*"]
      },
      { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = [aws_kms_key.principal.arn] },
      { Effect = "Allow", Action = ["ses:SendEmail", "ses:SendRawEmail"], Resource = ["*"] },
    ]
  })
}

# ---------------- Definições de tarefa ----------------

locals {
  segredo = aws_secretsmanager_secret.aplicacao.arn
  segredos_api = [
    for chave in ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_INTEGRACAO_SECRET", "CRYPTO_KEY"] :
    { name = chave, valueFrom = "${local.segredo}:${chave}::" }
  ]
  ambiente_api = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3333" },
    { name = "WEB_ORIGIN", value = "https://${var.dominio}" },
    { name = "TRUST_PROXY", value = "true" },
    { name = "COOKIE_SECURE", value = "true" },
    { name = "LOG_LEVEL", value = "info" },
    { name = "S3_BUCKET", value = aws_s3_bucket.arquivos.bucket },
    { name = "S3_REGION", value = data.aws_region.atual.region },
    { name = "EMAIL_HABILITADO", value = var.email_remetente == "" ? "false" : "true" },
    { name = "EMAIL_REMETENTE", value = var.email_remetente },
    { name = "SMTP_HOST", value = "email-smtp.${data.aws_region.atual.region}.amazonaws.com" },
    { name = "SMTP_PORT", value = "587" },
    { name = "CRM_BASE_URL", value = var.crm_base_url },
  ]
  registro = "${data.aws_caller_identity.atual.account_id}.dkr.ecr.${data.aws_region.atual.region}.amazonaws.com"
  logs = { for k, g in aws_cloudwatch_log_group.servicos : k => {
    logDriver = "awslogs"
    options = {
      "awslogs-group"         = g.name
      "awslogs-region"        = data.aws_region.atual.region
      "awslogs-stream-prefix" = k
    }
  } }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.nome}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api.cpu
  memory                   = var.api.memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.tarefa.arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name                   = "api"
    image                  = "${local.registro}/${local.nome}-api:${var.tag_imagem}"
    essential              = true
    readonlyRootFilesystem = true
    portMappings           = [{ containerPort = 3333, protocol = "tcp" }]
    environment            = local.ambiente_api
    secrets                = local.segredos_api
    logConfiguration       = local.logs["api"]
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp" }]
  }])
  volume { name = "tmp" }
  tags = local.tags
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.nome}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker.cpu
  memory                   = var.worker.memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.tarefa.arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name                   = "worker"
    image                  = "${local.registro}/${local.nome}-api:${var.tag_imagem}"
    command                = ["node", "dist/main-worker.js"]
    essential              = true
    readonlyRootFilesystem = true
    environment            = local.ambiente_api
    secrets                = local.segredos_api
    logConfiguration       = local.logs["worker"]
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp" }]
  }])
  volume { name = "tmp" }
  tags = local.tags
}

resource "aws_ecs_task_definition" "migracao" {
  family                   = "${local.nome}-migracao"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.tarefa.arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name             = "migracao"
    image            = "${local.registro}/${local.nome}-migracao:${var.tag_imagem}"
    essential        = true
    environment      = concat(local.ambiente_api, [{ name = "SEED_ADMIN_EMAIL", value = var.email_admin_inicial }])
    secrets          = concat(local.segredos_api, [{ name = "SEED_ADMIN_SENHA", valueFrom = aws_secretsmanager_secret.admin_inicial.arn }])
    logConfiguration = local.logs["migracao"]
  }])
  tags = local.tags
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.nome}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web.cpu
  memory                   = var.web.memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.tarefa.arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name             = "web"
    image            = "${local.registro}/${local.nome}-web:${var.tag_imagem}"
    essential        = true
    portMappings     = [{ containerPort = 3000, protocol = "tcp" }]
    environment      = [{ name = "NODE_ENV", value = "production" }]
    logConfiguration = local.logs["web"]
  }])
  tags = local.tags
}

# ---------------- Serviços ----------------

locals {
  servicos = {
    api    = { definicao = aws_ecs_task_definition.api.arn, desejado = var.api.minimo, alvo = aws_lb_target_group.api.arn, porta = 3333 }
    web    = { definicao = aws_ecs_task_definition.web.arn, desejado = var.web.minimo, alvo = aws_lb_target_group.web.arn, porta = 3000 }
    worker = { definicao = aws_ecs_task_definition.worker.arn, desejado = var.worker.instancias, alvo = null, porta = null }
  }
}

resource "aws_ecs_service" "servicos" {
  for_each                           = local.servicos
  name                               = "${local.nome}-${each.key}"
  cluster                            = aws_ecs_cluster.principal.id
  task_definition                    = each.value.definicao
  desired_count                      = each.value.desejado
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = each.value.alvo == null ? null : 60
  enable_execute_command             = false

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.privada[*].id
    security_groups  = [aws_security_group.servicos.id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = each.value.alvo == null ? [] : [each.value]
    content {
      target_group_arn = load_balancer.value.alvo
      container_name   = each.key
      container_port   = load_balancer.value.porta
    }
  }

  # O pipeline publica novas revisões; o Terraform não reverte a imagem implantada
  lifecycle { ignore_changes = [task_definition, desired_count] }
  depends_on = [aws_lb_listener.https]
  tags       = local.tags
}

# Escalabilidade automática por CPU (API e web)
resource "aws_appautoscaling_target" "servicos" {
  for_each           = { api = var.api, web = var.web }
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.principal.name}/${aws_ecs_service.servicos[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = each.value.minimo
  max_capacity       = each.value.maximo
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = aws_appautoscaling_target.servicos
  name               = "${local.nome}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = each.value.service_namespace
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension
  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
