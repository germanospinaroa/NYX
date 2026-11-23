# NYX interface direction

NYX is an internal relationship-intelligence workspace. The interface should
feel calm, precise and operational: obsidian shell, ivory surfaces, restrained
ultraviolet accents and clear human-language statuses. Campaign controls are
action-oriented but never imply delivery when the provider only accepted a
dispatch.

## Interaction policy

- Primary actions use the existing solid button style; destructive actions are
  secondary and require explicit confirmation.
- `READY` is editable. Once dispatch can have started, the monitor is read-only
  except for pause, resume and permanent stop controls.
- Loading and pending states are visible and disable duplicate actions.
- Polling must preserve filters, expanded recipients and navigation context.
- All campaign controls must be keyboard reachable and have explicit labels.
- No motion is required for correctness; respect reduced-motion preferences.

## Responsive checkpoints

The campaign monitor and editor must remain usable at 390, 768 and 1440 CSS
pixels. Control groups wrap on narrow screens and dangerous actions never hide
behind a hover-only affordance.
