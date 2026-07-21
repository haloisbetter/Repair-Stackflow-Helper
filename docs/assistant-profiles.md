# Assistant Profiles

Sprint 3 introduces white-label assistant profiles that allow organizations to customize the Helper's branding, welcome message, and appearance without changing the underlying execution engine.

## AssistantProfile Schema

Defined in `src/assistant/assistant-profile.ts`:

| Field            | Type     | Constraints                                    |
|------------------|----------|------------------------------------------------|
| `name`           | string   | 1–40 chars, no HTML tags, no URLs              |
| `subtitle`       | string   | 0–80 chars, no HTML tags, no URLs              |
| `welcomeMessage` | string   | 1–300 chars, no HTML tags, no URLs             |
| `avatar`         | object   | `{ type: "initials", value: string (1–3 chars) }` |
| `appearance`     | object   | `{ accentColor: hex (6-digit, e.g. #2f8f83) }` |
| `profileVersion` | number   | Positive integer                               |

The schema is strict — unknown fields are rejected. HTML tags and URLs (http, https, ftp, file, data, javascript, vbscript) are blocked in all text fields.

## Default Profile

```
{
  "name": "Helper",
  "subtitle": "Repair Assistant",
  "welcomeMessage": "Ready to help with today's repairs.",
  "avatar": { "type": "initials", "value": "H" },
  "appearance": { "accentColor": "#2f8f83" },
  "profileVersion": 1
}
```

The default profile is intentionally generic — no organization-specific branding is hardcoded into the reusable profile model.

## API Endpoints

| Method | Path                          | Description                    |
|--------|-------------------------------|--------------------------------|
| GET    | `/api/v1/assistant/profile`   | Get current assistant profile  |
| PUT    | `/api/v1/assistant/profile`   | Update assistant profile       |
| GET    | `/api/v1/assistant/instructions` | Get instruction profile     |
| PUT    | `/api/v1/assistant/instructions` | Update instruction profile  |
| POST   | `/api/v1/assistant/reset`     | Reset both profiles to defaults |
| GET    | `/api/v1/assistant/runtime`   | Get compiled runtime config    |

## UI Integration

- `CompactHeader` displays `assistant.name`, `assistant.subtitle`, and `assistant.avatar.value`
- The accent color flows through the `--accent-color` CSS variable set on the header element
- The welcome message replaces the hardcoded "Ready to help with technician notes" text
- Settings modal has an Assistant Profile section for editing name, subtitle, welcome message, avatar, and accent color
- Developer modal shows the current assistant profile and runtime configuration
