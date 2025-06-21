# UI/UX Redesign: Sequential Flow Enhancement

## 1. Goal

To improve the user experience by guiding the user through a clear, step-by-step process for configuring and launching an attack, rather than presenting all options at once. This will make the tool more intuitive and reduce cognitive load. The existing "wizard-step" classes will be leveraged and managed more dynamically.

## 2. Proposed Sequence of User Interaction & UI States

The application will progress through distinct states, primarily controlled by the visibility of the existing `#step1`, `#form-analysis-results` (within step 1), and `#step3` panels. The current `#step2` (Options & Payload) will be temporarily hidden or bypassed in this phase for simplicity, with its functionality potentially integrated later or remaining as an advanced optional step.

---

**State 1: Initial View - Enter Target URL & Select Files**

*   **Description**: User provides the initial target information and necessary files.
*   **Visible Elements**:
    *   `#step1` (wizard-step active)
        *   Login URL input (`#login-url`)
        *   Username list file upload (`#username-list-upload`, `#browse-username-files-btn`, `#selected-username-file-name`)
        *   Password list file upload (`#password-list-upload`, `#browse-files-btn`, `#selected-password-file-name`)
        *   "Analyze Form" button (`.btn-analyze`)
    *   Global header and navigation.
*   **Hidden Elements**:
    *   `#form-analysis-results` panel (within `#step1`).
    *   `#step2` (Options & Payload) - This entire step will be hidden/inactive.
    *   `#step3` (Launch & Monitor) - This entire step will be hidden/inactive.
    *   "Confirm and Proceed" button (which is inside `#form-analysis-results`).
*   **User Action**:
    1.  User enters a Login URL.
    2.  User uploads a username list file.
    3.  User uploads a password list file.
    4.  User clicks the "Analyze Form" button.

---

**State 2: URL Analysis & Parameter Review**

*   **Trigger**: Successful completion of the `/analyze_url` API call initiated by the "Analyze Form" button.
*   **Visible Elements**:
    *   `#step1` remains active.
    *   All elements from State 1 remain visible.
    *   `#form-analysis-results` panel becomes visible, populated with:
        *   Detected Username Field Name (`#detected-username-field`)
        *   Detected Password Field Name (`#detected-password-field`)
        *   Detected Form POST URL (`#detected-post-url`)
    *   "Confirm and Proceed" button (`#confirm-and-proceed-btn`) within the `#form-analysis-results` panel is now visible and enabled.
*   **Hidden Elements**:
    *   `#step2`
    *   `#step3`
*   **User Action**:
    1.  User reviews the auto-detected parameters.
    2.  User can optionally edit these parameters directly in the input fields.
    3.  User clicks the "Confirm and Proceed" button.
*   **Error Scenario (Analysis Fails)**:
    *   If `/analyze_url` API call returns an error (e.g., URL not reachable, no form found):
        *   An `alert()` message displays the error.
        *   `#form-analysis-results` panel might remain hidden or show empty/error states in its fields.
        *   The user remains in a state similar to State 1, needing to correct the URL or understand the issue. "Confirm and Proceed" button would not typically become active or visible.

---

**State 3: Provide Credentials (Implicitly Done in State 1 & Confirmed in State 2)**

*   **Description**: This state is effectively combined with State 1 (file selection) and State 2 (parameter confirmation). The actual reading of username/password files and preparation for testing happens *after* the "Confirm and Proceed" button is clicked.
*   **Trigger**: User clicks "Confirm and Proceed" button in State 2.
*   **Visible Elements**: Transitioning state. The UI will immediately move to State 4 (Monitor Attack) upon clicking "Confirm and Proceed".
*   **Hidden Elements**: `#step1` becomes hidden.
*   **User Action**: This state is transitional. The primary user action (clicking "Confirm and Proceed") moves to the next state. Client-side validation for file presence and detected parameters occurs here before calling `/test_credentials`.

---

**State 4: Monitor Attack**

*   **Trigger**: Successful client-side validation after "Confirm and Proceed" is clicked, and the `/test_credentials` API call is initiated.
*   **Visible Elements**:
    *   `#step3` (wizard-step becomes active).
        *   "Launch & Monitor" title.
        *   "LIVE FEED" terminal (`.terminal-body`), which starts populating with results from the SSE stream.
        *   "METRICS HUD" (Total Attempts, Hits, etc.), which updates based on streamed results.
        *   Terminal filters ("ALL", "HITS", "FAILS", "CONTENT LENGTH", "RESPONSE").
    *   Global header and navigation.
*   **Hidden Elements**:
    *   `#step1` (including `#form-analysis-results`).
    *   `#step2`.
    *   The "Confirm and Proceed" button itself is part of `#step1` and thus hidden. The "LAUNCH" button in `#step3` is currently not wired to any new action in this phase but could be repurposed later for "Stop/Pause/Resume".
*   **User Action**:
    *   User monitors the live feed and metrics.
    *   User can click on log entries in the live feed to open the modal displaying request/response details (as per previous modal implementation).
    *   User can use terminal filters to view specific results.
*   **Completion/Error Scenario**:
    *   **Completion**: The SSE stream sends a "complete" message, logged in the terminal. The "Confirm and Proceed" button (if it were visible and controlled this state, which it isn't directly anymore) would be re-enabled. (Currently, the `confirmAndProceedBtn` is on Step 1, its `finally` block re-enables it, which is fine as the user might go back via navigation or start a new attack).
    *   **Error during testing**: If the `/test_credentials` API call itself fails or the stream encounters a critical error, an `alert()` is shown, and an error message is logged in the terminal. The user remains on Step 3 to see the partial results and error.

## 3. Simplifications for this Phase

*   **"Back" Button**: A dedicated "Back" button to explicitly move from Step 3 (Monitor) or Step 2 (Parameter Review) to Step 1 is not being implemented in this phase. Users would typically restart the process or use global navigation if implemented.
*   **`#step2` (Options & Payload)**: This step is currently bypassed in the described primary flow. Its visibility and integration will be considered for future enhancements. The UI elements exist in HTML but will not be made `active`.
*   **"LAUNCH" button in Step 3**: The large "▶ LAUNCH" button in the `#step3` monitor header is not being wired to start the attack in this phase (the "Confirm and Proceed" button from Step 1 effectively does this). It remains as a UI element for potential future use (e.g., "Stop/Pause Attack").
*   **Elaborate Content Length/Response Filtering**: The "CONTENT LENGTH" and "RESPONSE" filters in the terminal will initially just show all messages (like "ALL"). The primary enhancement is making log entries clickable to show details in a modal. Specific filtering based on content length values is deferred.

This sequential flow aims to make the application more guided and less overwhelming for the user.
