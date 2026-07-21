# Next-Phase Backend Contract

This document lists the **production** backend endpoints the Repair StackFlow web app will need to provide for the production Helper. **None of these are implemented in this MVP.** This MVP uses only local development endpoints and in-memory storage.

## Pairing & Credentials

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/pairing/codes` | Create a short-lived, single-use pairing code bound to an organization and optional location. |
| POST | `/pairing/pair` | Exchange a pairing code for a revocable device credential (token issued once, hashed at rest). |
| POST | `/pairing/rotate` | Rotate a device credential. |
| POST | `/pairing/revoke` | Revoke a Helper device credential. |

## Heartbeat & Capability

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/helper/heartbeat` | Receive heartbeat with capability report and health state. |
| POST | `/helper/capabilities` | Update capability report (approved tasks, execution target, provider, model, limits). |

## Job Lifecycle

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/jobs` | (Web app side) Create an authorized AI job. |
| POST | `/jobs/claim` | Helper atomically claims one eligible job for its device and capabilities. |
| POST | `/jobs/:jobId/status` | Report processing status. |
| POST | `/jobs/:jobId/result` | Submit a normalized result idempotently (uniqueness on idempotency key). |
| POST | `/jobs/:jobId/failure` | Submit a failure with error code and retriable flag. |
| POST | `/jobs/:jobId/cancel` | Cancel a job (web app or Helper initiated). |

## Notes

- All endpoints require the device credential as `Authorization: Bearer <token>`.
- The web app remains the permanent system of record for business data.
- The Helper does not persist business data; it only processes approved jobs and returns results.
- Idempotency is enforced server-side on `/jobs/:jobId/result` via the idempotency key.
- Expiration is enforced server-side on claim and submission.
