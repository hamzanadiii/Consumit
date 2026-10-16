resource "aws_s3_bucket" "backup" {
  bucket              = var.backup_bucket
  object_lock_enabled = true
  force_destroy       = false
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_object_lock_configuration" "backup" {
  bucket     = aws_s3_bucket.backup.id
  depends_on = [aws_s3_bucket_versioning.backup]
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 14
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket     = aws_s3_bucket.backup.id
  depends_on = [aws_s3_bucket_versioning.backup]
  rule {
    id     = "expire-only-noncurrent-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 14 }
  }
  rule {
    id     = "remove-expired-delete-markers"
    status = "Enabled"
    filter { prefix = "" }
    expiration { expired_object_delete_marker = true }
  }
}

resource "aws_s3_bucket_policy" "backup" {
  bucket = aws_s3_bucket.backup.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Sid       = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.backup.arn, "${aws_s3_bucket.backup.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}

resource "aws_iam_user" "backup" { name = "consumit-backup" }

resource "aws_iam_user_policy" "backup" {
  user = aws_iam_user.backup.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:GetBucketLocation", "s3:ListBucket", "s3:ListBucketMultipartUploads"], Resource = aws_s3_bucket.backup.arn },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], Resource = ["${aws_s3_bucket.backup.arn}/pgbackrest/*", "${aws_s3_bucket.backup.arn}/restic/*", "${aws_s3_bucket.backup.arn}/drills/*"] },
    { Effect = "Deny", Action = ["s3:DeleteObjectVersion", "s3:BypassGovernanceRetention"], Resource = "${aws_s3_bucket.backup.arn}/*" }
  ] })
}

# The offline recovery identity reads protected versions and writes new current
# versions. It has no authority to remove retained versions or bypass retention.
resource "aws_iam_user" "recovery" { name = "consumit-recovery" }

resource "aws_iam_user_policy" "recovery" {
  user = aws_iam_user.recovery.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:GetBucketLocation", "s3:ListBucket", "s3:ListBucketVersions"], Resource = aws_s3_bucket.backup.arn },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectRetention", "s3:PutObject"], Resource = "${aws_s3_bucket.backup.arn}/*" },
    { Effect = "Deny", Action = ["s3:DeleteObjectVersion", "s3:BypassGovernanceRetention"], Resource = "${aws_s3_bucket.backup.arn}/*" }
  ] })
}
