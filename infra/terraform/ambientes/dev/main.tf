# Ambiente de DESENVOLVIMENTO — custo mínimo; dados descartáveis.
terraform {
  required_version = ">= 1.9"
  backend "s3" {}
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.regiao
  default_tags { tags = { CentroDeCusto = "estoque" } }
}

provider "aws" {
  alias  = "dr"
  region = var.regiao
}

variable "regiao" {
  type    = string
  default = "sa-east-1"
}
variable "dominio" { type = string }
variable "zona_route53_id" { type = string }
variable "crm_base_url" { type = string }
variable "email_alertas" { type = string }
variable "email_admin_inicial" { type = string }

module "estoque" {
  source    = "../../modulos/estoque"
  providers = { aws = aws, aws.dr = aws.dr }

  ambiente                 = "dev"
  dominio                  = var.dominio
  zona_route53_id          = var.zona_route53_id
  crm_base_url             = var.crm_base_url
  email_alertas            = var.email_alertas
  email_admin_inicial      = var.email_admin_inicial
  cidr_vpc                 = "10.40.0.0/16"
  rds_classe               = "db.t4g.small"
  rds_armazenamento_gb     = 20
  rds_retencao_backup_dias = 3
  protecao_exclusao        = false
  limite_requisicoes_waf   = 5000
}

output "saidas" {
  value = {
    url           = module.estoque.url_aplicacao
    cluster       = module.estoque.cluster_ecs
    repositorios  = module.estoque.repositorios_ecr
    admin_inicial = module.estoque.segredo_admin_inicial
  }
}
