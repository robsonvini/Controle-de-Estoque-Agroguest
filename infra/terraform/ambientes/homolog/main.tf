# Ambiente de HOMOLOGAÇÃO — espelha a produção em escala reduzida (validação antes do deploy em prod).
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
  region = var.regiao_dr
}

variable "regiao" {
  type    = string
  default = "sa-east-1"
}
variable "regiao_dr" {
  type    = string
  default = "us-east-1"
}
variable "dominio" { type = string }
variable "zona_route53_id" { type = string }
variable "crm_base_url" { type = string }
variable "email_alertas" { type = string }
variable "email_admin_inicial" { type = string }

module "estoque" {
  source    = "../../modulos/estoque"
  providers = { aws = aws, aws.dr = aws.dr }

  ambiente                 = "homolog"
  dominio                  = var.dominio
  zona_route53_id          = var.zona_route53_id
  crm_base_url             = var.crm_base_url
  email_alertas            = var.email_alertas
  email_admin_inicial      = var.email_admin_inicial
  cidr_vpc                 = "10.41.0.0/16"
  rds_classe               = "db.t4g.medium"
  rds_multi_az             = false
  rds_retencao_backup_dias = 7
  protecao_exclusao        = true
  api                      = { cpu = 512, memoria = 1024, minimo = 1, maximo = 3 }
  web                      = { cpu = 256, memoria = 512, minimo = 1, maximo = 2 }
  worker                   = { cpu = 256, memoria = 512, instancias = 1 }
}

output "saidas" {
  value = {
    url           = module.estoque.url_aplicacao
    cluster       = module.estoque.cluster_ecs
    repositorios  = module.estoque.repositorios_ecr
    admin_inicial = module.estoque.segredo_admin_inicial
  }
}
