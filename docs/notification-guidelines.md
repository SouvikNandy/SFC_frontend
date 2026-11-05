# Notifications and on-screen messages

Audience: frontend developers. Status 2026-11-05. One notification channel exists: `ToastService` (`src/app/core/services/toast.service.ts`),
rendered once by `ToastComponent` in `app.html`. Do not add another.

## Which kind to use
| Situation | Use | Example |
|---|---|---|
| The user did something and it worked | `toast.success()` (green, 3.5 s) | "NIFTY EOD data exported." |
| Something the user explicitly chose was changed by an update | `toast.info()` (neutral, 3.5 s) | "Expiry 22 Oct 2026 is not listed for these dates, so it was replaced by a listed expiry." |
| A failure the user cannot act on further | `toast.error()` (red, 7 s, `role="alert"`) | "Unable to download the CSV. Please try again." |
| A failure that needs the user to act (the screen stays unusable) | inline `.inline-error` with `role="alert"` and a `.inline-retry` button; **no toast as well** | "Unable to load the symbol list." + Retry |
| A normal data condition or persistent guidance | inline `.inline-note` with `role="status"` (neutral, never red) | "No expiries are listed for these dates." |
| Field validation | the screen's own `.input-error` / field error, unchanged | "From date cannot be after To date." |
| A routine automatic update (defaults following the dates, an untouched strike following its ATM) | nothing | — |

## Rules
- One event, one notification: never an inline message and a toast for the same failure.
- A genuine failure stays an error (red, `role="alert"`). Never turn a failure into information.
- A data condition is not an error: "no data", "no expiries", "no strikes listed", "no trading session" are neutral.
- Toasts with the same type and text are not stacked while one is visible.
- Every toast can be dismissed; errors stay 7 seconds, success and info 3.5 seconds (`TOAST_DURATION_MS`).
- Compact control slots (F&O EOD under the Strike/Expiry selects) keep their own `.range-error` (failure, `role="alert"`, Retry) and
  `.range-info` (neutral, `role="status"`) classes so the layout does not move; the meaning is the same.

Shared styles: `src/scss/utilities/_helpers.scss` (`.inline-error`, `.inline-note`, `.inline-retry`).
