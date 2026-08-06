# Security Boundary Audit Report

<!-- AUDIT-META
worker: ln-621
category: Security Boundary
domain: global
scan_path: .
score: 3.0
total_issues: 5
critical: 2
high: 3
medium: 0
low: 0
status: completed
-->

## Checks

| ID | Check | Status | Details |
|----|-------|--------|---------|
| hardcoded_secrets | Hardcoded secrets | passed | Runtime credentials come from environment configuration. |
| sql_injection | SQL injection | passed | Dynamic OS identifiers are validated as numeric before query construction. |
| xss_vulnerabilities | XSS | passed | React output is escaped and no unsafe HTML sink was found in the reviewed supplier flow. |
| sensitive_env_defaults | Sensitive defaults | passed | Sensitive configuration defaults to empty values. |
| missing_input_validation | Access control at API boundaries | failed | Several operational endpoints have no authentication or supplier scope. |

## Findings

| Severity | Location | Issue | Principle | Recommendation | Effort |
|----------|----------|-------|-----------|----------------|--------|
| CRITICAL | cabonnet/app.py:747 | Raw `/pendente`, `/agendado` and `/futuro` exports expose the complete OS dataset without authentication or supplier filtering. | Deny by default / object-level authorization | Require a session and apply the same supplier CSV scope used by `/query`. | M |
| CRITICAL | cabonnet/app.py:1093 | Telegram notification endpoints allow unauthenticated status reads and message/document/photo sends. | Privileged operations require explicit authorization | Restrict reads to authenticated internal users and writes to gestor/operator permissions; deny supplier sessions. | M |
| HIGH | cabonnet/app.py:729 | `/stats` computes global KPIs and is consumed by the supplier dashboard without session scope. | Tenant-scoped aggregation | Require a session and compute statistics from supplier-filtered CSV snapshots. | M |
| HIGH | cabonnet/app.py:942 | Operational endpoints such as atendimento, geo execution, Juniper and most AI routes have no authorization dependency. | Least privilege / deny by default | Add a centralized supplier deny-by-default boundary plus route-specific internal permissions. | L |
| HIGH | servidor.js:346 | Direct Node `/grafana/*` handlers bypass Python session authorization and can expose global monitoring data. | Consistent enforcement point | Reject supplier sessions or proxy authorization through the authenticated backend before executing direct Grafana handlers. | M |
