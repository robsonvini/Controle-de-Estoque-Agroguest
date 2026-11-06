# Monitoramento de disponibilidade e alarmes (SNS → e-mail).

resource "aws_sns_topic" "alertas" {
  name              = "${local.nome}-alertas"
  kms_master_key_id = "alias/aws/sns"
  tags              = local.tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.email_alertas
}

# Verificação externa de disponibilidade (Route 53 health check)
resource "aws_route53_health_check" "aplicacao" {
  fqdn              = var.dominio
  type              = "HTTPS"
  port              = 443
  resource_path     = "/api/health/pronto"
  failure_threshold = 3
  request_interval  = 30
  regions           = ["us-east-1", "us-west-2", "sa-east-1"]
  tags              = merge(local.tags, { Name = "${local.nome}-disponibilidade" })
}

locals {
  alarmes = {
    disponibilidade = {
      namespace = "AWS/Route53", metrica = "HealthCheckStatus", estatistica = "Minimum", limite = 1, comparacao = "LessThanThreshold"
      dimensoes = { HealthCheckId = aws_route53_health_check.aplicacao.id }
      descricao = "Aplicação indisponível na verificação externa"
    }
    erros_5xx = {
      namespace = "AWS/ApplicationELB", metrica = "HTTPCode_Target_5XX_Count", estatistica = "Sum", limite = 20, comparacao = "GreaterThanThreshold"
      dimensoes = { LoadBalancer = aws_lb.principal.arn_suffix }
      descricao = "Muitas respostas 5xx da aplicação"
    }
    api_sem_alvos = {
      namespace = "AWS/ApplicationELB", metrica = "HealthyHostCount", estatistica = "Minimum", limite = 1, comparacao = "LessThanThreshold"
      dimensoes = { LoadBalancer = aws_lb.principal.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
      descricao = "Nenhuma instância saudável da API"
    }
    latencia_api = {
      namespace = "AWS/ApplicationELB", metrica = "TargetResponseTime", estatistica = "Average", limite = 1.5, comparacao = "GreaterThanThreshold"
      dimensoes = { LoadBalancer = aws_lb.principal.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
      descricao = "Tempo de resposta médio da API acima de 1,5 s"
    }
    cpu_banco = {
      namespace = "AWS/RDS", metrica = "CPUUtilization", estatistica = "Average", limite = 80, comparacao = "GreaterThanThreshold"
      dimensoes = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
      descricao = "CPU do banco acima de 80%"
    }
    espaco_banco = {
      namespace = "AWS/RDS", metrica = "FreeStorageSpace", estatistica = "Minimum", limite = 5 * 1024 * 1024 * 1024, comparacao = "LessThanThreshold"
      dimensoes = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
      descricao = "Menos de 5 GB livres no banco"
    }
    conexoes_banco = {
      namespace = "AWS/RDS", metrica = "DatabaseConnections", estatistica = "Maximum", limite = 150, comparacao = "GreaterThanThreshold"
      dimensoes = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
      descricao = "Conexões ao banco acima do esperado"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "alarmes" {
  for_each            = local.alarmes
  alarm_name          = "${local.nome}-${each.key}"
  alarm_description   = each.value.descricao
  namespace           = each.value.namespace
  metric_name         = each.value.metrica
  statistic           = each.value.estatistica
  dimensions          = each.value.dimensoes
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = each.value.limite
  comparison_operator = each.value.comparacao
  treat_missing_data  = each.key == "disponibilidade" ? "breaching" : "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  ok_actions          = [aws_sns_topic.alertas.arn]
  tags                = local.tags
}

# Erros registrados pela aplicação (logs estruturados do pino: level >= 50)
resource "aws_cloudwatch_log_metric_filter" "erros_api" {
  name           = "${local.nome}-erros-api"
  log_group_name = aws_cloudwatch_log_group.servicos["api"].name
  pattern        = "{ $.level >= 50 }"
  metric_transformation {
    name      = "ErrosApi"
    namespace = "EstoqueAgrogest/${var.ambiente}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "erros_api" {
  alarm_name          = "${local.nome}-erros-api"
  alarm_description   = "Erros não tratados registrados pela API"
  namespace           = "EstoqueAgrogest/${var.ambiente}"
  metric_name         = "ErrosApi"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  tags                = local.tags
}
