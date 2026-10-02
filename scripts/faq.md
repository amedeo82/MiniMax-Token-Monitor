> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# FAQs

> Token Plan FAQs

<div id="token-plan-upgrade" />

## What changed in the Token Plan upgrade?

Token Plan now uses usage-based deduction. The main changes are:

* **Usage-based deduction**: Usage is deducted according to actual resource consumption. Simple tasks consume less, while complex tasks deduct based on real usage.
* **Unified quota pool**: Model usage covered by Token Plan shares the same included Token Plan quota instead of separate quotas by capability.
* **Clearer usage display**: The console shows current usage through a usage bar.
* **Updated model capabilities**: New model capabilities such as M3 can be used through the relevant API or tool integration pages.

***

<div id="upgrade-usage-capacity" />

## Will the upgrade reduce my usable quota?

No. Daily chat, writing, translation, coding, and search workflows should remain stable. With usage-based deduction, simple tasks usually consume less, while long-context, multi-turn reasoning, multimodal tasks, and complex agent workflows deduct according to actual resource usage.

The console usage bar is the source of truth for your current available usage.

***

<div id="usage-based-billing" />

## Is usage-based deduction a price increase?

No. Under the older fixed-count model, a simple question and a complex reasoning task could consume the same amount of quota. With usage-based deduction, usage follows actual resource consumption: simple tasks no longer deduct the same amount as complex ones.

You do not need to manually calculate model-specific allowances. In normal use, track the usage bar in the console.

***

<div id="token-plan-key" />

## What is a Subscription Key?

The Subscription Key is the key used for both Token Plan subscriptions and purchased Credits.

Each user has a dedicated Subscription Key for each Team they belong to. The key can exist before any Token Plan seat or Credits are available. In that state, it has no usable paid resources. Once a Token Plan seat is assigned, or Credits access is available, the same key can use those resources.

Subscription Keys are separate from standard pay-as-you-go API Keys.

***

<div id="credits" />

## Can I use Credits without a Token Plan subscription?

Yes. Credits can be purchased and used without an assigned Token Plan subscription seat.

Purchased Credits still use the Subscription Key and have the same resource coverage as Token Plan. If you have no Token Plan seat but have Credits access, usage within that coverage is charged to purchased Credits. If you have both a Token Plan subscription quota and purchased Credits, the subscription quota is used first, then purchased Credits automatically cover eligible overflow within Token Plan resource coverage.

In short, Token Plan is the primary subscription quota, and purchased Credits are the supplemental balance. Both work through the same Subscription Key.

Use a pay-as-you-go API Key for resources outside Token Plan coverage.

For details, see [Token Plan pricing](/docs/guides/pricing-token-plan).

***

<div id="default-team" />

## What is the Default Team?

Every user gets a Default Team when creating an account. It is the user's personal Team:

* It has one member only.
* Other users cannot be invited to it.
* The user is the sole Owner.
* The Owner can buy individual Token Plan subscriptions and Credits for personal use.

For regular Teams, Token Plan seats are assigned to members and Credits can be shared from a Team Credits pool. See [Token Plan for Teams](/docs/guides/pricing-token-plan-team).

***

<div id="switch-models" />

## Which resources does Token Plan support? How do I switch resources?

Token Plan supports flagship models on the API Platform. You do not need to track separate allowances by model; usage is shown through a unified usage bar.

For API endpoints that have pay-as-you-go pricing, usage deducts from the included Token Plan quota according to the corresponding endpoint pricing. The usage bar is the user-facing indicator of remaining subscription usage.

<Tip>
  To call supported resources in your AI agent, see the [MiniMax CLI guide](/docs/token-plan/minimax-cli).
</Tip>

Different plans include different quotas and approximate usage capacity. See the pricing page for details.

To switch models, use the model ID documented by the relevant API or tool integration page.

***

<div id="shared-credits-pool" />

## Are text, image, audio, and other quotas separated?

No. Model usage covered by Token Plan shares one included Token Plan quota. You can flexibly use the quota across supported models and capabilities.

The console is the source of truth for available resources and actual usage.

***

<div id="available-plans" />

## Which Token Plan tiers are available?

The currently available public subscription tiers are **Plus**, **Max**, and **Ultra**. Tiers differ by price, quota windows, and typical agent usage. See [Token Plan pricing](/docs/guides/pricing-token-plan) for details.

***

<div id="upgrade-plan" />

## Can I upgrade my subscription plan?

Yes. Token Plan supports upgrading your plan during your subscription period. You only need to pay the price difference, and the new plan takes effect immediately.

***

<div id="check-usage" />

## How to check Token Plan usage?

You can check your Token Plan usage in two ways:

**Method 1: Visit the Subscription Management Page**

Visit the [Billing > Token Plan](https://platform.minimax.io/user-center/payment/token-plan) page to view your usage.

**Method 2: Use the API Endpoint**

```bash theme={null}
curl --location 'https://www.minimax.io/v1/token_plan/remains' \
--header 'Authorization: Bearer <API Key>' \
--header 'Content-Type: application/json'
```

The usage bar is the primary way to understand your remaining quota. Typical usage patterns are:

* **Low consumption**: Daily chat, translation, and simple writing.
* **Medium consumption**: Code generation and multi-turn conversations.
* **Higher consumption**: Long-context reasoning, multimodal tasks, and complex agent workflows.

***

<div id="reset-calculation" />

## How is usage reset?

Token Plan usage is shown through the console usage bar and controlled by quota windows:

* **Included Token Plan quota**: Controlled by a 5-hour rolling window and a weekly window.
* **Subscription cycle**: Unused included Token Plan quota does not carry over to the next billing cycle.

***

<div id="migration-compensation-credits" />

## What are migration compensation Credits?

Migration compensation Credits are a transition grant for some users moved from legacy Token Plan behavior to the current usage-based quota model. They are intended to make the transition smoother while users adapt to the new quota windows.

Compensation Credits can cover eligible Token Plan resource usage and have their own validity period. The exact amount, validity, and eligibility are shown in the console.

For annual subscriptions, eligible compensation Credits may be issued along with the remaining subscription cycles; each grant has its own validity period.

***

<div id="legacy-plan-migration" />

## What happens to my legacy plan after the upgrade?

Paid-cycle benefits remain available. Active legacy plans are either kept or migrated to the corresponding current tier according to the plan type. The Subscription Management page is the source of truth for your current plan status.

Notes:

* Some retired tiers are available only to existing users and cannot be subscribed to again after cancellation.
* Retired tiers continue under the migration rules during the current subscription period, then move to the corresponding current tier as shown in the console.
* Annual-plan users keep paid-month benefits; any compensation Credits follow the validity period shown in the console.

***

<div id="quota-limit" />

## What happens when I reach the usage limit?

**When reaching the 5-hour or weekly quota:**

* Use purchased Credits \
  If purchased Credits are available, usage within Token Plan resource coverage can be automatically covered by purchased Credits.
* Upgrade your subscription \
  You can visit the [Token Plan](https://platform.minimax.io/subscribe/token-plan) page to upgrade to a higher-tier plan for more request quota. Token Plan supports upgrading at any time, and upgrades take effect immediately.
* Switch to pay-as-you-go \
  If you wish to continue without rate limits, you can replace your Subscription Key with your standard MiniMax Open Platform API Key from the account management system. This will switch the tool to a pay-as-you-go model based on actual token usage, which will consume your Open Platform account balance.
* Wait for the quota window to reset \
  Included Token Plan quota is controlled by 5-hour rolling and weekly windows. Unused included quota does not carry over to the next billing cycle.

***

<div id="api-key-interchangeable" />

## Can the Subscription Key and the standard Open Platform API Key be used interchangeably?

No, they cannot.

* **Subscription Key:** Is used for Token Plan subscriptions and purchased Credits. Pay-as-you-go-priced API endpoints deduct from the included Token Plan quota according to the corresponding endpoint pricing. Purchased Credits have the same resource coverage as Token Plan and can cover eligible overflow beyond subscription quota.
* **Other Open Platform API Keys:** Are used for pay-as-you-go access to standard Open Platform API endpoints. Billing is based on actual token consumption and depletes your account balance.

***

<div id="api-vlm" />

## How does API-vlm work with Token Plan?

API-vlm supports multimodal understanding for image inputs. Its output is text.

When called with Token Plan, API-vlm deducts from the included Token Plan quota according to its pay-as-you-go price. If the included quota is exhausted and purchased Credits are available, additional usage can be automatically covered by purchased Credits.

***

<div id="multiple-tools" />

## Can I use my subscription in multiple tools at the same time?

Yes. You can use the same subscription in all supported tools, but the quota is shared. Usage from all tools consumes the same included Token Plan quota.

***

<div id="cancel-renewal" />

## How do I cancel auto-renewal?

You can cancel auto-renewal on the Subscription Management page. Before canceling, note:

* Included Token Plan quota already issued for the current period remains usable within its validity period.
* Any migration compensation Credits you have received remain usable within their validity period.
* Some retired tiers are available only to existing users and cannot be subscribed to again after cancellation.

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

<div id="token-plan-limits" />

## What are the limits of the Token Plan? Is it suitable for production?

The Token Plan is designed for individual, interactive developer use, with higher-tier plans offering increased quotas. It is recommended to use pay-as-you-go for production use. Key limits include:

* **Rate limits (RPM / TPM)**: Requests may be throttled when exceeded; typically reset within \~1 minute and may tighten during peak traffic.
* **Included Token Plan quota**: 5-hour rolling and weekly quota windows.

***

<div id="token-plan-limit-rules" />

## What are the platform traffic rules?

To ensure service stability and availability for all users, the MiniMax platform may implement dynamic rate limiting during peak hours. The details are as follows:

We have observed that some requests come from ultra-high-concurrency automated batch tasks or multi-user sharing patterns. To prevent a small number of abnormal traffic from occupying public computing resources and to ensure a stable experience for the majority of users, we will implement rate control based on account usage dimensions to ensure fair distribution of computing resources.

**Platform Rate Limiting Rules**

Consistent with industry practices, MiniMax will implement dynamic rate limiting during peak hours:

* **Peak Traffic Hours**: Dynamically adjusted based on cluster load, typically occurring on weekdays from 15:00-17:30:
  * Plus: Supports approximately 3-4 agents
  * Max: Supports approximately 4-5 agents
  * Ultra: Supports approximately 6-7 agents
* **Included Token Plan quota**: Controlled by 5-hour rolling and weekly windows. Unused included quota does not carry over to the next billing cycle.

At the same time, we are continuously advancing computing capacity expansion and system optimization to provide you with more stable and reliable services. Thank you for your understanding and support!

***

## Token Plan Friend Referral Program Invitee Benefits (Exclusive Builder Benefits)

* **Token Plan Subscription Discount**: Subscribe to Token Plan through an invitation link and enjoy a 10% discount at checkout.
* **Applicable Plans**: Applicable to all Token Plan subscription plans and subscription upgrades.
* **Multiple Purchases**: Multiple purchases are supported during the campaign period, and invitees can enjoy the corresponding discount.
* **Builder Status**: Invited users can join the MiniMax Developer Community as community Builders and participate in discussions. They may have priority access to new MiniMax models, quickly obtain real-world development cases, and join discussions on cutting-edge technologies.

## Token Plan Friend Referral Program Inviter Rewards (Builder Rewards)

* **Open Platform Usage Incentive (Credits)**: For each successfully invited friend who completes an eligible paid order, the inviter will receive MiniMax Open Platform credits equal to 10% of the amount actually paid for that order.
* **Validity**: Credits are valid for 90 days from the date of issuance.
* **Usage**: Credits can only be used to offset API usage fees on the MiniMax Open Platform.
* **Other Restrictions**: Credits cannot be withdrawn or transferred and will automatically expire after the validity period.

## Token Plan Friend Referral Program Important Notes

**Refund Policy**: Token Plan is a subscription-based product and does not support refunds. If an invitee initiates a fraudulent refund for an order under this campaign, the platform will automatically revoke the reward credits associated with that order. The corresponding credits will appear as “Expired” in the credit records.

***

<div id="subscription-entitlement-adjustment" />

## Subscription Entitlement Adjustment

To thank our subscribers, the legacy-user benefits previously promised to users who subscribed before June 5, 2026, will remain in effect. Specific benefits, applicable scope, and real-time status are subject to the Entitlement Details page or usage dashboard in the console.

The validity period of compensation Credits issued under the previous migration plan will be automatically corrected from one month to one year from the issuance date. The correction is being applied progressively and takes effect automatically.

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>Additional Notes</div>

* All entitlement bonuses are **activated automatically** when the subscription takes effect. No manual action is required.
* Legacy-user benefits remain valid during **continuous subscription periods**. If you actively change plans or cancel your subscription, the related benefits are considered waived and will not be reissued after resubscribing.
* The validity correction for issued compensation Credits is **completed automatically**. No manual action is required.
* For detailed rules and real-time entitlement status, refer to the **Entitlement Details** page in the console.

***

<div id="token-plan-migration" />

## Token Plan Migration Guide

**Our commitment**: your existing M2.7 entitlements will not shrink, and you can now use M3 seamlessly on the same plan.

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>1. Plus / Max subscribers</div>

Pricing is unchanged and your contracted price continues to apply. Under the new plan:

* **Plus \$20**: M2.7 5-hour usage **+8%** (no reduction)
* **Max \$50**: M2.7 5-hour usage stays the same as your existing tier
* New **M3 access** is included, sharing the same quota pool with M2.7
* New **multimodal entitlements** — image and speech can all be called from the same quota pool

**The switch happens automatically. No action required.**

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>2. Starter $10 / Plus-hs $40 (legacy tiers)</div>

These two tiers are preserved with **the same pricing and contracted relationship**, but are **only available to existing subscribers** — they are no longer offered to new users after the new plan launches.

* M2.7 usage stays the same as your existing tier
* New M3 access and multimodal quota are included, sharing the same quota pool with M2.7

<Tip>
  These two legacy tiers are reserved exclusively for existing subscribers. We recommend keeping your subscription active to retain these entitlements; if you change tiers or cancel your subscription, the related legacy entitlements are considered waived and will not be reissued if you subscribe again later.
</Tip>

The switch happens automatically. No action required.

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>3. Retired tiers (Max-hs $80 / Ultra-hs $150)</div>

These two tiers are being retired. We are providing a migration path with **a lower monthly fee but no reduction in entitlements**:

* **Max-hs \$80 → new Max \$50**: monthly fee reduced by \$30, with an additional **\~\$60 of credits granted each month** to cover the difference, plus multimodal entitlements
* **Ultra-hs \$150 → new Ultra \$120**: monthly fee reduced by \$30, with an additional **\~\$60 of credits granted each month** to cover the difference, including 5 video generations per day

You will be moved to the new tier automatically on your next renewal date. You can also choose another tier or unsubscribe at your discretion.

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>4. Annual subscribers</div>

Entitlement protection for already-paid months: **M2.7 usage will not shrink, and all multimodal entitlements are preserved**. The annual discount rate continues to apply.

**Retired-tier annual plans (Max-hs annual / Ultra-hs annual)**: the price-difference compensation is not paid out as a one-time grant. Instead, **equivalent credits are granted each month based on your subscription cycle** (each grant has its own 1-year validity and does not roll over), ensuring your entitlements are not reduced over the full year.

Examples:

* **Ultra-hs \$150/month annual plan (8 months remaining)**: each month, on your subscription anniversary, you switch to the new Ultra \$120 entitlements and receive an additional **\~\$60 of credits** (\$30 difference × 2) for 8 consecutive months until the annual plan ends. After the annual plan expires, it auto-renews at the new Ultra \$120 annual price, and the annual discount continues to apply.
* **Max-hs \$80/month annual plan (6 months remaining)**: each month, on your subscription anniversary, you switch to the new Max \$50 entitlements and receive an additional **\~\$60 of credits** (\$30 difference × 2) for 6 consecutive months.

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>5. New Ultra \$120 heavy-use tier</div>

A new tier that fills the gap between \$80 and \$150, designed for heavy agentic users. It provides roughly 12.5B tokens of monthly capacity and includes 5 video generations per day.

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>6. Legacy subscriber entitlements</div>

Previously promised entitlements for eligible legacy subscribers remain in effect. Specific entitlement details, scope, and real-time usage status are account-specific; please refer to your usage dashboard or entitlement details page in the console.

These entitlements are applied automatically based on system records. No application is required.

<div style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem" }}>7. About credits</div>

* **Usable across most models on the MiniMax API Platform** (MiniMax H3 model capabilities are not supported), deducted in real time at each model's pay-as-you-go list price
* **Shared across modalities**: text, image, speech, and video (where the tier supports it) all draw from the same credit pool
