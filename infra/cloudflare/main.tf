resource "cloudflare_zero_trust_tunnel_cloudflared" "consumit" {
  account_id = var.account_id
  name       = var.tunnel_name
  config_src = "cloudflare"
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "consumit" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.consumit.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "consumit" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.consumit.id
  config = {
    ingress = [
      { hostname = var.hostname, service = var.origin_service },
      { service = "http_status:404" },
    ]
  }
}

resource "cloudflare_dns_record" "consumit" {
  zone_id = var.zone_id
  name    = var.hostname
  content = "${cloudflare_zero_trust_tunnel_cloudflared.consumit.id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
  ttl     = 1
}

resource "cloudflare_ruleset" "cache" {
  zone_id = var.zone_id
  name    = "Consumit cache policy"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules = [
    {
      action            = "set_cache_settings"
      description       = "Cache immutable Next.js assets"
      expression        = "http.request.method eq \"GET\" and starts_with(http.request.uri.path, \"/_next/static/\")"
      action_parameters = { cache = true, edge_ttl = { mode = "override_origin", default = 31536000 }, browser_ttl = { mode = "override_origin", default = 31536000 } }
    },
    {
      action            = "set_cache_settings"
      description       = "Cache public catalog reads without member cookies"
      expression        = "http.request.method eq \"GET\" and (starts_with(http.request.uri.path, \"/v1/titles/\") or starts_with(http.request.uri.path, \"/v1/anime/\")) and not http.cookie contains \"consumit_session\""
      action_parameters = { cache = true, edge_ttl = { mode = "respect_origin" } }
    },
    {
      action            = "set_cache_settings"
      description       = "Never cache private or mutable APIs"
      expression        = "starts_with(http.request.uri.path, \"/health/\") or http.request.method ne \"GET\" or (starts_with(http.request.uri.path, \"/v1/\") and (http.cookie contains \"consumit_session\" or not (starts_with(http.request.uri.path, \"/v1/titles/\") or starts_with(http.request.uri.path, \"/v1/anime/\"))))"
      action_parameters = { cache = false }
    },
  ]
}

resource "cloudflare_ruleset" "waf" {
  zone_id = var.zone_id
  name    = "Consumit origin protection"
  kind    = "zone"
  phase   = "http_request_firewall_custom"
  rules = [{
    action      = "block"
    description = "Block common secret and traversal scans"
    expression  = "lower(http.request.uri.path) contains \"/.env\" or lower(http.request.uri.path) contains \"/.git\" or http.request.uri.path contains \"..\""
    }, {
    action      = "block"
    description = "Open public registration only after launch gates pass"
    enabled     = !var.public_registration_enabled
    expression  = length(var.launch_tester_ips) == 0 ? "http.request.uri.path eq \"/v1/auth/register\"" : "http.request.uri.path eq \"/v1/auth/register\" and not ip.src in {${join(" ", sort(tolist(var.launch_tester_ips)))}}"
  }]
}

resource "cloudflare_ruleset" "rate_limits" {
  zone_id = var.zone_id
  name    = "Consumit API rate limits"
  kind    = "zone"
  phase   = "http_ratelimit"
  rules = [
    {
      action      = "block"
      description = "Authentication abuse"
      expression  = "starts_with(http.request.uri.path, \"/v1/auth/\")"
      ratelimit   = { characteristics = ["cf.colo.id", "ip.src"], period = 10, requests_per_period = 10, mitigation_timeout = 10 }
    },
  ]
}
