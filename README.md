# Predator - Web Login Interface Analyzer & Credential Tester

**Predator** is a web-based tool designed to analyze login page structures and test credential lists against them. It features a Flask backend for analysis and testing operations, and a dynamic frontend for user interaction. This tool is intended for educational and authorized security testing purposes only.

## Features

*   **Client-Server Architecture**: Flask backend with a JavaScript/HTML frontend.
*   **Login URL Analysis**:
    *   Fetches the target login page.
    *   Automatically attempts to detect login form elements:
        *   Form POST URL.
        *   Username field name.
        *   Password field name.
        *   CSRF token name and value (basic detection).
    *   Retrieves initial cookies set by the target page.
*   **Credential Testing**:
    *   Accepts a single username/email.
    *   Accepts a password list file (`.txt` or `.csv`).
    *   Submits credentials to the detected POST URL using the appropriate form method.
    *   Uses heuristics to determine login success or failure based on response (status code, URL changes, error/success keywords, cookie changes).
    *   Provides a live feed of attempts and results.
    *   Displays metrics for total attempts and hits.
*   **User-Friendly Interface**: Interactive wizard-like steps for configuration and monitoring.
*   **Basic Security Considerations**: Password masking in the live feed (client-side).

## Architecture Overview

The application consists of two main parts:

1.  **Backend (Flask)**:
    *   Located in the `server/` directory.
    *   `app.py`: Contains the Flask application logic.
    *   **`/analyze_url` API endpoint**: Receives a target URL, fetches the page, parses it using BeautifulSoup, and attempts to identify login form parameters.
    *   **`/test_credentials` API endpoint**: Receives the target details (from `/analyze_url`), a username, and a list of passwords. It then attempts to log in by making requests to the target POST URL for each password.
    *   Serves the static frontend files.

2.  **Frontend (HTML, CSS, JavaScript)**:
    *   `server/templates/index.html`: The main HTML structure of the application.
    *   `server/static/style.css`: Styles for the application.
    *   `server/static/script.js`: Handles client-side logic, user interactions, API calls to the Flask backend, and dynamic UI updates.

## Setup and Installation

### Prerequisites

*   Python 3.7+
*   pip (Python package installer)
*   A modern web browser (e.g., Chrome, Firefox)

### Backend Setup

1.  **Clone the repository (if applicable) or ensure you have the project files.**
2.  **Navigate to the project's root directory.**
3.  **Install Python dependencies:**
    ```bash
    pip install -r server/requirements.txt
    ```
    This will install Flask, Requests, BeautifulSoup4, and python-dotenv.

## Running the Application

1.  **Navigate to the `server` directory:**
    ```bash
    cd server
    ```
2.  **Run the Flask development server:**
    ```bash
    python app.py
    ```
3.  The server will typically start on `http://127.0.0.1:5001`.
4.  **Open your web browser and go to `http://127.0.0.1:5001`** to access the Predator application.

## How to Use

The application guides you through a multi-step process:

**Step 1: Define Target and Credentials**

1.  **Username/Email**: Enter the single username or email you want to test.
2.  **Password List**: Click "Browse Password Files" to upload a `.txt` or `.csv` file containing one password per line. The selected file name will be displayed.
3.  **Login URL**: Enter the full URL of the login page you want to analyze (e.g., `https://example.com/login`).
4.  **Analyze Form**: Click the "Analyze Form" button.
    *   The application will send the URL to the backend for analysis.
    *   The "Detected Form Parameters" section will populate with the information found (Form POST URL, Username Field Name, Password Field Name). Review these carefully. You can manually edit them if the auto-detection is not perfect.

**Step 2: Confirm and Proceed (Initiate Testing)**

1.  Once you are satisfied with the detected (or manually adjusted) form parameters, click the "Confirm and Proceed" button.
2.  This will trigger the credential testing process. The UI will switch to the "Launch & Monitor" view (Step 3).

**Step 3: Launch & Monitor**

1.  **Live Feed**: This terminal-like view will show real-time (simulated on the client based on backend results) attempts:
    *   Each attempt will be timestamped.
    *   Status will be indicated as `INFO`, `SUCCESS`, or `FAIL`.
    *   Details about the attempt, including the username and masked password, will be shown.
2.  **Metrics HUD**:
    *   **TOTAL ATTEMPTS**: Shows the number of passwords tried.
    *   **HITS**: Shows the number of successful logins (based on the heuristic).
    *   *ELAPSED TIME and ETA are currently static placeholders.*

## Important Considerations/Limitations

*   **Ethical Use**: This tool is designed for educational purposes and for authorized security testing only. **Never use this tool against systems for which you do not have explicit, written permission.** Unauthorized access to computer systems is illegal.
*   **Heuristic Nature of Detection**:
    *   Login form and field detection (`/analyze_url`) uses basic heuristics and may not work on all websites, especially those with complex JavaScript-rendered forms or non-standard HTML structures. Manual adjustment of detected parameters may be necessary.
    *   Login success/failure detection (`/test_credentials`) is also heuristic-based (checking for redirects, error messages, success keywords). It is **not foolproof** and can result in false positives or false negatives. Complex login mechanisms, multi-factor authentication, or dynamic error reporting can confuse the heuristic.
*   **CSRF Tokens**: The tool attempts basic CSRF token detection. However, dynamic CSRF tokens that change with each request or require JavaScript interaction may not be handled correctly by the current version.
*   **CAPTCHA & Multi-Factor Authentication (MFA)**: This tool **cannot** bypass CAPTCHAs or MFA. If a login form is protected by these mechanisms, automated testing with this tool will likely fail or be blocked.
*   **Performance & Rate Limiting**: The tool currently makes requests sequentially from the backend. Aggressive testing can lead to IP blocking or account lockouts on the target system. There is no sophisticated rate limiting or proxy rotation built into this version. Use responsibly.
*   **Legal Responsibility**: Users are solely responsible for their actions when using this tool. The developers assume no liability and are not responsible for any misuse or damage caused by this program.
*   **Client-Side Simulation**: The actual HTTP requests for credential testing are performed by the backend server. The frontend simulates the live feed based on the results returned by the backend.

## Testing

For details on the testing strategy employed for this application, please refer to the [TESTING_STRATEGY.md](TESTING_STRATEGY.md) file.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details (if one were present in this project).
```

This README provides a comprehensive overview for users and developers.
