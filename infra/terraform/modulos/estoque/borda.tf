# Certificado SSL (ACM), balanceador (ALB), WAF e DNS.

resource "aws_acm_certificate" "principal" {
  domain_name       = var.dominio
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
  tags = local.tags
}

resource "aws_route53_record" "validacao" {
  for_each = { for o in aws_acm_certificate.principal.domain_validation_options : o.domain_name => o }
  zone_id  = var.zona_route53_id
  name     = each.value.resource_record_name
  type     = each.value.resource_record_type
  records  = [each.value.resource_record_value]
  ttl      = 300
}

resource "aws_acm_certificate_validation" "principal" {
  certificate_arn         = aws_acm_certificate.principal.arn
  validation_record_fqdns = [for r in aws_route53_record.validacao : r.fqdn]
}

resource "aws_lb" "principal" {
  name                       = local.nome
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.publica[*].id
  drop_invalid_header_fields = true
  enable_deletion_protection = var.protecao_exclusao
  idle_timeout               = 120
  tags                       = local.tags
}

resource "aws_lb_target_group" "api" {
  name                 = "${local.nome}-api"
  port                 = 3333
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30
  health_check {
    path                = "/api/health/pronto"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  tags = local.tags
}

resource "aws_lb_target_group" "web" {
  name                 = "${local.nome}-web"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30
  health_check {
    path    = "/login"
    matcher = "200"
  }
  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.principal.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.principal.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.principal.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# /api/* vai direto para a API (mesmo domínio: cookies SameSite=Strict e sem CORS)
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    path_pattern { values = ["/api/*"] }
  }
}

# ---------------- WAF ----------------

resource "aws_wafv2_web_acl" "principal" {
  name  = local.nome
  scope = "REGIONAL"
  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = {
      AWSManagedRulesCommonRuleSet          = 1
      AWSManagedRulesKnownBadInputsRuleSet  = 2
      AWSManagedRulesSQLiRuleSet            = 3
      AWSManagedRulesAmazonIpReputationList = 4
    }
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
          # Upload de imagens de produtos (até 5 MB) excede o limite padrão de corpo da regra genérica
          dynamic "rule_action_override" {
            for_each = rule.key == "AWSManagedRulesCommonRuleSet" ? ["SizeRestrictions_BODY"] : []
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.nome}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "limite-por-ip"
    priority = 10
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.limite_requisicoes_waf
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.nome}-limite-por-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.nome
    sampled_requests_enabled   = true
  }
  tags = local.tags
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.principal.arn
  web_acl_arn  = aws_wafv2_web_acl.principal.arn
}

# ---------------- DNS ----------------

resource "aws_route53_record" "aplicacao" {
  zone_id = var.zona_route53_id
  name    = var.dominio
  type    = "A"
  alias {
    name                   = aws_lb.principal.dns_name
    zone_id                = aws_lb.principal.zone_id
    evaluate_target_health = true
  }
}
