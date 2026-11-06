output "url_aplicacao" {
  value = "https://${var.dominio}"
}

output "cluster_ecs" {
  value = aws_ecs_cluster.principal.name
}

output "repositorios_ecr" {
  value = { for k, r in aws_ecr_repository.imagens : k => r.repository_url }
}

output "bucket_arquivos" {
  value = aws_s3_bucket.arquivos.bucket
}

output "endpoint_banco" {
  value     = aws_db_instance.principal.address
  sensitive = true
}

output "segredo_admin_inicial" {
  description = "Recupere a senha inicial com: aws secretsmanager get-secret-value --secret-id <arn>"
  value       = aws_secretsmanager_secret.admin_inicial.arn
}

output "topico_alertas" {
  value = aws_sns_topic.alertas.arn
}
