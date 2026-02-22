#!/usr/bin/env bash
# Configure branch protection rules for the main branch.
# Requires: gh CLI authenticated with repo scope.
#
# IMPORTANT: Run AFTER the first successful CI workflow run so that
# GitHub recognizes the status check names. If you run this before
# any CI run, the required_status_checks contexts will be accepted
# but won't match any actual checks until a workflow completes.

set -euo pipefail

trap 'echo "ERROR: Failed to configure branch protection"; exit 1' ERR

OWNER="CPloscaru"
REPO="caraca"
BRANCH="main"

echo "Setting branch protection on $OWNER/$REPO/$BRANCH..."

gh api -X PUT "/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint, Type-check & Build", "Secret Scan"]
  },
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "enforce_admins": false,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF

echo "Branch protection configured."

# Signed commits require a separate API endpoint (not part of the
# main protection payload). This enables the "require signed commits"
# rule on the protected branch.
echo "Enabling signed commit requirement..."

gh api -X POST "/repos/$OWNER/$REPO/branches/$BRANCH/protection/required_signatures" \
  --header "Accept: application/vnd.github.zzzax-preview+json"

echo "Branch protection fully configured."
