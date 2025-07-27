# Batch Processing Fix for Large Credential Files
# This fixes the "No attempts processed or all filtered out" error

def process_credentials_in_batches(source_usernames, source_passwords, batch_size=50):
    """
    Process credentials in smaller batches to avoid memory issues and timeouts.

    Args:
        source_usernames: List of usernames
        source_passwords: List of passwords
        batch_size: Number of credentials to process per batch (default: 50)

    Returns:
        Generator yielding batches of (usernames, passwords) tuples
    """
    num_pairs = min(len(source_usernames), len(source_passwords))

    for i in range(0, num_pairs, batch_size):
        end_idx = min(i + batch_size, num_pairs)
        batch_usernames = source_usernames[i:end_idx]
        batch_passwords = source_passwords[i:end_idx]
        yield batch_usernames, batch_passwords, i, end_idx, num_pairs

def create_batched_event_stream(source_usernames, source_passwords, target_post_url,
                               username_field_name, password_field_name, form_method,
                               initial_cookies, final_config, csrf_token, batch_size=50):
    """
    Create an event stream that processes credentials in batches.
    """
    import json
    from concurrent.futures import ThreadPoolExecutor, as_completed

    num_pairs_to_test = min(len(source_usernames), len(source_passwords))

    # Send initial info
    initial_info = {
        "type": "info",
        "total_expected_attempts": num_pairs_to_test,
        "message": f"Test run initiated. Processing {num_pairs_to_test} credentials in batches of {batch_size}."
    }
    yield f"data: {json.dumps(initial_info)}\n\n"

    processed_count = 0

    # Process in batches
    for batch_usernames, batch_passwords, start_idx, end_idx, total in process_credentials_in_batches(
        source_usernames, source_passwords, batch_size):

        batch_info = {
            "type": "batch_info",
            "message": f"Processing batch {start_idx+1}-{end_idx} of {total} credentials..."
        }
        yield f"data: {json.dumps(batch_info)}\n\n"

        # Process current batch with ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for i in range(len(batch_usernames)):
                future = executor.submit(
                    execute_login_attempt,
                    batch_usernames[i],
                    batch_passwords[i],
                    target_post_url,
                    username_field_name,
                    password_field_name,
                    form_method,
                    initial_cookies,
                    final_config,
                    csrf_token
                )
                futures.append(future)

            # Collect results from current batch
            for future in as_completed(futures):
                try:
                    result = future.result()
                    processed_count += 1

                    # Add progress information
                    result["progress"] = {
                        "processed": processed_count,
                        "total": num_pairs_to_test,
                        "percentage": round((processed_count / num_pairs_to_test) * 100, 1)
                    }

                    yield f"data: {json.dumps(result)}\n\n"
                except Exception as e:
                    error_result = {
                        "username": "unknown",
                        "password_actual": "unknown",
                        "status": "error",
                        "details": f"Batch processing error: {str(e)}",
                        "progress": {
                            "processed": processed_count,
                            "total": num_pairs_to_test,
                            "percentage": round((processed_count / num_pairs_to_test) * 100, 1)
                        }
                    }
                    yield f"data: {json.dumps(error_result)}\n\n"

        # Small delay between batches to prevent overwhelming the target
        import time
        time.sleep(0.5)

    # Send completion event
    completion_event = {
        'status': 'complete',
        'message': f'All {processed_count} credential tests finished.',
        'total_processed': processed_count
    }
    yield f"data: {json.dumps(completion_event)}\n\n"

# Configuration for batch processing
RECOMMENDED_BATCH_SIZE = 50  # Based on systematic testing best practices
MAX_BATCH_SIZE = 100  # Maximum batch size to prevent memory issues
MIN_BATCH_SIZE = 10   # Minimum batch size for efficiency

def calculate_optimal_batch_size(total_credentials):
    """
    Calculate optimal batch size based on total number of credentials.
    """
    if total_credentials <= 100:
        return total_credentials  # Process all at once for small files
    elif total_credentials <= 1000:
        return 50  # Standard batch size
    elif total_credentials <= 5000:
        return 50  # Keep standard size for medium files
    else:
        return 25  # Smaller batches for very large files
