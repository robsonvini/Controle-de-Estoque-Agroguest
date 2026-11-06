variable "ambiente" {
  description = "dev, homolog ou prod"
  type        = string
  validation {
    condition     = contains(["dev", "homolog", "prod"], var.ambiente)
    error_message = "ambiente deve ser dev, homolog ou prod."
  }
}

variable "dominio" {
  description = "Nome de domínio da aplicação (ex.: estoque.agrogest.com.br)"
  type        = string
}

variable "zona_route53_id" {
  description = "ID da zona hospedada no Route 53 para o domínio (certificado ACM e registro DNS)"
  type        = string
}

variable "cidr_vpc" {
  type    = string
  default = "10.40.0.0/16"
}

variable "nat_por_az" {
  description = "Um NAT Gateway por zona de disponibilidade (alta disponibilidade; recomendado em prod)"
  type        = bool
  default     = false
}

variable "rds_classe" {
  type    = string
  default = "db.t4g.medium"
}

variable "rds_armazenamento_gb" {
  type    = number
  default = 50
}

variable "rds_multi_az" {
  type    = bool
  default = false
}

variable "rds_retencao_backup_dias" {
  description = "Retenção dos backups automáticos (PITR)"
  type        = number
  default     = 7
}

variable "replicar_backups_dr" {
  description = "Replica os backups automáticos do RDS para a região de recuperação de desastres"
  type        = bool
  default     = false
}

variable "protecao_exclusao" {
  type    = bool
  default = true
}

variable "api" {
  description = "Dimensionamento do serviço da API"
  type = object({
    cpu     = number
    memoria = number
    minimo  = number
    maximo  = number
  })
  default = { cpu = 512, memoria = 1024, minimo = 1, maximo = 2 }
}

variable "web" {
  type = object({
    cpu     = number
    memoria = number
    minimo  = number
    maximo  = number
  })
  default = { cpu = 256, memoria = 512, minimo = 1, maximo = 2 }
}

variable "worker" {
  type = object({
    cpu        = number
    memoria    = number
    instancias = number
  })
  default = { cpu = 256, memoria = 512, instancias = 1 }
}

variable "tag_imagem" {
  description = "Tag inicial das imagens (o pipeline de deploy publica novas revisões)"
  type        = string
  default     = "inicial"
}

variable "crm_base_url" {
  description = "URL base da API do CRM Agrogest"
  type        = string
}

variable "email_alertas" {
  description = "E-mail que recebe os alarmes de monitoramento (SNS)"
  type        = string
}

variable "email_remetente" {
  description = "Remetente dos e-mails de notificação (identidade verificada no SES)"
  type        = string
  default     = ""
}

variable "limite_requisicoes_waf" {
  description = "Requisições por 5 minutos por IP antes do bloqueio pelo WAF"
  type        = number
  default     = 2000
}

variable "tags" {
  type    = map(string)
  default = {}
}
