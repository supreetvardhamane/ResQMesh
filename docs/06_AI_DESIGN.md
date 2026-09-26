# AI Design

## Role

AI may help convert unstructured, multilingual reports into a reviewable operational draft: classify need, extract a possible location or resource, identify duplicate-like reports, and summarize a responder queue. It is not the source of truth, dispatch authority, route authority, or trust score.

## Safe product boundary

```text
raw report -> local/server extraction -> proposed structured fields
         -> provenance retained -> human or rule validation -> operational event
```

The raw report, model version, prompt/template version, extraction rationale, and reviewer action remain linked. A model can recommend `medical_help`; it cannot automatically mark a report verified or assign an ambulance.

## MVP approach

- Rule-first normalization for emergency categories, TTL defaults, language-independent icon labels, and required fields.
- Optional model-assisted translation/extraction only when connectivity and approved processing are available.
- Deterministic fallback: save the original report and let a responder classify it. SOS creation never waits for AI.
- Similarity suggestions are shown as possible duplicates, never silently merged.

## Evaluation

Test on representative, consented or synthetic multilingual disaster messages. Measure field extraction accuracy by category, false merges, unsupported claims, harmful omissions, latency, and reviewer override rate. Evaluate each language and low-context message separately; aggregate scores can hide failures for underserved users.

## Privacy and cost controls

Remove unneeded direct identifiers before remote inference. Use local or regional processing where feasible, configurable retention, strict payload limits, and an explicit unavailable state. No claimed accuracy, confidence percentage, or model capability may appear in the demo without a reproducible evaluation artifact.

## Capability boundaries

| Capability | Permitted output | Required review | Prohibited behavior |
| --- | --- | --- | --- |
| Language detection/translation | translated text with source retained | responder for operational use | replacing original evidence |
| Need extraction | proposed category/priority/location fields | user or responder acceptance | submitting an SOS without human-visible source |
| Duplicate suggestion | candidate list and similarity explanation | responder chooses link/merge | silently deleting/merging reports |
| Queue summary | cited event IDs and time range | responder reads source events | asserting facts not present in inputs |
| Resource match assist | ranked candidates/rationale inputs | responder creates assignment | automatically assigning/dispatching |

## Input and output contract

AI receives the narrowest useful, pre-processed payload: event ID, language hint, category-safe text, approximate location bucket, time, and permitted resource metadata. The response is a versioned suggestion object containing `model_id`, `model_version`, `policy_version`, `input_event_ids`, `proposals`, `limitations`, and optional calibrated score bands. Raw prompt strings, secrets, exact locations, phone numbers, and hidden chain-of-thought are not persisted as an operational artifact.

```json
{
  "suggestion_id": "ais_01J...",
  "input_event_ids": ["018f..."],
  "model_version": "extractor-v1",
  "proposals": [
    { "field": "need_category", "value": "medical_help", "evidence": "source text span" }
  ],
  "limitations": ["Location was not explicitly stated"],
  "review_state": "PENDING"
}
```

## Human-review workflow

1. The system labels the result as a suggestion and shows the source event.
2. A user/responder accepts, edits, or rejects each operational field.
3. The action records reviewer, timestamp, policy/model version, and reason where correction matters.
4. Accepted fields become a new attributable event, not an overwritten source.
5. Rejected suggestions become evaluation data only when privacy policy permits.

## Evaluation design

Build a held-out, consented or synthetic evaluation set by language, report length, noise level, ambiguity, and urgency. For each capability measure precision/recall or exact-field accuracy, false-positive duplicate suggestions, harmful omission rate, latency, fallback rate, reviewer override rate, and disparity across groups/languages. Review examples where the model is uncertain, wrong, or overly confident. A model is not released because its aggregate average is good; it must meet agreed safety thresholds on the critical failure categories.

## Monitoring and rollback

Record invocation count, latency, unavailable rate, acceptance/edit/rejection rate, schema failures, and privacy-filter activation without storing sensitive raw content. Establish a capability flag per model/version. If error, hallucination, bias, cost, or provider outage exceeds the agreed threshold, disable the feature and continue with rules/manual workflow. Keep the previous validated policy/model configuration available for rollback.

## Prompt and provider governance

Prompts/templates are versioned code and require review like any other operational logic. A provider change requires privacy assessment, data-flow update, fallback test, and evaluation comparison. The model provider must not receive unrestricted incident history by default. Do not allow a free-text model response to directly call privileged APIs, create assignments, change trust state, or contact people.

## UX requirements for AI

- Use plain wording such as "Suggested from this report" rather than anthropomorphic authority.
- Let users inspect cited source information and limitations.
- Never require a confidence percentage to understand the action; never show invented confidence.
- Provide a clear manual path and an unavailable state.
- Respect reduced motion and language/accessibility settings.
