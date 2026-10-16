resource "aws_ses_domain_identity" "consumit" { domain = var.domain }
resource "aws_ses_domain_dkim" "consumit" { domain = aws_ses_domain_identity.consumit.domain }
resource "aws_ses_domain_mail_from" "consumit" {
  domain                 = aws_ses_domain_identity.consumit.domain
  mail_from_domain       = "bounce.${var.domain}"
  behavior_on_mx_failure = "RejectMessage"
}

resource "aws_sesv2_account_suppression_attributes" "consumit" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

resource "aws_sesv2_configuration_set" "auth" { configuration_set_name = "consumit-auth" }
resource "aws_sns_topic" "feedback" { name = "consumit-ses-feedback" }
resource "aws_sns_topic_policy" "feedback" {
  arn = aws_sns_topic.feedback.arn
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Principal = { Service = "ses.amazonaws.com" }, Action = "sns:Publish", Resource = aws_sns_topic.feedback.arn,
    Condition = { StringEquals = { "AWS:SourceAccount" = data.aws_caller_identity.current.account_id }, ArnEquals = { "AWS:SourceArn" = aws_sesv2_configuration_set.auth.arn } }
  }] })
}
resource "aws_sesv2_configuration_set_event_destination" "feedback" {
  configuration_set_name = aws_sesv2_configuration_set.auth.configuration_set_name
  event_destination_name = "feedback"
  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT", "DELIVERY", "SEND", "RENDERING_FAILURE", "DELIVERY_DELAY"]
    sns_destination { topic_arn = aws_sns_topic.feedback.arn }
  }
}
resource "aws_sqs_queue" "dead_letters" {
  name                      = "consumit-ses-feedback-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "feedback" {
  name                       = "consumit-ses-feedback"
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.dead_letters.arn, maxReceiveCount = 5 })
}
resource "aws_sqs_queue_policy" "feedback" {
  queue_url = aws_sqs_queue.feedback.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Principal = { Service = "sns.amazonaws.com" }, Action = "sqs:SendMessage", Resource = aws_sqs_queue.feedback.arn,
    Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.feedback.arn } }
  }] })
}
resource "aws_sns_topic_subscription" "feedback" {
  topic_arn            = aws_sns_topic.feedback.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.feedback.arn
  raw_message_delivery = true
}
resource "aws_iam_user" "email" { name = "consumit-email" }
resource "aws_iam_user_policy" "email" {
  user = aws_iam_user.email.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Action = ["ses:SendEmail"], Resource = [aws_ses_domain_identity.consumit.arn, aws_sesv2_configuration_set.auth.arn],
    Condition = { StringEquals = { "ses:FromAddress" = "auth@${var.domain}", "aws:RequestedRegion" = "ca-central-1" } }
  }] })
}
resource "aws_iam_user" "feedback" { name = "consumit-feedback" }
resource "aws_iam_user_policy" "feedback" {
  user = aws_iam_user.feedback.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = aws_sqs_queue.feedback.arn
  }] })
}
