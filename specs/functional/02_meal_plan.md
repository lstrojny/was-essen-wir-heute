# Meal plan

The meal plan answers "what are we cooking this week". It is a single
shared plan across the whole family (everyone eats off it) with one
main meal per day across a configurable date window. The plan is
computed from the recipe catalog and the family's recent meal history,
biased toward recipes the family likes — or hasn't tried yet — and
toward variety of main ingredients across the days.

## Plan shape

- There is **one active plan** at a time, shared by every user. Ratings
  remain per-user, but the plan is not.
- A plan covers a **contiguous date range**. The default window is
  **tomorrow through tomorrow + 6** (seven days). Start and end dates
  are adjustable on creation and afterwards.
- Each calendar day in the range has at most **one slot** holding a
  reference to a recipe, or is empty.
- Only recipes flagged **complete meal** (see `01_recipes.md`) are
  eligible for a slot. Sides, sauces, and components are excluded.

## Slot state

Each slot is in one of these states. The state drives what regeneration
does (see *Generation*) and what marker the UI shows on the row:

- **suggested** — placed by the suggester; replaceable by regeneration.
- **edited** — the user picked the recipe manually. Preserved through
  regeneration.
- **pinned** — the user explicitly froze a suggested slot. Preserved
  through regeneration. (Editing a slot does *not* require pinning;
  pin is only meaningful as "keep this suggestion".)
- **cleared** — the user emptied the day on purpose. Preserved through
  regeneration as an empty slot.
- **empty** — no recipe placed yet, never touched by the user.
  Regeneration is free to fill it.

## Meal history

The plan is also the history. Once a day passes, its slot remains in
the database as a historical entry and is read back to mark its recipe
as **recently eaten** for future suggestions.

There is no separate "we ate this" record — adding a recipe to a plan
day and letting that date pass is the only way history grows. (Future
extension: a "log a past meal" action for off-plan cooking — see
*Open questions*.)

## Generation

The user kicks off generation from a **"Plan this week"** button on
the meal-plan page. The action is enabled whenever there is at least
one **empty** slot in the active window, or as a regenerate action
when there is none.

### Candidate pool

A recipe is a candidate when all of these hold:

- `is_complete_meal = true`,
- It is not already placed (in any state) on another day in the same
  active window,
- It was not eaten within the **recent window** of meal history
  (default: the last **4 weeks** of plan entries before the start of
  the active window). The look-back length is configurable in settings.

### Scoring

Each candidate gets a score from:

- **Rating signal**:
  - Aggregate rating **≥ 4.0** → strong positive.
  - **No ratings yet** → mild positive (promote new recipes so the
    family discovers them).
  - Aggregate rating **< 3.0** → strong negative.
  - Anything between → neutral.
- **Variety penalty across the week**: once a recipe is placed,
  subsequent picks pay a penalty for sharing role-tagged ingredients
  with an already-placed day. Penalties apply per role (`starch`,
  `protein`, `vegetable`) — two pasta-topped days are worse than two
  pasta days a week apart. Repeating the same **cuisine** in adjacent
  days pays a smaller penalty. v1 uses *every role-tagged ingredient
  in the rolled-up recipe* (deduped per ingredient id) as the variety
  signal. The gram-largest main-ingredient derivation in
  `05_ingredients.md` is the eventual sharper signal, but it depends
  on density and per-unit-mass data that is sparse in the catalog
  today; until coverage improves, the cruder set-overlap signal is
  what scoring runs on.
- **Repetition penalty across recent weeks**: a recipe used 1 week ago
  pays more than one used 3 weeks ago. Recipes outside the look-back
  window pay nothing.

The scoring is intentionally heuristic — it does not need to be
optimal, just "reasonable enough" that the user replaces fewer than
half the suggestions. Exact weights are an implementation detail.

### Fill order

Days are filled greedily from the start of the range, picking the
highest-scoring candidate for each empty slot in turn. If two
candidates tie, the older "last eaten" date wins; if both are
unrated, the older `created_at` wins (so brand-new recipes don't
crowd each other out on the same week).

Regeneration only touches slots in state **empty**. **suggested**
slots are *replaced* on regenerate; **edited**, **pinned**, and
**cleared** slots are left alone.

If the candidate pool empties before the range is filled (small
catalog or aggressive look-back), the remaining days stay empty with
a "no suggestion — pick manually" placeholder.

## Manual overrides

The plan page lets the user reshape suggestions:

- **Replace** a day: opens a picker listing the candidate pool,
  sorted by score for that specific day (variety penalties recomputed
  against the rest of the plan). Selecting a recipe writes it to the
  day and moves the slot to **edited**. The picker has a text search
  across recipe titles (active language with fallback) so the user
  can override with any complete-meal recipe even if it scored low.
- **Pin** a day: moves a **suggested** slot to **pinned** without
  changing its recipe.
- **Unpin / un-edit**: moves a **pinned** or **edited** slot back to
  **suggested** (so the next regeneration may replace it).
- **Clear** a day: moves any slot to **cleared**.
- **Restore** a cleared day: moves **cleared** back to **empty** so
  regeneration can fill it.

The UI shows a small marker per row to communicate the current
state — at minimum a pin icon for **pinned**, an "edited" chip for
**edited**, and a visible "no meal" placeholder for **cleared**.

## Adjusting the window

- The user can change the **start date** and the **end date** of the
  active plan at any time.
- **Shrinking** the window (moving end earlier, or start later) drops
  the now-out-of-range slots from the active plan. Slots whose date
  is already in the past are kept as history regardless of the window
  edit — only the active-plan view is affected.
- **Growing** the window adds empty days; the user can either click
  "Plan this week" to fill them or fill them manually.

## Surface

- The meal-plan page lives at `/plan` and is the app's natural home
  screen for the "what are we cooking this week" use case.
- The page shows the active plan as a vertical list of days from start
  to end. Each row shows the date and day of week, the assigned recipe
  (title plus its derived main-ingredient chips), and the slot state
  marker.
- Above the list: the window-range controls (start / end pickers) and
  the **Plan this week** action.
- Tapping a slot opens the picker (replace flow). Pinning, unpinning,
  clearing, and restoring are inline icon actions on each row.
- The recipe entry on each row links to the recipe detail page.

## Interaction with the AI chat

The persistent AI chat (see `07_ai_chat.md`) is present on this page
like any other. v1 capabilities here are read-only against the plan:
the chat can answer "why did you pick X for Thursday?" and propose
swaps in natural language ("swap Wednesday for something lighter").
Applying a swap goes through the same patch-and-highlight pattern
used on detail pages — the user reviews and saves. Specific chat
tools land in `specs/tech/02_llm.md` when this feature is implemented.

## Open questions

- **Multiple meals per day** (breakfast / lunch / dinner). v1 is one
  slot per day — the family's main cooked meal. The schema can carry
  a `slot_kind` from the start so adding more slots is additive.
- **"Last eaten on" on the recipe detail** — surfacing the most recent
  plan date for a recipe on its detail page. Easy once the plan table
  exists; deferred to keep the first cut small.
- **Shopping list** — rolling up the week's ingredients into a single
  shopping view. Mentioned in `01_recipes.md` as a future concern;
  belongs here when scoped.
- **Plan history navigation** — the plan page shows the active window,
  but past plans are also valuable ("what did we cook in February?").
  Deferred.
- **Look-back window default** — 4 weeks is the starting guess.
  Revisit once there is real plan history.
- **Off-plan days** — marking a day as "no cook" (eating out,
  leftovers, guests bringing food) as something distinct from
  **cleared**. Deferred until the basic flow proves out.
- **Log a past meal** — recording meals eaten without a planned slot
  so the history is more accurate. Deferred.
