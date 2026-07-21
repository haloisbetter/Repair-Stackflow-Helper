# Local Configuration Persistence

The Helper persists assistant profiles, instruction profiles, tool policies, and runtime preferences across restarts using a local JSON configuration file. This is a development prototype persistence layer that will be replaced by Repair StackFlow profile synchronization in a future phase.

## What Persists

- AssistantProfile (name, subtitle, welcome message, avatar, accent color)
- InstructionProfile (global instructions, tone, formatting, prohibited claims, escalation rules)
- ToolPolicy records (per-tool enabled state, allowed roles, confirmation requirements, execution location)
- Runtime preferences (selected provider, execution target, model role, Ollama endpoint)
- Configuration schema version
- Last updated timestamp

## What Never Persists

- Technician notes
- Formatted notes
- Conversations
- Jobs
- Raw prompts
- Raw AI responses
- Customer information
- Credentials, tokens, secrets
- Diagnostic history containing business content

## Storage Locations

The configuration directory is chosen per-platform, always outside the repository:

- **macOS**: `~/Library/Application Support/RepairStackFlowHelper/`
- **Linux**: `$XDG_CONFIG_HOME/repair-stackflow-helper/` or `~/.config/repair-stackflow-helper/`
- **Windows** (future): `%APPDATA%/RepairStackFlowHelper/`

A test directory can be injected for testing.

## Storage Format

A versioned JSON envelope:

```json
{
  "schemaVersion": "1.0",
  "savedAt": "2026-01-01T00:00:00.000Z",
  "assistantProfile": {},
  "instructionProfile": {},
  "toolPolicies": [],
  "runtimePreferences": {
    "provider": "ollama",
    "executionTarget": "local_on_this_machine",
    "modelRole": "drafting",
    "ollamaEndpoint": "http://127.0.0.1:11434"
  }
}
```

Unknown top-level fields are rejected. The complete file is validated before any value is applied.

## Backup Behavior

1. On each save, the current active file is copied to `configuration.backup.json`.
2. The new configuration is written to a temporary file, then atomically renamed over the active file.
3. If the active file is invalid at startup, the backup is loaded.
4. If both active and backup are invalid, safe defaults are used.

The Helper always starts, even with no valid configuration file.

## Import and Export

- **Export** (`GET /api/v1/dev/configuration/export`): Returns only approved non-secret configuration.
- **Import** (`POST /api/v1/dev/configuration/import`): Validates the entire document, rejects unknown fields, rejects unsupported schema versions, rejects invalid profiles, rejects attempts to enable unimplemented tools, creates a backup before replacement, and applies without restarting.
- **Reset** (`POST /api/v1/dev/configuration/reset`): Deletes configuration files and restores safe defaults.

Import does not accept arbitrary filesystem paths. All file I/O is handled by the server.

## Reset Procedure

Use the "Reset to Safe Defaults" button in the Developer modal, or call `POST /api/v1/dev/configuration/reset`. This removes the active and backup configuration files and restores all profiles, tool policies, and runtime preferences to their built-in defaults.

## Schema-Version Compatibility

The current schema version is `1.0`. Files with unsupported schema versions are rejected during load and import. A future migration path will handle version upgrades when the schema changes.

## Future Replacement

This local persistence layer is a development prototype. In a future phase, it will be replaced by Repair StackFlow profile synchronization, which will push organization-level configuration from the cloud. The `LocalConfigurationStore` interface is designed to be replaceable without changing the assistant services that depend on it.

## API Endpoints

| Method | Path                                    | Description                       |
|--------|-----------------------------------------|-----------------------------------|
| GET    | `/api/v1/dev/configuration/export`      | Export sanitized configuration    |
| POST   | `/api/v1/dev/configuration/import`      | Import and apply configuration    |
| POST   | `/api/v1/dev/configuration/reset`       | Reset to safe defaults            |
| GET    | `/api/v1/dev/configuration/status`      | Get persistence status            |

## Error Codes

| Code                               | Meaning                                    |
|------------------------------------|--------------------------------------------|
| `configuration_not_found`          | No configuration file found                |
| `configuration_invalid`            | Configuration file failed validation       |
| `configuration_version_unsupported`| Schema version not supported               |
| `configuration_read_failed`        | Could not read configuration file          |
| `configuration_write_failed`       | Could not write configuration file         |
| `configuration_backup_loaded`      | Active file invalid, backup was loaded     |
| `configuration_import_rejected`    | Import document failed validation          |

Filesystem stack traces are never exposed through the API.
