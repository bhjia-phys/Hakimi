Query provider usage: the plan quota (used/limit/reset) and, for the Kimi routes,
the Extra Usage balance (cents and currency) for the configured supported usage
providers — managed Kimi OAuth, the official `api.kimi.com/coding` API-key
provider, managed OpenAI Codex OAuth, and the exact-base OpenCode Go provider.
For an official DeepSeek provider (when the `deepseek_usage` flag is enabled) it
instead reports locally measured today/month token usage with an estimated CNY
cost plus the official account balance; that cost is an estimate, not a quota
percentage, so it must never be treated as remaining quota.

Pass `provider` to query one provider; omit it to query every configured
supported usage provider at once. Providers without a usage endpoint report
`unsupported`; failed queries report `error` with the credential redacted. Do
not claim a balance the tool did not report. Before starting many subagents,
query every supported provider and compare the lowest remaining percentage
across each provider's reported windows. Choose routes by both task fit and
remaining quota, actively avoiding depleted providers. If a usage query fails,
treat that provider as unknown rather than guessing its balance or switching
presets solely because of the failure.
