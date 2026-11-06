# Acesso do GitHub Actions à AWS via OIDC (sem chaves de acesso de longa duração).
# Aplicar uma vez por conta: terraform init && terraform apply -var="repositorio=agrogest/estoque"
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = var.regiao
}

variable "regiao" {
  type    = string
  default = "sa-east-1"
}

variable "repositorio" {
  description = "Repositório GitHub no formato organizacao/nome"
  type        = string
}

data "aws_caller_identity" "atual" {}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  # Cada ambiente do GitHub (Settings → Environments) assume o seu próprio papel
  ambientes = {
    dev     = "desenvolvimento"
    homolog = "homologacao"
    prod    = "producao"
  }
}

resource "aws_iam_role" "deploy" {
  for_each = local.ambientes
  name     = "estoque-${each.key}-deploy-github"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.repositorio}:environment:${each.value}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  for_each = aws_iam_role.deploy
  role     = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
        ]
        Resource = "arn:aws:ecr:${var.regiao}:${data.aws_caller_identity.atual.account_id}:repository/estoque-${each.key}-*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:DescribeServices",
          "ecs:UpdateService", "ecs:RunTask", "ecs:DescribeTasks",
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestedRegion" = var.regiao } }
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:aws:iam::${data.aws_caller_identity.atual.account_id}:role/estoque-${each.key}-*"
      },
    ]
  })
}

output "papeis_deploy" {
  description = "Cadastre cada ARN como segredo AWS_ROLE_ARN no ambiente correspondente do GitHub"
  value       = { for k, r in aws_iam_role.deploy : local.ambientes[k] => r.arn }
}
