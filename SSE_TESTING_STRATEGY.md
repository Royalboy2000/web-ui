# Testing and Verification: True Real-Time Updates (SSE)

This document outlines the conceptual testing and verification steps for the Server-Sent Events (SSE) implementation, focusing on the `/test_credentials` backend endpoint in `server/app.py` and its consumption in `server/static/script.js`.

## I. Backend API Testing (SSE Stream - `/test_credentials`)

Manual testing of the SSE stream is crucial to ensure correct formatting and behavior before integrating with the frontend.

**Tools:** `curl` is well-suited for observing raw SSE streams.

**Test Cases:**

1.  **Test Case: Correct Headers and MIME Type**
    *   **Action**: Send a valid POST request to `/test_credentials` using `curl -N` (to keep the connection open).
        ```bash
        curl -N -X POST -H "Content-Type: application/json" \
        -d '{"target_post_url": "http://test-login.com/submit", "username_field_name": "user", "password_field_name": "pass", "form_method": "POST", "username_list": ["testuser"], "password_list": ["pass1"]}' \
        http://127.0.0.1:5001/test_credentials
        ```
    *   **Verification**:
        *   Observe response headers: `Content-Type` should be `text/event-stream`.
        *   Other relevant headers like `Cache-Control: no-cache` and `Connection: keep-alive` might also be present.

2.  **Test Case: Correct SSE Message Formatting**
    *   **Action**: Use the same `curl` command as above with a small username and password list (e.g., 2-3 pairs).
    *   **Verification**:
        *   Each event/message from the server should be prefixed with `data: `.
        *   Each event/message should end with `\n\n`.
        *   The content following `data: ` should be a valid JSON string.
        *   Example for one event: `data: {"username": "user1", "password": "pw1", "status": "failure", ...}\n\n`

3.  **Test Case: Streaming of Individual Attempt Results**
    *   **Action**: Use `curl -N` with a username list of 1 and a password list of 3-5 passwords.
    *   **Verification**:
        *   Observe that results are sent incrementally. Each `attempt_result` (for each password) should arrive as a separate SSE message.
        *   The server should not wait for all attempts to finish before sending the first result.

4.  **Test Case: Final "Complete" Event**
    *   **Action**: Use `curl -N` with any valid small list of credentials.
    *   **Verification**:
        *   After all individual attempt results have been streamed, a final message should be sent:
            `data: {"status": "complete", "message": "All attempts finished."}\n\n` (or similar, based on implementation).
        *   The connection should then typically be closed by the server or remain open if keep-alive is very long (though `curl -N` will keep it open client-side).

5.  **Test Case: Initial Validation Errors (Pre-Stream)**
    *   **Action**: Send a POST request with an invalid payload (e.g., missing `username_list`).
        ```bash
        curl -X POST -H "Content-Type: application/json" \
        -d '{"target_post_url": "http://test-login.com/submit", "password_list": ["pass1"]}' \
        http://127.0.0.1:5001/test_credentials
        ```
    *   **Verification**:
        *   The response should **not** be `text/event-stream`.
        *   It should be a standard JSON error response with `Content-Type: application/json`.
        *   Expected Status Code: 400 Bad Request.
        *   Expected JSON Body: `{"error": "Missing required fields..."}`.

6.  **Test Case: Empty Username/Password List (Post-Initial Validation, Pre-Stream Logic)**
    *   **Action**: Send a payload where `username_list` or `password_list` is empty (but present).
    *   **Verification**:
        *   Similar to above, should return a 400 JSON error, not an SSE stream. E.g., `{"error": "'username_list' cannot be empty."}`.

7.  **Test Case: Error During an Individual Attempt (Within Stream)**
    *   **Setup**: Temporarily modify the backend to simulate a `requests.exceptions.Timeout` for one specific password in a list.
    *   **Action**: Use `curl -N` with a list of credentials that includes the one causing the simulated error.
    *   **Verification**:
        *   The stream should yield results for attempts before the error.
        *   For the failing attempt, an SSE message like `data: {"username": "userX", "password": "pwX", "status": "error", "details": "Request timed out during login attempt."}\n\n` should be received.
        *   The stream should continue for subsequent attempts after the error.
        *   The final "complete" event should still be sent.

## II. Frontend Browser Testing (Real-Time UI Updates)

This focuses on how `script.js` consumes and displays the SSE stream.

*   **Test Case 1: Incremental UI Updates (Short & Long Lists)**
    *   **Action**:
        1.  Perform URL analysis successfully.
        2.  Use a short username list (1-2 users) and a short password list (2-3 passwords). Click "Confirm and Proceed".
        3.  Repeat with a longer password list (e.g., 10-20 passwords).
    *   **Verification**:
        *   **LIVE FEED**: Messages should appear one by one (or in quick succession if the backend is fast, but not all at once after a long delay). The 50ms client-side delay will help observe this.
        *   **METRICS HUD**: "TOTAL ATTEMPTS" and "HITS" counters should increment with each result displayed in the live feed.
        *   The UI should remain responsive during the streaming.

*   **Test Case 2: Observing Backend Delays (Simulated)**
    *   **Setup (Conceptual/Temporary Backend Change)**: In `server/app.py`, inside the `test_credentials` loop within `event_stream`, add a `time.sleep(0.5)` or `time.sleep(1)` before yielding each result.
    *   **Action**: Run a test with a few credentials.
    *   **Verification**:
        *   Confirm that results appear in the UI's "LIVE FEED" at intervals corresponding to the sleep time, demonstrating true streaming.
        *   Remove the `time.sleep()` after testing.

*   **Test Case 3: "Complete" Event Handling**
    *   **Action**: Run any test to completion.
    *   **Verification**:
        *   The "All credential tests finished." (or similar server message) should appear as the last message in the "LIVE FEED".
        *   The "Confirm and Proceed" button should be re-enabled, and its text reset.

*   **Test Case 4: Error Handling**
    *   **Initial Request Error**:
        *   Manually trigger a condition where the initial POST to `/test_credentials` would fail (e.g., stop the Flask server temporarily, then click "Confirm and Proceed").
        *   **Verification**: An `alert()` message like "An error occurred during credential testing: Failed to fetch" (or similar depending on browser) should appear. The UI should revert to Step 1, and the button should be re-enabled.
    *   **Stream Interruption (Hard to simulate reliably without specific tools):**
        *   Conceptually, if the stream were to break mid-way, the `finally` block in `script.js` should still re-enable the button. The user might see partial results.
    *   **Invalid JSON in Stream (Backend Error Simulation):**
        *   Temporarily modify the backend to `yield f"data: not_a_json\n\n"` for one event.
        *   **Verification**: A console error "Error parsing streamed JSON..." should appear in the browser console. An error message should be logged to the UI terminal via `addLogMessage`. The loop should ideally continue with other results if possible, or at least not crash the entire frontend. The button should be re-enabled.

*   **Browser Developer Tools Usage:**
    *   **Network Tab**:
        *   Filter for the `/test_credentials` request.
        *   Observe the `EventStream` or `Response` tab for this request to see the raw data chunks as they arrive from the server. Verify the `data: ...\n\n` formatting.
    *   **Console Tab**:
        *   Monitor for JavaScript errors.
        *   Check for custom log messages (e.g., "Stream finished.").

## III. Code Review Focus

*   **`server/app.py` (`/test_credentials` endpoint):**
    *   **Generator Function (`event_stream`):**
        *   Correctly yields SSE formatted strings (`f"data: {json.dumps(data)}\n\n"`).
        *   Session and headers are correctly managed (session outside the loop, headers static or correctly updated if needed per request).
        *   The loop iterates correctly through the username/password pairs.
        *   `attempt_result` includes `username` and actual `password`.
    *   **Error Handling within Stream**: `try...except` blocks around individual `requests.post/get` calls correctly yield error-formatted `attempt_result` objects without breaking the stream for other attempts.
    *   **Completion Event**: A final `data: {"status": "complete", ...}\n\n` event is yielded after the loop.
    *   **Main Function**: Correctly returns `Response(event_stream(), mimetype='text/event-stream')`. Initial validation (payload, empty lists) returns standard JSON errors with 400 status before attempting to stream.
*   **`server/static/script.js` (`confirmAndProceedBtn` listener):**
    *   **Stream Consumption**:
        *   `response.body.getReader()` is used.
        *   The `while(true)` loop with `await reader.read()` correctly processes chunks.
        *   `TextDecoder` is used appropriately.
        *   The `buffer` and `processBuffer` logic correctly handle message framing (splitting by `\n\n` and parsing `data:` lines).
    *   **UI Updates**:
        *   Terminal and HUD counters are initialized/cleared before starting.
        *   `addLogMessage` is called for each received data event and for the completion event.
        *   Password displayed in the log is masked using `replace(/./g, '*')`.
        *   HUD counters are updated incrementally.
    *   **Error Handling**:
        *   Handles `!response.ok` for the initial `fetch` call.
        *   Handles errors during stream reading or JSON parsing within `processStream`/`processBuffer`.
    *   **`finally` Block**: Ensures UI elements like the button are reset regardless of success or failure of the stream.

This conceptual testing strategy aims to ensure the SSE implementation is robust, provides correct data, and leads to a responsive user experience.
