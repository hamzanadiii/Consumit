output "backup_bucket" { value = aws_s3_bucket.backup.id }
output "feedback_queue_url" { value = aws_sqs_queue.feedback.url }
output "configuration_set" { value = aws_sesv2_configuration_set.auth.configuration_set_name }
output "dns_records" {
  value = concat(
    [{ name = "_amazonses.${var.domain}", type = "TXT", content = aws_ses_domain_identity.consumit.verification_token }],
    [for token in aws_ses_domain_dkim.consumit.dkim_tokens : { name = "${token}._domainkey.${var.domain}", type = "CNAME", content = "${token}.dkim.amazonses.com" }],
    [
      { name = "bounce.${var.domain}", type = "MX", content = "feedback-smtp.ca-central-1.amazonses.com", priority = 10 },
      { name = "bounce.${var.domain}", type = "TXT", content = "v=spf1 include:amazonses.com ~all" },
      { name = "_dmarc.${var.domain}", type = "TXT", content = "v=DMARC1; p=quarantine; adkim=r; aspf=r" }
    ]
  )
}
