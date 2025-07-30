# Web UI Features

This document explains the features of the Stryker Web UI.

## Live Feed and Result Flagging

As login attempts are made during an attack, the results are streamed to the "Live Feed" table in real-time. Each row in this table represents a single login attempt.

### Action Buttons

For each result, there are three action buttons:

*   **View**: Click this button to see a modal with detailed information about the request and response for that specific attempt.
*   **False Positive**: Click this button if a result is incorrectly marked as a "success". This will re-classify the result as a "False Positive".
*   **False Negative**: Click this button if a result is incorrectly marked as a "failure". This will re-classify the result as a "False Negative".

### Automatic Group Flagging

When you click "False Positive" or "False Negative" on a result, the application will automatically find all other results in the table that have the *exact same response body* and apply the same flag to them. This allows you to quickly classify large groups of similar results with a single click.

### Filtering

You can use the filter buttons above the table ("All", "Success", "Failure", etc.) to see the results you have flagged. For example, after flagging results, you can click the "False Positive" filter to see all the results you have classified as such.
