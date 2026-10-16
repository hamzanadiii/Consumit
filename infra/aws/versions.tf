terraform {
  required_version = ">= 1.8, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "ca-central-1"
  default_tags {
    tags = { Project = "Consumit", Environment = "production" }
  }
}

variable "backup_bucket" {
  type        = string
  description = "Globally unique private S3 bucket name, chosen before apply."
}

variable "domain" {
  type    = string
  default = "consumit.online"
}

variable "budget_email" {
  type        = string
  description = "Operator email for AWS budget notifications, confirmed privately."
}

data "aws_caller_identity" "current" {}
