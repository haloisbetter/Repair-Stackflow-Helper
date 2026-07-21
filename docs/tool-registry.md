# Tool Registry and Tool Policies

Sprint 3 introduces a central tool registry with 12 registered tools, a tool policy system for per-organization control, and an authorization service that enforces policies before any tool executes.

## Registered Tools

| Tool ID                   | Category         | Location           | Risk    | Implemented |
|---------------------------|------------------|--------------------|---------|-------------|
| `format_technician_note`  | note_formatting  | local              | low     | yes         |
| `draft_customer_update`   | drafting         | local              | medium  | no          |
| `extract_checkin_fields`  | extraction       | local              | low     | no          |
| `draft_symptom_summary`   | drafting         | local              | low     | no          |
| `suggest_next_question`   | knowledge        | local              | low     | no          |
| `search_internal_knowledge` | knowledge      | repair_stackflow   | low     | no          |
| `lookup_customer`         | lookup           | repair_stackflow   | medium  | no          |
| `lookup_work_order`       | lookup           | repair_stackflow   | medium  | no          |
| `create_checkin_draft`    | creation         | repair_stackflow   | high    | no          |
| `build_estimate`          | estimation       | hybrid             | medium  | no          |
| `lookup_parts`            | lookup           | repair_stackflow   | low     | no          |
| `send_customer_message`   | communication    | repair_stackflow   | high    | no          |

Only `format_technician_note` is implemented and executable in Sprint 3. The remaining 11 tools are registered so their metadata, policies, and UI presence can be configured ahead of implementation.

## ToolPolicy

Each tool has a per-organization policy:

| Field                  | Type      | Description                                      |
|------------------------|-----------|--------------------------------------------------|
| `organizationId`       | string    | Owning organization                              |
| `toolId`               | string    | Matches a registered tool                        |
| `enabled`              | boolean   | Whether the tool is enabled for this org         |
| `allowedRoles`         | ToolRole[]| Roles permitted to use the tool (empty = all)   |
| `requiresConfirmation` | boolean   | Whether user confirmation is required            |
| `executionLocation`    | enum      | `local`, `repair_stackflow`, or `hybrid`         |

## Authorization Checks

The `authorizeToolUse` function runs these checks in order:

1. **tool_not_found** — tool exists in the registry
2. **tool_not_implemented** — tool is marked as implemented
3. **tool_not_in_profile** — tool is in the enabled tools list
4. **tool_disabled_by_policy** — policy has `enabled: true`
5. **tool_role_not_allowed** — caller's role is in `allowedRoles` (empty = all allowed)
6. **tool_location_not_supported** — execution location is `local` or `hybrid` (not `repair_stackflow`)
7. **tool_confirmation_required** — if `requiresConfirmation` is true, confirmation must be provided

The job runner calls this before beginning any job. If authorization fails, a `ProtocolError` is thrown with the appropriate error code.

## API Endpoints

| Method | Path                              | Description                      |
|--------|-----------------------------------|----------------------------------|
| GET    | `/api/v1/tools`                   | List all tools with their policies |
| GET    | `/api/v1/tools/:toolId/policy`    | Get a single tool's policy       |
| PUT    | `/api/v1/tools/:toolId/policy`    | Update a tool's policy           |
| POST   | `/api/v1/tools/:toolId/authorize` | Check authorization for a tool   |
