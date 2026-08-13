# Three-Sprint Delivery Plan for Theme Changes

This plan focuses only on the theme-related work and groups it into three sprints so the visual refresh can be delivered in a controlled, testable way.

## Sprint 1 — Theme foundation and shared styling

### Goal

Establish the base design system for light and dark modes so the rest of the UI can build on consistent colors, spacing, and component behavior.

### Included work

- Review and align the shared theme tokens in constants/theme.ts and related theme utilities
- Standardize base colors, typography, surfaces, and interactive states for light and dark themes
- Update shared UI primitives so they inherit the theme correctly
- Identify any visual inconsistencies that affect multiple screens

### Deliverables

- A consistent theme foundation across the app
- Shared components that render correctly in both light and dark mode
- A short list of remaining visual issues that need screen-level attention

### Exit criteria

- The app has a stable theme baseline
- Core screens no longer show obvious contrast or color mismatches
- Theme changes are easy to extend to additional screens

---

## Sprint 2 — Screen-level theme rollout

### Goal

Apply the new theme foundation to the main user-facing screens and make each screen feel polished and consistent.

### Included work

- Update auth, onboarding, and account screens to use the shared theme consistently
- Apply the new visual treatment to main app surfaces such as chat, history, reminders, and profile
- Adjust any screen-specific backgrounds, borders, text styling, and empty states
- Ensure components remain readable and accessible in both themes

### Deliverables

- Major user-facing screens reflect the new theme consistently
- Visual polish is applied without breaking existing layout behavior
- Dark/light mode feels intentional rather than patched together

### Exit criteria

- The most important screens are visually aligned with the new theme
- No major regressions appear in layout or readability
- Theme behavior is consistent across the primary flows

---

## Sprint 3 — Theme hardening and QA

### Goal

Validate the full visual experience and make the theme release-ready.

### Included work

- Review all updated screens for consistency, polish, and accessibility
- Fix remaining edge cases such as contrast issues, component states, and inconsistent surfaces
- Test the app in light and dark mode across the main flows
- Prepare a small QA checklist for theme validation before merge

### Deliverables

- A polished, release-ready theme experience
- A QA checklist covering light/dark mode and core screens
- A short list of any deferred style issues for future follow-up

### Exit criteria

- Theme-related work is visually consistent across the app
- Core flows pass a manual visual QA pass
- Remaining style issues are documented and contained

---

## Recommended order

1. Sprint 1: Build the shared theme foundation first.
2. Sprint 2: Roll the theme out to the main screens.
3. Sprint 3: Hardening and validation before release.

## Suggested checkpoints

- Checkpoint A: shared theme foundation is stable
- Checkpoint B: major screens are visually aligned
- Checkpoint C: theme QA is complete and ready for review
