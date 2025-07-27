# Stryker - Advanced Security Suite

This document provides an overview of the backend functions and the template related to the "Start Attack" button in the Stryker application.

## Backend Functions

The following functions in `server/app.py` are involved in the process of launching a credential testing attack:

### `parse_auth_content(file_content_string)`

This function parses a string containing credentials (e.g., from an uploaded file). It can handle various formats, including `username:password`, `email:password`, and URLs with embedded credentials (e.g., `http://user:password@example.com:8080`). It returns a list of credential tuples.

### `discover_heuristics(...)`

This function is used to automatically discover heuristics for determining the success or failure of a login attempt. It works by making a baseline request to the login page and then a request with invalid credentials. By comparing the two responses, it can identify patterns that indicate a successful or failed login.

### `execute_login_attempt(...)`

This function executes a single login attempt. It takes the username, password, and other relevant information as input. It then makes a request to the login page with the provided credentials and analyzes the response to determine if the login was successful. The function returns a dictionary containing the result of the login attempt, including the status, details, and an analysis summary.

### `test_credentials_stream()`

This is the main endpoint for launching a credential testing attack. It receives the target URL, credential lists, and other configuration options from the frontend. It then uses a thread pool to execute multiple login attempts in parallel. The results of each attempt are streamed back to the frontend in real-time.

## Template

The `server/templates/index.html` file contains the HTML code for the user interface. The "Start Attack" button is located in the "Step 4: Launch & Monitor" section. When the user clicks this button, the `handleLaunchAttack` function in `server/static/script.js` is called. This function gathers all the necessary information from the UI and sends it to the `/test_credentials_stream` endpoint to start the attack. The results of the attack are then displayed in the "Live Feed" table.
