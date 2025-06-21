# Testing and Verification: Parameter Detection via Captured Request

This document outlines the conceptual testing and verification steps for the "Parameter Detection via Captured Request" feature, which involves the `/parse_captured_request` backend endpoint in `server/app.py` and its corresponding UI interaction in `server/static/script.js`.

## I. Backend API Testing (`/parse_captured_request`)

Manual testing of the `/parse_captured_request` endpoint using tools like Postman or `curl` is essential to validate its parsing capabilities and error handling.

**Test Setup:**
*   The Flask server (`server/app.py`) must be running.
*   Requests will be POSTed to `http://127.0.0.1:5001/parse_captured_request` with a JSON payload: `{"raw_request": "<raw_http_string_here>"}`.

**Test Cases:**

1.  **Test Case: Valid POST - `application/x-www-form-urlencoded`**
    *   **Input `raw_request`**:
        ```
        POST /login HTTP/1.1
        Host: example.com
        Content-Type: application/x-www-form-urlencoded
        Content-Length: 27
        Cookie: session_id=abc123xyz; other_cookie=value

        username=testuser&password=testpass&csrf_token=sampletoken
        ```
    *   **Expected Key Fields in Response (200 OK)**:
        *   `post_url`: "http://example.com/login" (or https if inferred)
        *   `form_method`: "POST"
        *   `form_parameters`: `{"username": "testuser", "password": "testpass", "csrf_token": "sampletoken"}`
        *   `request_headers`: Contains `Host`, `Content-Type`, `Content-Length`, `Cookie`.
        *   `username_field_name`: "username"
        *   `password_field_name`: "password"
        *   `csrf_token_name`: "csrf_token"
        *   `csrf_token_value`: "sampletoken"
        *   `cookies`: `{"session_id": "abc123xyz", "other_cookie": "value"}`

2.  **Test Case: Valid POST - `application/json`**
    *   **Input `raw_request`**:
        ```
        POST /api/login HTTP/1.1
        Host: api.example.com
        Content-Type: application/json
        X-CSRF-Token: json_csrf_val

        {"email_address": "jsonuser@example.com", "user_pass": "complex!@#"}
        ```
    *   **Expected Key Fields in Response (200 OK)**:
        *   `post_url`: "http://api.example.com/api/login"
        *   `form_method`: "POST"
        *   `form_parameters`: `{"email_address": "jsonuser@example.com", "user_pass": "complex!@#"}`
        *   `request_headers`: Contains `Host`, `Content-Type`, `X-CSRF-Token`.
        *   `username_field_name`: "email_address"
        *   `password_field_name`: "user_pass"
        *   `csrf_token_name`: "X-CSRF-Token" (from header) or from body if also present.
        *   `csrf_token_value`: "json_csrf_val"
        *   `cookies`: {} (empty if no Cookie header sent)

3.  **Test Case: Valid GET Request with Query Parameters**
    *   **Input `raw_request`**:
        ```
        GET /auth?loginId=getter&pwdField=getPass123&_csrf=gettoken HTTP/1.1
        Host: test.com
        User-Agent: TestClient
        ```
    *   **Expected Key Fields in Response (200 OK)**:
        *   `post_url`: "http://test.com/auth" (path without query string for GET)
        *   `form_method`: "GET"
        *   `form_parameters`: `{"loginId": "getter", "pwdField": "getPass123", "_csrf": "gettoken"}`
        *   `request_headers`: Contains `Host`, `User-Agent`.
        *   `username_field_name`: "loginId"
        *   `password_field_name`: "pwdField"
        *   `csrf_token_name`: "_csrf"
        *   `csrf_token_value`: "gettoken"
        *   `cookies`: {}

4.  **Test Case: Request with Absolute URI in Request Line**
    *   **Input `raw_request`**:
        ```
        POST https://secure.example.com/submit/login HTTP/1.1
        Content-Type: application/x-www-form-urlencoded
        Host: ignored.if.absolute.uri.present

        user=absUser&pass=absPass
        ```
    *   **Expected Key Fields in Response (200 OK)**:
        *   `post_url`: "https://secure.example.com/submit/login"
        *   `form_method`: "POST"
        *   `form_parameters`: `{"user": "absUser", "pass": "absPass"}`
        *   `username_field_name`: "user"
        *   `password_field_name`: "pass"

5.  **Test Case: Malformed/Incomplete Raw Request**
    *   **Input `raw_request`**: `POST /login\nHost: test.com` (missing HTTP version, malformed headers)
    *   **Expected Server Response**: HTTP 400 Bad Request or 500 Internal Server Error with a JSON error message (e.g., "Malformed request line", "Could not parse request lines", or "An unexpected server error occurred..."). Check server logs for specific parsing errors.

6.  **Test Case: Request with Unsupported `Content-Type` and Body**
    *   **Input `raw_request`**:
        ```
        POST /upload HTTP/1.1
        Host: files.example.com
        Content-Type: image/png

        BINARY_DATA_HERE
        ```
    *   **Expected Key Fields in Response (200 OK, but with placeholder for params)**:
        *   `post_url`: "http://files.example.com/upload"
        *   `form_method`: "POST"
        *   `form_parameters`: `{"_unknown_content_type_body_": "BINARY_DATA_HERE..."}` (or similar, showing a snippet).
        *   `username_field_name`: "Could not auto-detect"
        *   `password_field_name`: "Could not auto-detect"

7.  **Test Case: `multipart/form-data` Request**
    *   **Input `raw_request`**: A simplified multipart request structure.
        ```
        POST /submit_multipart HTTP/1.1
        Host: example.com
        Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

        ------WebKitFormBoundary7MA4YWxkTrZu0gW
        Content-Disposition: form-data; name="text_field"

        some_text
        ------WebKitFormBoundary7MA4YWxkTrZu0gW--
        ```
    *   **Expected Key Fields in Response (200 OK)**:
        *   `post_url`: "http://example.com/submit_multipart"
        *   `form_method`: "POST"
        *   `form_parameters`: `{"_unsupported_multipart_body_": "Multipart body received, fields not automatically extracted."}`
        *   `username_field_name`: "Could not auto-detect"
        *   `password_field_name`: "Could not auto-detect"

8.  **Test Case: Empty `raw_request` String or Missing in Payload**
    *   **Input**: `{"raw_request": ""}` or `{}`
    *   **Expected Server Response**: HTTP 400 Bad Request with appropriate JSON error message.

## II. Frontend Testing (UI and JavaScript Interaction)

Manual browser testing to ensure the UI correctly handles the "Parse Captured Request" feature.

1.  **Successful Parse Workflow:**
    *   **Action**:
        1.  Open the application.
        2.  Paste a valid raw HTTP request (e.g., the form-urlencoded example from backend tests) into the `#raw-request-input` textarea.
        3.  Click the "Parse Captured Request" button (`#parseRawRequestBtn`).
    *   **Verification**:
        *   Button text changes to "Parsing..." and is disabled during API call.
        *   UI transitions to "Step 2: Review Parameters" (`#uiStep-AnalysisReview` becomes active).
        *   The `#capturedParamsDisplay` div becomes visible.
        *   The `#capturedParamsText` `<pre>` tag displays all parameters parsed by the backend (e.g., `JSON.stringify(data.form_parameters, null, 2)`).
        *   The input fields (`#detectedPostUrlInput`, `#detectedUsernameFieldInput`, `#detectedPasswordFieldInput`) are auto-filled with values derived by the backend's heuristics from the parsed request (`data.post_url`, `data.username_field_name`, `data.password_field_name`).
        *   `window.attackContext` is populated with `formMethod`, `csrfTokenName`, `csrfTokenValue`, `initialCookies` (from the parsed raw request's `Cookie` header), and `requestHeaders`.
        *   The "Proceed to Credentials" button is visible.

2.  **Error Handling (Frontend):**
    *   **Empty Textarea**:
        *   **Action**: Leave `#raw-request-input` empty and click "Parse Captured Request".
        *   **Expected**: `alert("Please paste the captured HTTP request text.")` is shown. UI remains on `#uiStep-TargetURL`. Button is re-enabled.
    *   **Backend Parsing Error**:
        *   **Action**: Paste a malformed raw request that will cause the backend `/parse_captured_request` to return an error (e.g., status 400 or 500 with JSON error). Click "Parse Captured Request".
        *   **Expected**: `alert()` shows the error message from the backend (e.g., "Failed to parse captured request: Malformed request line..."). UI remains on `#uiStep-TargetURL`. Button is re-enabled.
    *   **Network Error**:
        *   **Action**: Stop the Flask server. Try to parse a request.
        *   **Expected**: `alert()` like "Failed to parse captured request: Failed to fetch". UI remains on `#uiStep-TargetURL`.

3.  **Switching Between Analysis Methods:**
    *   **Action**:
        1.  Successfully parse a captured request. UI moves to "Analysis Review".
        2.  Manually navigate/trigger back to "Step 1: Target URL" (e.g., by refreshing or if a "back" button existed).
        3.  Enter a URL in `#login-url` and click "Analyze Form".
    *   **Verification**:
        *   The `#raw-request-input` textarea should be cleared (as per implemented UX improvement).
        *   The `#capturedParamsDisplay` section should be hidden.
        *   The analysis proceeds via URL, and the "Detected Form Parameters" are populated based on URL analysis results.
    *   **Action (Reverse)**:
        1.  Successfully analyze a URL. UI moves to "Analysis Review".
        2.  Go back to "Step 1: Target URL".
        3.  Paste a raw request and click "Parse Captured Request".
    *   **Verification**:
        *   The `#login-url` input field should be cleared.
        *   The analysis proceeds via raw request parsing, and `capturedParamsDisplay` is shown.

## III. Code Review Focus

*   **`server/app.py` (`/parse_captured_request` endpoint):**
    *   **Robustness of Parsing**: Check handling of different line endings (`\r\n`, `\n`), edge cases in header/body splitting, and empty lines.
    *   **`Content-Type` Handling**: Ensure `application/x-www-form-urlencoded` and `application/json` are correctly parsed. Verify graceful handling of `multipart/form-data` and other types.
    *   **URL Construction**: Validate logic for determining `scheme`, `host`, and `path` to form `post_url`, especially when `Host` header is missing or path is absolute.
    *   **Parameter Extraction**: Review how GET and POST parameters are extracted and combined.
    *   **Heuristics for Field Names/CSRF**: Confirm that `COMMON_..._FIELDS` lists are used for trying to identify username, password, and CSRF fields from the parsed `form_parameters` and `request_headers`.
    *   **Cookie Parsing**: Check that the `Cookie` header from the raw request is correctly parsed into the `cookies` dictionary in the response.
    *   **Error Propagation**: Ensure that parsing errors at different stages return informative 400 errors, and unexpected errors return a generic 500 error while logging details.

*   **`server/static/script.js`:**
    *   **DOM References**: All new elements (`rawRequestInput`, `parseRawRequestBtn`, `capturedParamsDisplay`, `capturedParamsText`) are correctly referenced.
    *   **`parseRawRequestBtn` Event Listener**:
        *   Correctly makes the API call to `/parse_captured_request`.
        *   Handles success: populates UI fields (`detectedPostUrlInput`, etc.), fills `capturedParamsText`, updates `window.attackContext` (including `formMethod`, CSRF details, `initialCookies` from parsed request, and `requestHeaders`).
        *   Handles errors from the API gracefully with alerts.
        *   Correctly transitions to `#uiStep-AnalysisReview` on success or stays on `#uiStep-TargetURL` on failure.
        *   Manages button disabled state and text.
    *   **UX for Switching Methods**: Verify that initiating one analysis method (URL vs. Raw Request) clears the input and results of the other method.

This testing strategy aims to ensure that the new feature for parsing captured requests is functional, robust, and integrates well with the existing application flow.
