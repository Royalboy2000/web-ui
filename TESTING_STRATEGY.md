# Testing and Debugging Strategy for Predator Web Attack Panel

This document outlines the strategy for testing and debugging the Predator Web Attack Panel application, which consists of a Flask backend and a JavaScript/HTML frontend.

**I. Backend Testing (Flask Server - `server/app.py`)**

1.  **Unit Tests (e.g., using `pytest` and `unittest.mock`):**
    Unit tests will focus on isolating and testing individual functions and API endpoints. `requests.Session.get` and `requests.Session.post` will be mocked to simulate external API responses without making actual network calls.

    *   **`/analyze_url` Endpoint Tests:**
        *   **Test Case 1: Valid URL, Full Form Data**
            *   **Input**: URL known to have a standard login form with username, password fields, and a CSRF token.
            *   **Mock**: `requests.Session.get` returns a mock response with HTML containing the expected form structure and cookies.
            *   **Expected Outcome**: 200 OK, JSON response containing correctly parsed `post_url`, `form_method`, `username_field_name`, `password_field_name`, `csrf_token_name`, `csrf_token_value`, and `cookies`.
        *   **Test Case 2: Valid URL, Form without CSRF Token**
            *   **Input**: URL with a login form but no CSRF token.
            *   **Mock**: `requests.Session.get` returns HTML without CSRF hidden fields.
            *   **Expected Outcome**: 200 OK, `csrf_token_name` and `csrf_token_value` are `None` or empty. Other fields correctly populated.
        *   **Test Case 3: Valid URL, No Password Field**
            *   **Input**: URL of a page without any `input[type="password"]`.
            *   **Mock**: `requests.Session.get` returns HTML without password fields.
            *   **Expected Outcome**: 404 Not Found, JSON error `{"error": "No password input field found on the page."}`.
        *   **Test Case 4: Valid URL, Password Field Not in Form**
            *   **Input**: URL where an `input[type="password"]` exists but is not a descendant of a `<form>` tag.
            *   **Mock**: `requests.Session.get` returns such HTML.
            *   **Expected Outcome**: 404 Not Found, JSON error `{"error": "Password field found, but it's not within a form."}`.
        *   **Test Case 5: URL Fetch Timeout**
            *   **Input**: Any URL.
            *   **Mock**: `requests.Session.get` raises `requests.exceptions.Timeout`.
            *   **Expected Outcome**: 504 Gateway Timeout, JSON error `{"error": "Request timed out while fetching the URL."}`.
        *   **Test Case 6: URL Fetch HTTP Error**
            *   **Input**: Any URL.
            *   **Mock**: `requests.Session.get` returns a response with `response.raise_for_status()` throwing an error (e.g., status 404 or 500).
            *   **Expected Outcome**: 500 Internal Server Error (or specific error code if mapped), JSON error like `{"error": "Error fetching or processing URL: ..."}`.
        *   **Test Case 7: Invalid Request Payload (Missing URL)**
            *   **Input**: POST request to `/analyze_url` with empty JSON or JSON missing the `url` key.
            *   **Expected Outcome**: 400 Bad Request, JSON error `{"error": "Missing 'url' in request payload"}`.
        *   **Test Case 8: Relative Action URL in Form**
            *   **Input**: URL whose form has a relative action (e.g., `action="/login-process"`).
            *   **Mock**: `requests.Session.get` returns HTML with such a form.
            *   **Expected Outcome**: 200 OK, `post_url` in response is correctly resolved to an absolute URL.

    *   **`/test_credentials` Endpoint Tests:**
        *   **Test Case 1: Correct Credentials Simulation (Based on Heuristics)**
            *   **Input**: Valid payload including a password known to trigger a "success" heuristic (e.g., causes redirect, shows success keyword).
            *   **Mock**: `requests.Session.post` (or `get`) simulates a successful login response (e.g., redirect to `/dashboard`, specific body content).
            *   **Expected Outcome**: 200 OK, JSON list where the relevant password attempt has `status: "success"` and appropriate `details`.
        *   **Test Case 2: Incorrect Credentials Simulation**
            *   **Input**: Valid payload with a password known to trigger a "failure" heuristic (e.g., response contains "invalid password").
            *   **Mock**: `requests.Session.post` simulates a failed login response.
            *   **Expected Outcome**: 200 OK, JSON list where the relevant password attempt has `status: "failure"` and `details` indicating the reason.
        *   **Test Case 3: Server Error During One Attempt**
            *   **Input**: Payload with multiple passwords.
            *   **Mock**: `requests.Session.post` raises `requests.exceptions.Timeout` for one specific password in the list.
            *   **Expected Outcome**: 200 OK, JSON list where the specific attempt has `status: "error"` and `details` for timeout, while other attempts are processed normally.
        *   **Test Case 4: Unsupported Form Method**
            *   **Input**: Payload with `form_method: "PUT"`.
            *   **Expected Outcome**: 200 OK, JSON list where each attempt has `status: "error"` and `details: "Unsupported form method: PUT"`.
        *   **Test Case 5: Invalid Request Payload (Missing Fields)**
            *   **Input**: POST request to `/test_credentials` missing one or more required fields.
            *   **Expected Outcome**: 400 Bad Request, JSON error `{"error": "Missing required fields..."}`.
        *   **Test Case 6: CSRF Token Handling**
            *   **Input**: Payload includes CSRF name and value.
            *   **Mock**: Verify that the `payload` passed to `session.post` includes the CSRF token.
            *   **Expected Outcome**: Correct formation of payload with CSRF token.
        *   **Test Case 7: Initial Cookie Handling**
            *   **Input**: Payload includes `initial_cookies`.
            *   **Mock**: Verify that `session.cookies.update()` is called with these cookies before attempts.
            *   **Expected Outcome**: Session is correctly initialized with provided cookies.

2.  **Integration Tests:**
    *   Use Flask's test client (`app.test_client()`) to simulate a full user workflow.
    *   **Scenario 1**:
        1.  Call `/analyze_url` with a mock page URL.
        2.  Verify the response, extracting necessary details (post_url, field names, cookies, csrf).
        3.  Call `/test_credentials` using these extracted details and a sample password list.
        4.  Verify the structure and content of the returned results list.
    *   This tests the data flow, correct parameter passing, and session cookie handling between the two endpoints.

3.  **Manual API Testing:**
    *   Utilize tools like Postman or `curl`.
    *   Start the Flask development server (`python server/app.py`).
    *   Send crafted JSON requests to `/analyze_url` with various real and test URLs. Inspect headers, status codes, and JSON responses.
    *   Send crafted JSON requests to `/test_credentials` using data obtained from `/analyze_url` (or manually constructed). Inspect responses and server logs for detailed behavior.
    *   This helps verify real network interactions (where not mocked) and header/cookie behaviors.

**II. Frontend Testing (Client-Side - `script.js`, `index.html`)**

1.  **Manual Browser Testing:** This will be the primary method for frontend testing, covering user interactions and UI feedback.

    *   **Workflow 1: URL Analysis**
        *   **Steps**:
            1.  Open `index.html` (served by Flask) in a browser.
            2.  Enter a valid username/email.
            3.  Select a valid password file (.txt or .csv).
            4.  Enter a target Login URL (use a test page first, then a real one if safe).
            5.  Click "Analyze Form".
        *   **Verification Points**:
            *   Button changes to "Analyzing..." and is disabled.
            *   Network tab: Verify a POST request is made to `/api/analyze_url` with the correct JSON payload (`{ "url": "..." }`).
            *   Console: Check for "Starting form analysis..." log and any errors.
            *   On response:
                *   Button re-enables and text resets.
                *   `form-analysis-results` panel appears.
                *   Detected fields (Username Field Name, Password Field Name, Form POST URL) are populated in the UI from the API response.
                *   `window.attackContext` is populated with `formMethod`, `csrfTokenName`, `csrfTokenValue`, `initialCookies`.
                *   If API returns an error (e.g., "No password field found"), an appropriate `alert()` is shown.
                *   If API call fails (network error), an `alert()` is shown.

    *   **Workflow 2: Credential Testing**
        *   **Steps**:
            1.  Complete Workflow 1 successfully.
            2.  Verify/correct detected parameters if needed.
            3.  Click "Confirm and Proceed".
        *   **Verification Points**:
            *   Button changes to "Processing..." and is disabled.
            *   Step 1 UI becomes inactive, Step 3 UI becomes active.
            *   Terminal (`.terminal-body`) is cleared.
            *   Initial log messages ("Initiating login attempts...") appear in the terminal.
            *   Network tab: Verify a POST request to `/api/test_credentials` with the correct comprehensive JSON payload.
            *   Console: Check for any errors.
            *   On response:
                *   Terminal displays results for each password attempt (status, user, masked pass, details) with correct styling.
                *   Metrics HUD: "TOTAL ATTEMPTS" and "HITS" are updated correctly.
                *   Button re-enables and text resets after all results are displayed.
                *   If API returns an error, an `alert()` is shown, and an error message appears in the terminal.

    *   **Input Validation (Client-Side - re-verify all):**
        *   Username/Email: Alert if empty.
        *   Password List: Alert if not selected; alert for invalid file type (.txt/.csv); alert for file size > 5MB.
        *   Login URL: Alert if empty; alert for invalid format (not starting http/https); alert for general invalid URL.
        *   Detected Parameters (before "Confirm and Proceed"): Alert if critical fields (POST URL, username field, password field) are empty or "Could not auto-detect".

2.  **Cross-Browser Testing:**
    *   Perform key workflow tests on latest versions of major browsers:
        *   Google Chrome
        *   Mozilla Firefox
        *   (Optional: Safari, Edge if resources permit)
    *   Focus on UI rendering, JavaScript execution, and API interactions.

3.  **JavaScript Console Monitoring:**
    *   Continuously monitor the browser's developer console during all manual tests.
    *   Check for any JavaScript errors not caught by `try...catch` blocks.
    *   Observe `console.log` and `console.error` messages for debugging information and to confirm expected logging.

**III. General Debugging Techniques**

1.  **Server-Side (Flask):**
    *   Utilize the Flask development server's built-in debugger (enabled by `app.run(debug=True)`). This provides stack traces and an interactive debugger in the browser for unhandled exceptions.
    *   Strategically place `app.logger.debug()`, `app.logger.info()`, `app.logger.warning()`, and `app.logger.error()` statements throughout `server/app.py` to trace execution flow and variable states. Pay attention to `exc_info=True` for `app.logger.error` in generic exception handlers.
    *   Inspect server logs written to the console/standard output.

2.  **Client-Side (JavaScript):**
    *   Use browser developer tools extensively:
        *   **Console Tab**: View `console.log` messages, errors, and warnings. Execute JavaScript snippets.
        *   **Network Tab**: Inspect requests and responses to/from the Flask backend. Check headers, payloads, status codes, and response data. Crucial for debugging API integrations.
        *   **Debugger (Sources Tab)**: Set breakpoints in `script.js` to step through code execution, inspect variables, and understand logic flow.
        *   **Elements Tab**: Inspect the DOM structure and CSS styling.

3.  **Correlation:**
    *   When an issue occurs, correlate server-side logs with client-side console/network logs. Timestamps (both server-side and client-side in `addLogMessage`) can help align events.
    *   Understand the full request-response cycle to pinpoint where an error or unexpected behavior originates.

**IV. Test Environment & Data (Conceptual)**

1.  **Environment:**
    *   **Local Development:** Primary testing will occur with the Flask server running locally and the frontend accessed via `http://127.0.0.1:5001`.
    *   **Test Login Pages:**
        *   Create a simple, local HTML page with a basic login form that the `/analyze_url` endpoint can target for predictable results.
        *   Use publicly available, known-safe websites designed for testing login forms (e.g., `http://testphp.vulnweb.com/login.php`, `https://try.gitea.io/user/login` - check terms of service before automated testing). **Caution is advised when testing against real, third-party websites.**
2.  **Test Data:**
    *   **URLs**: A list of diverse URLs (HTTP/HTTPS, with/without forms, forms with/without CSRF, different field names).
    *   **Usernames**: A few sample usernames/emails.
    *   **Password Lists**: Small `.txt` and `.csv` files with a mix of passwords, including:
        *   Known "correct" passwords (for simulated success).
        *   Known "incorrect" passwords.
        *   Passwords with special characters.
        *   Empty lines or poorly formatted lines to test parser robustness.
    *   **CSRF Tokens**: Examples of common CSRF token names and values for testing detection.

This structured approach to testing will help ensure the application's reliability and identify issues early in the development cycle.
