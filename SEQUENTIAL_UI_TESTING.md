# Testing and Verification: Sequential UI Flow

This document outlines the conceptual testing and verification steps for the "Sequential UI Flow" implemented in `server/templates/index.html` and `server/static/script.js`.

## I. Manual Browser Testing (Primary Method)

This involves stepping through the application as a user would, verifying UI state and transitions at each point. The Flask server must be running.

**A. Full Successful Workflow:**

1.  **Initial Load (State 1: Target URL Input)**
    *   **Action**: Open the application URL (`http://127.0.0.1:5001`).
    *   **Expected Visible**:
        *   `#uiStep-TargetURL` div and its contents (Login URL input, "Analyze Form" button).
        *   Global header/navigation.
    *   **Expected Hidden**:
        *   `#uiStep-AnalysisReview` div.
        *   `#uiStep-CredentialsInput` div.
        *   `#uiStep-Monitor` div.
        *   `#form-analysis-results` panel (inside `#uiStep-AnalysisReview`).
        *   `#step2-options` (Advanced Options panel).

2.  **URL Analysis (Transition to State 2: Analysis Review)**
    *   **Action**:
        1.  Enter a valid Login URL into `#login-url`.
        2.  (Select a dummy password file, as it's currently checked in `analyzeFormButton` listener, though not used by `/analyze_url` endpoint).
        3.  Click "Analyze Form" (`#analyzeFormButton`).
    *   **During Analysis**:
        *   "Analyze Form" button text changes to "Analyzing...", spinner appears, button disabled.
    *   **On Successful Analysis**:
        *   **Expected Visible**:
            *   `#uiStep-AnalysisReview` div.
            *   `#form-analysis-results` panel (inside `#uiStep-AnalysisReview`) is now visible and populated with detected parameters.
            *   "Proceed to Credentials" button (`#proceedToCredentialsBtn`) is visible.
            *   Global header/navigation.
        *   **Expected Hidden**:
            *   `#uiStep-TargetURL`.
            *   `#uiStep-CredentialsInput`.
            *   `#uiStep-Monitor`.
            *   `#step2-options`.
        *   "Analyze Form" button (on `#uiStep-TargetURL`) is re-enabled and text reset (though the step itself is hidden).

3.  **Proceed to Credentials (Transition to State 3: Credentials Input)**
    *   **Action**: Click "Proceed to Credentials" (`#proceedToCredentialsBtn`) on `#uiStep-AnalysisReview`.
    *   **Expected Visible**:
        *   `#uiStep-CredentialsInput` div and its contents (Username file upload, Password file upload, "Launch Attack" button).
        *   Global header/navigation.
    *   **Expected Hidden**:
        *   `#uiStep-TargetURL`.
        *   `#uiStep-AnalysisReview` (including `#form-analysis-results`).
        *   `#uiStep-Monitor`.
        *   `#step2-options`.

4.  **Launch Attack (Transition to State 4: Monitor Attack)**
    *   **Action**:
        1.  Upload a valid username list file.
        2.  Upload a valid password list file.
        3.  Click "Launch Attack" (`#launchAttackBtn`).
    *   **During Launch Initiation**:
        *   "Launch Attack" button text changes to "Launching..." (or "Processing..."), button disabled.
    *   **On Successful Initiation of Attack (SSE stream starts)**:
        *   **Expected Visible**:
            *   `#uiStep-Monitor` div and its contents (Live Feed, Metrics HUD).
            *   Global header/navigation.
        *   **Expected Hidden**:
            *   `#uiStep-TargetURL`.
            *   `#uiStep-AnalysisReview`.
            *   `#uiStep-CredentialsInput`.
            *   `#step2-options`.
        *   Live feed starts populating with attempt results.
        *   Metrics HUD updates.
    *   **On Completion/End of Stream**:
        *   "Launch Attack" button (on `#uiStep-CredentialsInput`, now hidden) is re-enabled and text reset. User remains on `#uiStep-Monitor`.

**B. Error Condition Test Cases:**

1.  **Error During URL Analysis (e.g., invalid URL, server error from `/analyze_url`)**
    *   **Action**: In State 1, enter an invalid URL or a URL that will cause the backend `/analyze_url` to return an error. Click "Analyze Form".
    *   **Expected UI State**:
        *   An `alert()` displays the error message from the backend or a generic failure message.
        *   The UI remains on `#uiStep-TargetURL`.
        *   `#form-analysis-results` panel remains hidden.
        *   "Analyze Form" button is re-enabled and text reset.

2.  **Error/Validation Failure at Credentials Input Stage (State 3)**
    *   **Action**:
        *   Navigate to `#uiStep-CredentialsInput` (after successful analysis).
        *   Attempt to click "Launch Attack" without selecting a username file.
        *   Attempt to click "Launch Attack" without selecting a password file.
        *   (If implemented) Upload an invalid file type or oversized file for usernames/passwords.
        *   Attempt to click "Launch Attack" if critical parameters from analysis (e.g., `targetPostUrl`) were somehow cleared or are invalid (this is also checked).
    *   **Expected UI State**:
        *   An `alert()` displays the specific validation error (e.g., "Please select a username/email list file.").
        *   The UI remains on `#uiStep-CredentialsInput`.
        *   `#uiStep-Monitor` is not shown.
        *   "Launch Attack" button is re-enabled and text reset.
        *   Relevant error messages might appear in the terminal of `#uiStep-Monitor` if the transition started but failed very early (current logic tries to log to active step 3 terminal). Ensure this is graceful if step 3 is not yet fully the context for `addLogMessage`.

3.  **Error During Initiation of Attack Call (e.g., `/test_credentials` API returns immediate error before streaming)**
    *   **Action**: Have all valid inputs in `#uiStep-CredentialsInput`. Modify the backend to make `/test_credentials` immediately return a 4xx/5xx error before starting the SSE stream (e.g., simulate a payload validation error that wasn't caught by client-side checks). Click "Launch Attack".
    *   **Expected UI State**:
        *   The UI might briefly switch to `#uiStep-Monitor`.
        *   An `alert()` should display the error from the backend.
        *   A message should be logged to the terminal in `#uiStep-Monitor` indicating the failure.
        *   "Launch Attack" button is re-enabled. The user might be left on `#uiStep-Monitor` with the error or transitioned back to `#uiStep-CredentialsInput` (current logic in `script.js` for critical setup errors in `launchAttackBtn`'s `try...catch` before stream processing is to revert to `uiStep-CredentialsInput` or `uiStep-AnalysisReview`). This behavior should be confirmed.

## II. JavaScript Console Checks

*   Throughout all manual testing scenarios, continuously monitor the browser's developer console.
*   **Verify**:
    *   No unexpected JavaScript errors.
    *   Correct logging of informational messages (e.g., "Starting form analysis...", "Stream finished.").
    *   Correct logging of any caught errors or warnings from API calls or internal logic.

## III. Code Review Focus

*   **`server/templates/index.html`**:
    *   **Correct IDs**: All new step divs (`uiStep-TargetURL`, `uiStep-AnalysisReview`, `uiStep-CredentialsInput`, `uiStep-Monitor`) and buttons (`analyzeFormButton`, `proceedToCredentialsBtn`, `launchAttackBtn`) have the correct `id` attributes.
    *   **Initial Visibility**: `#uiStep-TargetURL` has the `active` class. All other `uiStep-*` divs and `#step2-options` have `style="display:none;"` or do not have the `active` class, ensuring they are hidden on initial load.
    *   **Content Nesting**: Ensure that elements like `#form-analysis-results`, file input zones, and the terminal/HUD are correctly nested within their new parent step divs.
    *   **HUD IDs**: Confirm `span` elements within the HUD have the correct IDs (`hud-total-attempts`, `hud-hits`, etc.) for JS to target.

*   **`server/static/script.js`**:
    *   **`showUiStep(stepIdToShow)` Function**:
        *   Correctly sets `style.display` to `'block'` for the target step and `'none'` for others.
        *   Correctly manages the `active` class for these steps.
        *   Handles the `terminalBody` reference update when `#uiStep-Monitor` is shown.
    *   **DOM References**: All new/changed IDs for steps and buttons are correctly referenced at the top of `DOMContentLoaded`.
    *   **Event Handler Logic**:
        *   `analyzeFormButton`: On success, calls `showUiStep('uiStep-AnalysisReview')` and shows `#form-analysis-results`. On error, stays on `uiStep-TargetURL`.
        *   `proceedToCredentialsBtn`: Correctly calls `showUiStep('uiStep-CredentialsInput')`.
        *   `launchAttackBtn`:
            *   Calls `showUiStep('uiStep-Monitor')` *before* initiating file reading or API calls that would populate the monitor view.
            *   Handles file reading errors by alerting and staying on/returning to `uiStep-CredentialsInput`, re-enabling the button.
            *   Handles API errors by alerting and logging, re-enabling the button, and typically leaving the user on `uiStep-Monitor` to see partial results/errors.
    *   **Data Flow & Context**: `window.attackContext` is populated correctly after analysis and used correctly when launching the attack. Data from UI inputs (like detected field names) is correctly read at the point of launching the attack.
    *   **Button State Management**: All relevant buttons (`analyzeFormButton`, `launchAttackBtn`) have their text and `disabled` state managed correctly during operations and in `finally` blocks.
    *   **Terminal Clearing**: The terminal in `#uiStep-Monitor` is cleared (`innerHTML = ''`) before new test results are displayed.
    *   **`addLogMessage` Targeting**: Ensure `addLogMessage` reliably targets the terminal within the currently active `#uiStep-Monitor`.

This detailed testing approach will help ensure the sequential UI flow is implemented correctly and provides a smooth, intuitive user experience.
