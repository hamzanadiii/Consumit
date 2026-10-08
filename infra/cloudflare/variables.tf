variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "account_id" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "hostname" {
  type = string
}

variable "tunnel_name" {
  type    = string
  default = "consumit-production"
}

variable "origin_service" {
  type    = string
  default = "http://gateway:80"
}

variable "public_registration_enabled" {
  type    = bool
  default = false
}

variable "launch_tester_ips" {
  type    = set(string)
  default = []
  validation {
    condition     = alltrue([for ip in var.launch_tester_ips : can(cidrhost("${ip}/32", 0)) || can(cidrhost("${ip}/128", 0))])
    error_message = "Provide exact IPv4 or IPv6 tester addresses, without CIDR ranges."
  }
}
