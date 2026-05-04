# Sprint 10. Policy Scenario Modeling

**Date logged:** 2026-05-04
**Status:** Idea, not yet specced. Slated as Sprint 10. Brainstorm/spec/plan cycle to begin after Sprint 9 (the redesign and chat agent) ships and accumulates real usage data.

## The user's framing (verbatim)

> It's easy to compile this information but what do their statements actually mean? For example, Chow says she wants the city to act as developer and Bradford says, let's leave it to the private sector and make it cheaper and faster for them. Ok cool, but what does that really mean? Bradford's suggestion is status quo. It's how we've been doing it. Chow's ideas are different, perhaps unproven (here anyway). What I'm getting at is: let's figure out a way to help users model out how different decisions play out. From tax increases to community programs, anything. What would make this stand out would be a modelling tool that plays out various scenarios so voters can actually vote with real context, not just words.

## The differentiator

Today the Mayoral Record stops at: what they said + what they voted. The next layer would help readers reason about: what those decisions probably do, given track records, comparable jurisdictions, and budget arithmetic. A voter looking at "25,000 rent-controlled homes over 8 years" or "cut development charges 25%" gets to ask "what would that actually look like?" rather than picking based on slogans.

## Concrete things this could surface

1. **Status-quo flagging.** When a candidate's policy is "keep doing X," surface that with explicit history. ("Toronto added N units/year under the current regulatory regime over the last decade.")
2. **Comparable jurisdiction case studies.** Vienna acted as a public developer. Houston deregulated supply. Auckland upzoned. Surface the documented outcomes from those interventions, with sources, with timeframes.
3. **Budget arithmetic.** "A 4% property tax increase produces ~$N for the operating budget. That funds A or B but not both at current cost projections."
4. **Counterfactual baselines.** "If transit funding stays flat, the operating gap by 2030 is X. If property tax increases match inflation only, X. If a Bradford-style fee freeze, X. If a Chow-style luxury tax, X."
5. **Time-horizon honesty.** Most housing/transit policies don't show effects in year 1. Surface expected timelines explicitly.
6. **Source tiers.** Each projection labeled as: City budget doc / Independent analysis / Academic study / Mayoral Record extrapolation. The last tier carries explicit caveats.

## The editorial risk

This crosses from documentation into analysis, and analysis crosses into advocacy if not held to a tight methodology. Specific risks:

- **LLM confabulation.** Outcome predictions are exactly the kind of generative output that hallucinates. A made-up "Vienna saw 30% lower rents over 10 years" with no source is worse than no claim at all.
- **Implicit framing.** Choice of comparable jurisdictions is itself an editorial choice. (Comparing Toronto to Houston favours one policy theory; comparing to Vienna favours another.)
- **False precision.** Modeling a budget impact to the dollar implies certainty the underlying assumptions don't have.
- **Reader misreading.** "Bradford's policy would lead to X" reads as a prediction the site is making, even if presented as "one model suggests."

Mitigations to design for in the spec:

- **Hard source-tier requirements.** No projection without an external citation or an explicit "Mayoral Record extrapolation" label. The latter requires an explicit methodology paragraph.
- **Confidence bands shown numerically.** Not "lower rents" but "estimates range from -3% to +1% over 10 years across the cited studies."
- **Plural projections, not singular.** Always show 2 to 3 scenarios for the same policy when the literature disagrees.
- **Heavier editorial review.** Each modeling card reviewed before publish, not auto-generated like synthesis cells. Probably a different cadence (weekly editorial drop) rather than instant query response.
- **Out-of-scope chip on the chat.** When a user asks "will this work?" the agent responds with documented track records, not a yes/no prediction.

## Pre-spec questions to think about before the next planning session

1. **What's the smallest version that ships?** Probably a manually-curated "context card" attached to specific candidate positions, not an open-ended modeling tool. Start narrow.
2. **What data sources are realistic?** City of Toronto budget docs, Statistics Canada, Auditor General reports, academic papers (DOI'd), reputable analyst orgs (Wellesley Institute, Toronto Region Board of Trade). What are the licensing/citation rules?
3. **Who reviews?** The synthesis review process took 30-60 min for 18 cells. Modeling cards would need more rigor. Is there a pro-bono advisory editor?
4. **Where does it live in the UI?** Inline on receipt cards as a "what would this do?" expand-section? Or a separate `/scenarios` surface?
5. **Disclaimer pattern.** The current site's "plain English disclosure" footer pattern would need a stronger version for modeling content.

## Cost / timing thoughts

- Curated comparable-jurisdiction studies: human-research-heavy. Days per topic, not minutes.
- LLM-driven extrapolations: technically cheap but editorially expensive (review cost dominates).
- Worth it if it becomes the site's primary differentiator.

## Recommendation

Slate as a separate planning session in 2 to 4 weeks. Run the redesign + agent buildout (the current Sprint 9) first, observe how readers actually use the chat, then design this on top of real usage data rather than guesses.
