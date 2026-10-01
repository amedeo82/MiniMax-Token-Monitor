> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# FAQ

> Find answers to common questions about M Plan tiers, usage, Subscription Keys, and usage rules.

<div id="available-plans" />

## Which M Plan tiers are available?

The available subscription tiers are **Go**, **Explore**, and **Build**.

| Tier | Intended usage | Usage relative to Go |
| :- | :- | :- |
| Go | Getting started | 1x (baseline) |
| Explore | Everyday use | 3x |
| Build | Intensive use | 7.5x |

***

<div id="switch-models" />

## Which models does M Plan include? How do I switch models?

All three tiers include the M3.1 Flash Preview text model, image and audio generation, web search, and multimodal understanding; Explore and Build also include the H3 video model, while Go does not include a video model. To switch models, enter the model ID in your API request or tool configuration.

***

<div id="minimax-code" />

## Do I need a separate subscription or API Key to use MiniMax Code?

No. After subscribing to M Plan, sign in to [MiniMax Code](https://agent.minimax.io/download) to get your member benefits. No separate subscription or Subscription Key is needed. You only need a Subscription Key to use M Plan in other AI tools such as Claude Code or Cursor.

***

<div id="multiple-tools" />

## Can I use my subscription in multiple tools at the same time?

Yes. You can use the same subscription in all supported tools, but usage is shared. Usage from all tools counts toward the same M Plan usage limits.

***

<div id="annual-billing" />

## Is annual billing cheaper?

Yes. With annual billing, you pay for 10 months and get 2 months free.

***

<div id="shared-usage" />

## Do text, image, audio, and other models have separate usage limits?

No. Text, image, audio, video, and other models included in M Plan share the same usage limits, which you can use however you need. Note that video models are subject only to the weekly window, not the 5-hour window.

***

<div id="usage-consumption" />

## Do different models consume usage at the same rate?

No. How much usage each request consumes depends mainly on:

* **Model and modality**: Models consume at different rates. Video generation consumes far more than text chat, so frequent video generation brings you to your usage limit faster.
* **Context length**: Longer conversations and more files or code in context mean more content to process in each request.
* **Task complexity**: Multi-step agent tasks send many requests in a row and call tools, so they consume much more than a single question and answer.
* **Thinking depth**: The higher the thinking depth for M3.1 Flash Preview, the more thinking content it generates and the more it consumes.

If you are reaching your usage limit quickly, use a lower thinking depth for simple tasks, start new sessions when appropriate, and include only the files the task needs.

***

<div id="check-usage" />

## How can I check M Plan usage?

You can check M Plan usage in three ways:

**Method 1: Visit the usage page**

Visit the [usage page](https://platform.minimax.io/console/usage) to view your plan, usage limits, Credits, and usage history.

**Method 2: Use MiniMax CLI**

```bash theme={null}
mmx quota
```

**Method 3: Use the API endpoint**

```bash theme={null}
curl --location 'https://www.minimax.io/v1/token_plan/remains' \
--header 'Authorization: Bearer <API Key>' \
--header 'Content-Type: application/json'
```

***

<div id="reset-calculation" />

## How is usage reset?

M Plan usage is shown through the console usage bar and controlled by usage windows:

* **Text, image, audio, and other non-video models**: Subject to a 5-hour window and a weekly window.
* **Video models**: Subject only to a weekly window, with no 5-hour window.
* **Subscription cycle**: Unused M Plan usage does not carry over to the next billing cycle.
* **Credit packs**: Valid for one year from the date of purchase. This validity period is not reset when usage windows reset.

Both windows start with your first use: the 5-hour window lasts 5 hours, and the weekly window lasts 7 days. When a window ends, your usage resets to your tier's full limit, and your next use starts a new window. The two windows reset independently, so a 5-hour reset does not reset your weekly usage.

***

<div id="usage-rollover" />

## Does unused usage accumulate or carry over?

No. Unused usage does not accumulate in the next window or carry over to the next billing period.

***

<div id="usage-limit" />

<div id="deduction-order" />

## What happens when I reach my usage limit?

When you reach your 5-hour or weekly limit, you can:

* **Use credit packs**: Your M Plan usage is always used first. Once you reach your limit, additional usage is deducted from your credit packs by default, starting with the Credits that expire soonest. Credit packs apply only to the models and capabilities they support.
* **Upgrade your subscription**: In MiniMax Code, click **Upgrade** in **Settings > Usage & Models**, or go to [Plan Details](https://platform.minimax.io/console/plan) and click **Manage subscription** to choose a higher tier with higher usage limits.
* **Wait for the usage window to reset**: Text, image, audio, and other non-video models are subject to 5-hour and weekly windows. Video models have only a weekly window; a 5-hour window reset does not reset video weekly usage.
* **Switch to pay-as-you-go**: Replace the Subscription Key in your tool with a standard API Key. Actual resource usage is charged to your account balance.

***

<div id="account-balance" />

## Will my account balance be charged when I reach my usage limit?

No. A Subscription Key only uses your M Plan usage and credit packs. When you reach your usage limit, any remaining credit pack balance is used next. Your account balance is charged only when you use a pay-as-you-go API Key.

***

<div id="m-plan-limits" />

## What are the limits of M Plan? Is it suitable for production?

M Plan is designed for individual, interactive developer use, with higher-tier plans offering higher usage limits. Pay-as-you-go is recommended for production use.

Key limits include:

* **Rate limits (RPM / TPM)**: Requests may be throttled when exceeded, typically recovering within about one minute. Limits may tighten during peak traffic.
* **Text, image, audio, and other non-video model usage**: Subject to 5-hour and weekly windows.
* **Video model usage**: Subject only to a weekly window, with no 5-hour window.

***

<div id="traffic-rules" />

## What are the platform traffic rules?

To ensure service stability and availability for all users, MiniMax may implement dynamic rate limiting during peak hours.

To prevent abnormal traffic from a small number of accounts from occupying shared computing resources and to keep the service stable for most users, the platform adjusts request rates based on account usage. We also continue to expand computing capacity and optimize our systems to provide a more stable, reliable service.

***

<div id="subscription-key" />

## What is a Subscription Key?

A Subscription Key is used for M Plan subscriptions and credit packs. Configure it in AI agents and coding tools to call available models and capabilities.

Subscription Keys are separate from standard pay-as-you-go API Keys and cannot be used interchangeably.

***

<div id="get-subscription-key" />

## Where do I get my Subscription Key?

After subscribing to M Plan, find your Subscription Key in [Plan Details](https://platform.minimax.io/console/plan). Keep it secure; do not share it or commit it to a code repository.

***

<div id="supported-tools" />

## Which tools can I use my Subscription Key with?

Any AI tool that supports the OpenAI-compatible or Anthropic-compatible protocol, such as Claude Code, Codex, Cursor, OpenCode, Hermes Agent, and OpenClaw. See each tool's guide for setup, or [Other tools](/docs/m-plan/other-tools) for general settings.

***

<div id="api-key-interchangeable" />

## Can the Subscription Key and the standard API Key be used interchangeably?

No.

* **Subscription Key**: Uses included M Plan usage and credit packs. API endpoints with pay-as-you-go pricing deduct from included M Plan usage at the corresponding endpoint price. Credit packs can be used for the models and capabilities they support and can cover eligible overflow beyond subscription usage limits.
* **Standard API Key**: Uses pay-as-you-go billing for API Platform endpoints. Actual resource usage consumes your account balance.

***

<div id="balance-still-charged" />

## Why is my account balance still being charged after subscribing?

Usually because the tool is using a pay-as-you-go API Key. Pay-as-you-go API Keys charge your account balance and do not use your M Plan usage. Replace it with your [Subscription Key](https://platform.minimax.io/console/plan).

***

<div id="credit-pack-models" />

## Which models do credit packs support?

Credit packs support the M3.1 Flash Preview text model, the H3 video model, image and audio generation, web search, and multimodal understanding.

***

<div id="credit-pack-value" />

## How are credit packs calculated?

Credit packs are a supplemental balance that can be purchased separately to cover eligible overflow within M Plan resource coverage.

* **1,000 Credits = \$1**, equivalent to the API Platform's pay-as-you-go list price.
* Calls to resources with pay-as-you-go pricing deduct the equivalent Credits amount at the resource's list price.
* When both included plan usage and credit packs can cover the same usage, included plan usage is used first, followed by credit packs for the excess.
* **Validity**: Credits are valid for one year from the date of purchase.

***

<div id="credit-pack-validity" />

## How long are credit packs valid?

Credit packs are valid for one year from the date of purchase. Their validity is not reset when usage windows reset.

***

<div id="credits-without-plan" />

## Can I use credit packs without an M Plan subscription?

Yes. Credit packs can be purchased separately and used without an M Plan subscription.

Note:

* If you also subscribe to M Plan, your plan usage is used before your credit pack.
* In MiniMax Code, credit packs purchased on their own do not include M Plan member benefits, such as additional cloud projects, scheduled tasks, and website publishing limits, custom domains, and watermark removal.
* For resources outside M Plan coverage, use a pay-as-you-go API Key.

***

<div id="upgrade-plan" />

## How do I upgrade, and when does it take effect?

In [Plan Details](https://platform.minimax.io/console/plan), click **Manage subscription** and choose your target tier. The unused portion of your current subscription is prorated by the time remaining and applied toward the upgrade, so you only pay the difference. Once you complete payment, the upgrade takes effect immediately, and your subscription then renews at the new tier's price. See [Upgrades and cancellation](/docs/m-plan/change-plan).

***

<div id="downgrade" />

## Can I downgrade?

Downgrades are not currently supported.

***

<div id="monthly-to-annual" />

## Can I switch from monthly to annual billing?

A monthly subscription can be upgraded to a higher tier with monthly or annual billing. An annual subscription can be upgraded to a higher tier with annual billing.

***

<div id="cancel-renewal" />

## How do I cancel auto-renewal?

Turn off automatic renewal in [Plan Details](https://platform.minimax.io/console/plan). Your benefits remain available for the current paid period, and the subscription will not renew when it ends.

If you change your mind, you can turn automatic renewal back on in Plan Details before your subscription expires.

***

<div id="token-plan-users" />

## What do I need to do as a Token Plan subscriber?

Nothing. Your current plan and benefits stay the same, and as long as auto-renewal stays on, your subscription renews at the original price with the same benefits. You can also upgrade to M Plan at any time, and the unused portion of your current subscription will be credited toward the cost. Learn more about [what changes for Token Plan subscribers](/docs/m-plan/token-plan-notice).

***

<div id="tps-calculation" />

## How is TPS (Tokens Per Second) calculated for LLMs?

TPS measures the number of tokens generated per second, and is used to evaluate the inference output speed of a model. The formula is:

$$
\text{TPS} = \frac{\text{Number of output tokens}}{\text{Time of last token} - \text{Time of first token}}
$$

In other words, timing starts when the model outputs the first token and ends when the last token is generated. The total number of tokens produced is then divided by that elapsed time (in seconds).

<Note>
  TPS may fluctuate during actual usage. The TPS values indicated on each model page are reference values.
</Note>

***

<div id="error-401" />

## Still getting 401 after login?

`mmx auth login` usually auto-detects the service region from your API Key. If you still get 401, region detection likely failed. Set it manually:

```bash theme={null}
mmx config set --key region --value global   # Global API Key
mmx config set --key region --value cn       # Mainland China API Key
```

Run `mmx auth status` to confirm the active region matches the platform your key comes from.
