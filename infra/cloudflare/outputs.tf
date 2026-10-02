output "tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.consumit.id
}

output "tunnel_token" {
  value     = data.cloudflare_zero_trust_tunnel_cloudflared_token.consumit.token
  sensitive = true
}

output "hostname" {
  value = var.hostname
}
