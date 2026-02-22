#!/usr/bin/env bash
# Run this after pushing the repo to GitHub for the first time.
# Requires: gh CLI authenticated with repo scope.

set -euo pipefail

OWNER="CPloscaru"
REPO="caraca"
BRANCH="main"

echo "Setting branch protection on $OWNER/$REPO/$BRANCH..."

gh api -X PUT "/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  --input - <<EOF
{
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "required_status_checks": null,
  "enforce_admins": false,
  "restrictions": null
}
EOF

echo "Branch protection configured successfully."
