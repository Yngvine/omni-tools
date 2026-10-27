# OmniTools UX and QoL Backlog

**Status:** Video downloader job manager implemented and verified; remaining items proposed  
**Scope:** This backlog tracks remaining proposed work and current implementation.

## Audit Findings

- **Tool search:** The autocomplete is on the home page (`Hero`), not in the persistent app shell. Its options filter as the user types, but the quick links are static examples or bookmarks. There is no recent/frequent-use ranking, and the search component unmounts on tool navigation.
- **Multi-image ordering:** Image uploads display thumbnails and support removal/clear, but have no reorder control. The PDF converter consumes the input array order. Audio/PDF inputs have reorder helper functions, but they are not currently wired to visible drag interactions.
- **Video URL downloader:** The original one-shot form has been replaced by an in-page queue manager using MeTube's `/formats`, `/history`, `/add`, `/retry`, and `/delete` routes plus its Socket.IO queue events. The view shows live progress, completed files, failures, retries, and cancellation without exposing a directory listing. Focused tests, lint, production build, and desktop/mobile browser checks pass.
- **Shared tool experience:** Tools use common input/result components, but interaction states and affordances vary. The video downloader is currently an especially isolated custom form, while generic file results provide a preview and download action.

## Proposed Priorities

### P1: Persistent Tool Launcher

Move a compact search/command field into the app shell so it is available on home, category, and tool routes. Keep the existing tool/category matching and add keyboard navigation and a clear-to-dismiss interaction.

Rank suggestions from a combination of recent use, local use count, bookmarks, and text relevance. Store usage data locally only; document a simple way to clear it. Preserve the current bookmark mechanism and avoid sending search history to a server.

**Acceptance checks:** Search works from every route; selecting a result navigates correctly; keyboard-only users can open, navigate, select, and dismiss suggestions; recent/frequent suggestions change after using tools; empty/new-user state remains useful.

### P1: Reorderable Multi-Image Input for PDF Creation

Add visible drag handles and reliable ordering controls to the image queue. Include move-up/move-down buttons as keyboard and touch alternatives, stable item identity, readable filenames, thumbnails, and remove actions. Ensure generated PDF page order follows the displayed order.

**Acceptance checks:** Reorder works with pointer, keyboard, and touch; adding more files preserves existing order; removing an image does not reorder the remaining images unexpectedly; the exported PDF pages match the visible queue order.

### P1: Video Download Job Manager (Complete)

Replace the one-shot “queued” alert and direct directory link with an in-page job list. Show queued, active, completed, and failed jobs; title/source, selected type/quality, progress when available, and useful failure messages. Provide completed-file download actions and supported cancel/retry actions.

The confirmed `ghcr.io/alexta69/metube:latest` contract provides a dynamic `/formats` catalog, `/history`, `/add`, `/retry`, and `/delete` routes, plus Socket.IO `all`, `added`, `updated`, `completed`, `canceled`, and `cleared` events. The UI connects through the existing Nginx proxy at `/api/metube/socket.io`; no adapter or fork is needed for this pass. Completed files remain on the MeTube volume and are linked from the dedicated completed list through `/download/` or `/audio_download/`.

**Acceptance checks:** A submitted URL appears once in the queue; status updates without a manual page refresh; completed output downloads from the app; failed jobs can be retried and queue jobs canceled; unavailable states are understandable; the UI works on mobile and does not depend on directory-listing HTML.

### P2: Consistent Tool Controls and Feedback

Audit shared tool input/result patterns for clear/reset, validation, processing, completion, and error states. Standardize the placement and labeling of primary actions, file details, previews, and downloads while preserving tool-specific controls. Check that long-running tools cannot display stale output as if it were the latest result.

**Acceptance checks:** Common file tools expose predictable clear/remove/download actions; loading and errors are visible and actionable; completed results remain associated with the input/options that produced them.

### P2: Responsive and Accessible Interaction Pass

Review tool navigation, upload lists, option panels, and result previews at narrow widths. Replace non-semantic click targets with buttons, add accessible names/tooltips where needed, and ensure drag interactions have non-drag alternatives.

**Acceptance checks:** Core workflows are usable at mobile widths and with keyboard navigation; focus remains visible; text and controls do not overlap; icon-only actions have accessible labels.

## Suggested Implementation Order

1. [x] Confirm the MeTube API contract; no server-side adapter is needed for this pass.
2. Implement the persistent launcher and local recent/frequent ranking.
3. Implement reorder controls for multi-image PDF input, then wire a focused order-to-export test.
4. [x] Build and verify the video job manager against the confirmed API contract.
5. Apply the shared controls/accessibility pass across the highest-traffic tools.

## Decisions to Confirm

- Should local usage ranking be enabled by default, with a clear-history action?
proposed: keep a stack to keep track of last time a service was used and a counter of how many times it was used and decide based on that
- Which MeTube version and API endpoints are deployed, and should completed downloads remain on the MeTube volume or be served through a dedicated app endpoint?
the docker file indicates latest for the metube api
 metube:
    image: ghcr.io/alexta69/metube:latest
if needed we may work on forking a specific version. the files converted with metube should be served to be downloaded by a dedicated list view
- Should image-to-PDF default to the current per-image full-size behavior, or should a common page-size preset be offered more prominently?
tbd