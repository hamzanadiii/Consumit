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

variable "auth_requests_per_minute" {
  type    = number
  default = 10
}

variable "playback_requests_per_minute" {
  type    = number
  default = 30
}
