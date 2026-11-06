terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.0"
      configuration_aliases = [aws.dr]
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

data "aws_region" "atual" {}
data "aws_caller_identity" "atual" {}
data "aws_availability_zones" "disponiveis" { state = "available" }

locals {
  nome = "estoque-${var.ambiente}"
  azs  = slice(data.aws_availability_zones.disponiveis.names, 0, 2)
  tags = merge(var.tags, {
    Projeto  = "estoque-agrogest"
    Ambiente = var.ambiente
    Gerencia = "terraform"
  })
}
