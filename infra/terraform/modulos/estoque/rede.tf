# VPC com sub-redes públicas (ALB, NAT) e privadas (ECS, RDS) em duas zonas de disponibilidade.

resource "aws_vpc" "principal" {
  cidr_block           = var.cidr_vpc
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(local.tags, { Name = local.nome })
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
  tags   = merge(local.tags, { Name = local.nome })
}

resource "aws_subnet" "publica" {
  count                   = length(local.azs)
  vpc_id                  = aws_vpc.principal.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.cidr_vpc, 8, count.index)
  map_public_ip_on_launch = false
  tags                    = merge(local.tags, { Name = "${local.nome}-publica-${count.index}" })
}

resource "aws_subnet" "privada" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.principal.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, count.index + 10)
  tags              = merge(local.tags, { Name = "${local.nome}-privada-${count.index}" })
}

resource "aws_eip" "nat" {
  count  = var.nat_por_az ? length(local.azs) : 1
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${local.nome}-nat-${count.index}" })
}

resource "aws_nat_gateway" "principal" {
  count         = length(aws_eip.nat)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.publica[count.index].id
  tags          = merge(local.tags, { Name = "${local.nome}-${count.index}" })
  depends_on    = [aws_internet_gateway.principal]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }
  tags = merge(local.tags, { Name = "${local.nome}-publica" })
}

resource "aws_route_table_association" "publica" {
  count          = length(aws_subnet.publica)
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table" "privada" {
  count  = length(local.azs)
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.principal[var.nat_por_az ? count.index : 0].id
  }
  tags = merge(local.tags, { Name = "${local.nome}-privada-${count.index}" })
}

resource "aws_route_table_association" "privada" {
  count          = length(aws_subnet.privada)
  subnet_id      = aws_subnet.privada[count.index].id
  route_table_id = aws_route_table.privada[count.index].id
}

# Tráfego ao S3 sem passar pelo NAT (custo e segurança)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${data.aws_region.atual.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.privada[*].id
  tags              = merge(local.tags, { Name = "${local.nome}-s3" })
}

# ---------------- Grupos de segurança ----------------

resource "aws_security_group" "alb" {
  name        = "${local.nome}-alb"
  description = "Entrada HTTPS publica no balanceador"
  vpc_id      = aws_vpc.principal.id
  tags        = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "Somente para redirecionar a HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_saida" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.servicos.id
  ip_protocol                  = "-1"
}

resource "aws_security_group" "servicos" {
  name        = "${local.nome}-servicos"
  description = "Tarefas ECS (API, worker, web)"
  vpc_id      = aws_vpc.principal.id
  tags        = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "servicos_do_alb" {
  security_group_id            = aws_security_group.servicos.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3333
}

resource "aws_vpc_security_group_egress_rule" "servicos_saida" {
  security_group_id = aws_security_group.servicos.id
  description       = "Saida para RDS, S3, CRM, SES e ECR"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "rds" {
  name        = "${local.nome}-rds"
  description = "PostgreSQL acessivel apenas pelas tarefas ECS"
  vpc_id      = aws_vpc.principal.id
  tags        = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "rds_dos_servicos" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.servicos.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
