# Focus Management Best Practices (SPA & Accessibility)

This document provides a comprehensive guide to managing keyboard focus in modern web applications (especially SPA frameworks like React) according to accessibility standards (WCAG, ARIA) and real-world best practices.

---

# 1. Core Principle

**Focus must always reflect the user's current context.**

When content changes:
- The user must know *where they are*
- The user must know *what changed*
- The user must be able to *continue navigation predictably*

---

# 2. When Focus MUST Be Managed Manually

In SPAs, browsers do NOT automatically reset focus.

You must manually manage focus when:

- Navigating between pages (client-side routing)
- Switching steps in multi-step forms
- Opening/closing modals
- Dynamically replacing large sections of content
- Showing critical messages (errors, confirmations)

---

# 3. Where Focus Should Go After Navigation

## Priority Order

### 1. Page or Section Heading (BEST PRACTICE)

- Move focus to the main heading (e.g., H1/H2)
- Ensures screen readers announce context immediately

**Why:**
- Matches native page load behavior
- Provides instant orientation

---

### 2. Main Content Container

Use when:
- No clear heading exists

Requirements:
- Must be focusable
- Must have meaningful accessible name

---

### 3. First Interactive Element (Fallback)

Use only if:
- There is no meaningful static content to focus

**Downside:**
- User may miss context

---

# 4. What NOT to Do

Avoid moving focus to:

- Non-visible elements
- Elements without accessible text
- Decorative containers
- Elements that immediately disappear

**Bad outcomes:**
- Screen reader says "blank"
- User gets lost

---

# 5. Focus Visibility Requirements (WCAG 2.4.7)

Focus must be:

- Clearly visible
- High contrast
- Not dependent on subtle outline alone

## Recommended approach:

Use a combination of:
- Background change
- Border change
- Strong visual indicator (e.g., shadow/glow)

**Rule:** Focus state should be at least as visible as hover.

---

# 6. Logical Focus Order

Focus order must:

- Follow visual layout (left → right, top → bottom)
- Match reading order
- Avoid jumps or loops

## Common mistakes:

- CSS reordering without DOM order alignment
- Hidden elements still focusable
- Unexpected tab stops

---

# 7. Managing Focus in Dynamic Content

## When content updates but page does not change:

### Small updates
- Do NOT move focus

### Large updates
- Move focus to:
  - Updated section heading
  - Or container

---

# 8. Multi-Step Interfaces (Wizards)

Each step should behave like a new page.

## Requirements:

- Move focus to step heading
- Announce step context (e.g., "Step 2 of 3")
- Maintain consistent structure

---

# 9. Keyboard Navigation Inside Component Groups

For grouped interactive elements (cards, options):

## Use correct patterns:

- Radio group → single selection
- Button group → actions

## Navigation rules:

- Tab → enters/exits group
- Arrow keys → move within group

---

# 10. Focus and Screen Readers

When focus moves:

Screen reader will:
- Announce element role
- Announce label/text

## Therefore:

Focused element MUST:
- Have meaningful text
- Represent current context

---

# 11. Handling Loading States

When loading replaces content:

- Indicate busy state
- Prevent focus from landing on removed elements
- Move focus after loading completes

---

# 12. Error Handling

When errors occur:

- Move focus to error message OR
- Announce via live region

User must:
- Immediately know something went wrong

---

# 13. Modals and Overlays

When opening modal:

- Move focus inside modal
- Trap focus within modal

When closing modal:

- Return focus to triggering element

---

# 14. Focus Restoration

Always restore focus when:

- Closing dialogs
- Navigating back

User should return to:
- The element that triggered the action

---

# 15. Testing Checklist

## Keyboard Only

- Can you navigate entire UI with Tab?
- Is focus always visible?
- Does focus ever disappear?

## Screen Reader (NVDA/VoiceOver)

- Does each screen announce correctly?
- Is context clear after navigation?
- Are selections announced?

---

# 16. Golden Rules (Quick Reference)

- Every new screen → move focus to heading
- Focus must always be visible
- Never leave focus on removed elements
- Match visual and DOM order
- Use semantic roles for groups
- Ensure screen reader clarity

---

# 17. Anti-Patterns to Avoid

- Relying only on hover styles
- Using only outline for focus
- Duplicating labels inconsistently
- Ignoring arrow key navigation in groups
- Not managing focus in SPA navigation

---

# Summary

Good focus management:

- Prevents user confusion
- Enables full keyboard navigation
- Makes UI usable for screen reader users

In SPAs, focus management is not optional — it is a core part of accessibility.

