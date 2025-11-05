"""
Verification script for book recommendations setup.
Run this BEFORE starting the server to check everything is configured correctly.
"""

import os
import sys
import json
import requests

# Color codes for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_header(text):
    print(f"\n{BLUE}{'='*60}")
    print(f"{text}")
    print(f"{'='*60}{RESET}")

def check_file(path, required=False):
    """Check if a file exists."""
    abs_path = os.path.abspath(path)
    exists = os.path.exists(abs_path)
    
    if exists:
        print(f"{GREEN}✓{RESET} Found: {path}")
        print(f"  → {abs_path}")
        
        # If it's a JSON file, try to load it
        if path.endswith('.json'):
            try:
                with open(abs_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        print(f"  → Collections: {list(data.keys())}")
                        print(f"  → Total books: {sum(len(v) for v in data.values())}")
            except Exception as e:
                print(f"  {RED}✗{RESET} Failed to parse JSON: {e}")
        
        return True
    else:
        status = f"{RED}✗{RESET}" if required else f"{YELLOW}⚠{RESET}"
        print(f"{status} Not found: {path}")
        return False

def check_env_var(name, required=False):
    """Check if an environment variable is set."""
    value = os.getenv(name)
    
    if value:
        # Mask API keys for security
        display_value = value[:8] + "..." if len(value) > 8 else value
        print(f"{GREEN}✓{RESET} {name} = {display_value}")
        return True
    else:
        status = f"{RED}✗{RESET}" if required else f"{YELLOW}⚠{RESET}"
        print(f"{status} {name} not set")
        return False

def test_api_endpoint(url, name):
    """Test if an API endpoint is reachable."""
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            print(f"{GREEN}✓{RESET} {name} is reachable")
            return True
        else:
            print(f"{YELLOW}⚠{RESET} {name} returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"{RED}✗{RESET} {name} is not reachable (connection error)")
        return False
    except requests.exceptions.Timeout:
        print(f"{RED}✗{RESET} {name} timed out")
        return False
    except Exception as e:
        print(f"{RED}✗{RESET} {name} error: {e}")
        return False

def main():
    print_header("BOOK RECOMMENDATIONS - SETUP VERIFICATION")
    
    # Track overall status
    all_checks = []
    
    # Check 1: Server file exists
    print_header("1. SERVER FILES")
    all_checks.append(check_file("ai_server.py", required=True))
    all_checks.append(check_file("utils/recommendations/book_sources.py", required=True))
    all_checks.append(check_file("utils/recommendations/theme_extractor.py", required=True))
    all_checks.append(check_file("utils/recommendations/ranker.py", required=True))
    
    # Check 2: Curated collections
    print_header("2. CURATED COLLECTIONS")
    found_curated = False
    for path in [
        "utils/recommendations/data/curated_collections.json",
        "utils/recommendations/curated_collections.json",
        "data/curated_collections.json",
        "curated_collections.json"
    ]:
        if check_file(path):
            found_curated = True
            break
    
    all_checks.append(found_curated)
    
    if not found_curated:
        print(f"\n{YELLOW}⚠ TIP:{RESET} Create curated_collections.json at:")
        print("  utils/recommendations/data/curated_collections.json")
    
    # Check 3: Environment variables
    print_header("3. ENVIRONMENT VARIABLES")
    all_checks.append(check_env_var("DEEPSEEK_API_KEY", required=True))
    all_checks.append(check_env_var("DEEPSEEK_URL"))
    check_env_var("GOOGLE_BOOKS_API_KEY")  # Optional but recommended
    
    # Check 4: External services
    print_header("4. EXTERNAL SERVICES")
    
    print("Testing Session API...")
    all_checks.append(test_api_endpoint(
        "https://guidedcreativeplanning-session.onrender.com/health",
        "Session API"
    ))
    
    print("\nTesting Google Books API...")
    if os.getenv('GOOGLE_BOOKS_API_KEY'):
        try:
            response = requests.get(
                "https://www.googleapis.com/books/v1/volumes",
                params={'q': 'fantasy', 'key': os.getenv('GOOGLE_BOOKS_API_KEY'), 'maxResults': 1},
                timeout=5
            )
            if response.status_code == 200:
                print(f"{GREEN}✓{RESET} Google Books API is working")
            else:
                print(f"{YELLOW}⚠{RESET} Google Books API returned status {response.status_code}")
        except Exception as e:
            print(f"{RED}✗{RESET} Google Books API error: {e}")
    else:
        print(f"{YELLOW}⚠{RESET} Skipped (no API key)")
    
    # Check 5: Flask server
    print_header("5. FLASK SERVER")
    print("Testing if server is running...")
    server_running = test_api_endpoint("http://localhost:5000/health", "Flask Server")
    
    if not server_running:
        print(f"\n{YELLOW}ℹ{RESET} Server not running. To start:")
        print(f"  python ai_server.py")
    
    # Summary
    print_header("SUMMARY")
    passed = sum(all_checks)
    total = len(all_checks)
    
    if passed == total:
        print(f"{GREEN}✓ ALL CHECKS PASSED ({passed}/{total}){RESET}")
        print(f"\n{GREEN}Ready to start server:{RESET}")
        print(f"  python ai_server.py")
    elif passed >= total - 2:
        print(f"{YELLOW}⚠ MOSTLY READY ({passed}/{total}){RESET}")
        print(f"\nYou can start the server, but some features may not work:")
        print(f"  python ai_server.py")
    else:
        print(f"{RED}✗ SETUP INCOMPLETE ({passed}/{total}){RESET}")
        print(f"\nFix the issues above before starting the server.")
    
    print()

if __name__ == "__main__":
    main()