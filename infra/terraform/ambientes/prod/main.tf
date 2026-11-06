# Ambiente de PRODUÇÃO — alta disponibilidade, backups longos e recuperação de desastres.
terraform {
  required_version = ">= 1.9"
  backend "s3" {
    # Preencha via: terraform init -backend-config=backend.hcl
  }
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.regiao
  default_tags { tags = { CentroDeCusto = "estoque" } }
}

# Região de recuperação de desastres (cópia dos backups do banco)
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
variable "email_remetente" {
  type    = string
  default = ""
}

module "estoque" {
  source    = "../../modulos/estoque"
  providers = { aws = aws, aws.dr = aws.dr }

  ambiente                 = "prod"
  dominio                  = var.dominio
  zona_route53_id          = var.zona_route53_id
  crm_base_url             = var.crm_base_url
  email_alertas            = var.email_alertas
  email_admin_inicial      = var.email_admin_inicial
  email_remetente          = var.email_remetente
  cidr_vpc                 = "10.42.0.0/16"
  nat_por_az               = true
  rds_classe               = "db.r7g.large"
  rds_armazenamento_gb     = 100
  rds_multi_az             = true
  rds_retencao_backup_dias = 35
  replicar_backups_dr      = true
  protecao_exclusao        = true
  api                      = { cpu = 1024, memoria = 2048, minimo = 2, maximo = 8 }
  web                      = { cpu = 512, memoria = 1024, minimo = 2, maximo = 6 }
  worker                   = { cpu = 512, memoria = 1024, instancias = 2 }
}

output "saidas" {
  value = {
    url            = module.estoque.url_aplicacao
    cluster        = module.estoque.cluster_ecs
    repositorios   = module.estoque.repositorios_ecr
    admin_inicial  = module.estoque.segredo_admin_inicial
    topico_alertas = module.estoque.topico_alertas
  }
}
