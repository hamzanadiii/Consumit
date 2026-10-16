resource "aws_budgets_budget" "usage" {
  for_each     = toset(["2", "5"])
  name         = "consumit-gross-usage-${each.key}-usd"
  budget_type  = "COST"
  limit_amount = each.key
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  cost_types {
    include_credit = false
    include_refund = false
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
}
resource "aws_iam_user" "credit_monitor" { name = "consumit-credit-monitor" }
resource "aws_iam_user_policy" "credit_monitor" {
  user = aws_iam_user.credit_monitor.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Action = ["freetier:GetAccountPlanState", "freetier:GetFreeTierUsage", "budgets:ViewBudget"], Resource = "*"
  }] })
}
