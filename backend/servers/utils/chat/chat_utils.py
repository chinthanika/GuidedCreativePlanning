import re
import json
import markdown
import hashlib
import time
import requests
import os
import logging
from logging.handlers import RotatingFileHandler

# ============================================
# API KEYS & CONFIG
# ============================================
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "sk-6df74184292c4ecc830f3d916cdb3592")
LEONARDO_API_KEY = os.getenv("LEONARDO_API_KEY", "ff99362e-8a7e-4776-b03a-aed92b7ada51")
PROFILE_MANAGER_URL = os.getenv("PROFILE_MANAGER_URL", "https://guidedcreativeplanning-pfm.onrender.com/api")
DEEPSEEK_URL = "https://api.deepseek.com" 

# ============================================
# CONSTANTS
# ============================================
MAX_DEPTH = 5
KEEP_LAST_N = 5 

# ============================================
# LOGGING
# ============================================
os.makedirs("logs", exist_ok=True)
log_file = "logs/chat_utils_debug.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(rotating_handler)

# ============================================
# MARKDOWN & PARSING UTILITIES
# ============================================
def parse_markdown(md_text, output="text"):
    logger.debug(f"Parsing markdown. Output format: {output}")
    if not md_text:
        logger.debug("Empty markdown string provided.")
        return ""
    if output == "html":
        result = markdown.markdown(md_text)
        logger.debug("Markdown parsed to HTML.")
        return result
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md_text)
    text = re.sub(r"(\*\*|\*|__|_)(.*?)\1", r"\2", text)
    text = re.sub(r"#+\s*(.*)", r"\1", text)
    text = re.sub(r"^\s*[-*]\s+", "- ", text, flags=re.MULTILINE)
    text = re.sub(r"\n{2,}", "\n", text)
    logger.debug("Markdown parsed to plain text.")
    return text.strip()

def parse_deepseek_json(raw):
    logger.debug(f"Parsing DeepSeek raw response:\n{raw[:300]}...")
    matches = re.findall(r'```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```', raw, re.DOTALL)
    results = []

    def ensure_list(parsed):
        if isinstance(parsed, list):
            return parsed
        return [parsed]

    if matches:
        logger.debug(f"Found {len(matches)} JSON block(s) in fenced code format.")
        for m in matches:
            try:
                parsed = json.loads(m)
                results.extend(ensure_list(parsed))
                logger.debug(f"Parsed JSON block: {parsed}")
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse JSON block: {e}")
    else:
        try:
            parsed = json.loads(raw)
            results.extend(ensure_list(parsed))
            logger.debug("Parsed raw string as JSON successfully.")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse DeepSeek raw string as JSON: {e}")

            if raw.strip().startswith("{") and "},\n{" in raw:
                try:
                    wrapped = f"[{raw}]"
                    parsed = json.loads(wrapped)
                    results.extend(ensure_list(parsed))
                    logger.debug("Recovered by wrapping multiple objects into array.")
                except Exception as e2:
                    logger.error(f"Failed recovery (wrap into array): {e2}")

            if not results:
                parts = re.split(r'}\s*,\s*{', raw)
                if len(parts) > 1:
                    try:
                        fixed = []
                        for i, p in enumerate(parts):
                            if not p.startswith("{"):
                                p = "{" + p
                            if not p.endswith("}"):
                                p = p + "}"
                            fixed.append(json.loads(p))
                        results.extend(fixed)
                        logger.debug(f"Recovered by splitting into {len(fixed)} objects.")
                    except Exception as e3:
                        logger.error(f"Failed recovery (split objects): {e3}")

    return results

def normalize_deepseek_response(parsed):
    logger.debug(f"Normalizing DeepSeek response: {parsed}")
    if isinstance(parsed, dict):
        return [parsed]
    if isinstance(parsed, list):
        flat = []
        for item in parsed:
            if isinstance(item, list):
                flat.extend(normalize_deepseek_response(item))
            else:
                flat.append(item)
        return flat
    fallback = [{"action": "respond", "data": {"message": str(parsed)}}]
    logger.warning("Parsed DeepSeek response not dict/list, falling back to respond.")
    return fallback

def generate_entity_id(name):
    logger.debug(f"Generating entity ID for: {name}")
    return hashlib.sha256(name.encode("utf-8")).hexdigest()

# ============================================
# PROFILE MANAGER FETCH UTILITIES
# ============================================
def fetch_profile_data_batch(requests_list, user_id):
    if not requests_list:
        return []
    
    logger.debug(f"[BATCH] Attempting batch fetch for {len(requests_list)} requests")
    batch_start = time.time()
    
    try:
        batch_payload = {
            "userId": user_id,
            "requests": requests_list
        }
        
        response = requests.post(
            f"{PROFILE_MANAGER_URL}/batch",
            json=batch_payload,
            timeout=15.0
        )
        response.raise_for_status()
        
        batch_data = response.json()
        batch_time = time.time() - batch_start
        logger.info(f"[TIMING] Batch fetch took {batch_time:.3f}s for {len(requests_list)} requests")
        
        results = batch_data.get("results", [])
        
        if len(results) != len(requests_list):
            logger.warning(f"[BATCH] Result count mismatch: expected {len(requests_list)}, got {len(results)}")
        
        profile_data = []
        for i, req in enumerate(requests_list):
            if i < len(results):
                result = results[i]
                profile_data.append({
                    "request": req,
                    "data": result.get("data") if "data" in result else {"error": result.get("error")}
                })
            else:
                profile_data.append({
                    "request": req,
                    "data": {"error": "No result returned"}
                })
        
        return profile_data
        
    except requests.Timeout:
        logger.warning(f"[BATCH] Batch request timed out, falling back to sequential")
        return fetch_profile_data_sequential(requests_list, user_id)
        
    except requests.HTTPError as e:
        logger.warning(f"[BATCH] Batch request failed with HTTP {e.response.status_code}, falling back to sequential")
        return fetch_profile_data_sequential(requests_list, user_id)
        
    except Exception as e:
        logger.exception(f"[BATCH] Batch request failed: {e}, falling back to sequential")
        return fetch_profile_data_sequential(requests_list, user_id)

def fetch_profile_data_sequential(requests_list, user_id):
    logger.debug(f"[SEQUENTIAL] Fetching {len(requests_list)} requests sequentially")
    sequential_start = time.time()
    
    profile_data = []
    for req in requests_list:
        try:
            data = fetch_profile_data(req, user_id)
            profile_data.append({"request": req, "data": data})
        except Exception as e:
            logger.error(f"[SEQUENTIAL] Request failed: {e}")
            profile_data.append({"request": req, "data": {"error": str(e)}})
    
    sequential_time = time.time() - sequential_start
    logger.info(f"[TIMING] Sequential fetch took {sequential_time:.3f}s for {len(requests_list)} requests")
    
    return profile_data

def fetch_profile_data(req_obj, user_id):
    logger.debug(f"Fetching profile data for user {user_id} with request: {req_obj}")
    
    target = req_obj.get("target")
    payload = req_obj.get("payload", {})
    filters = payload.get("filters", {})
    entity_id = req_obj.get("entity_id")

    if target == "worldbuilding":
        category = filters.get("category")
        if not category:
            return {"error": "worldbuilding target requires 'category' filter"}
        
        valid_categories = ["magicSystems", "cultures", "locations", 
                          "technology", "history", "organizations"]
        if category not in valid_categories:
            return {
                "error": f"Invalid category '{category}'. Must be one of: {', '.join(valid_categories)}"
            }

        url = f"{PROFILE_MANAGER_URL}/worldbuilding/{category}"
        
        params = {"userId": user_id}
        if filters.get("name"):
            params["name"] = filters["name"]
        if "parentKey" in filters:
            params["parentKey"] = filters["parentKey"]
        
        try:
            logger.debug(f"Fetching world-building: {url} with params {params}")
            resp = requests.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            logger.debug(f"World-building response: {len(data) if isinstance(data, dict) else 'N/A'} items")
            return data or {"data": {}}
        
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                return {"data": {}}
            error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"World-building fetch failed: {error_msg}")
            return {"error": error_msg}
        
        except Exception as e:
            logger.exception(f"Error fetching world-building: {e}")
            return {"error": str(e)}
    
    if target == "nodes":
        url = f"{PROFILE_MANAGER_URL}/nodes/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/nodes"
    elif target == "links":
        url = f"{PROFILE_MANAGER_URL}/links/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/links"
    elif target == "events":
        url = f"{PROFILE_MANAGER_URL}/events/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/events"
    elif target == "pending_changes":
        url = f"{PROFILE_MANAGER_URL}/pending-changes"
    else:
        error_msg = f"Unknown target type: {target}"
        logger.error(error_msg)
        return {"error": error_msg}

    try:
        logger.debug(f"Sending GET request to Profile Manager: {url} with filters {filters}")
        resp = requests.get(url, params={"userId": user_id, **filters})
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "error" in data:
            logger.warning(f"Profile Manager returned error: {data['error']}")
            return {"error": data["error"]}
        logger.debug(f"Profile Manager response: {data}")
        return data or {"data": []}
    except requests.HTTPError as e:
        if e.response.status_code == 404:
            logger.warning("Profile Manager returned 404: No data found.")
            return {"data": []}
        logger.error(f"HTTPError fetching profile data: {e}")
        return {"error": str(e)}
    except Exception as e:
        logger.exception(f"Unexpected error fetching profile data: {e}")
        return {"error": str(e)}

# ============================================
# STAGING UTILITIES
# ============================================
def process_node_request(req_obj, user_id):
    logger.debug(f"[STAGING] process_node_request called")
    node = req_obj["newData"]

    if not node.get("label"):
        if node.get("identifier"):
            node["label"] = node["identifier"]
        else:
            return {"error": "Node requires label or identifier"}

    node["entity_id"] = generate_entity_id(node["label"])

    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "label": node["label"],
        "entityType": "node",
        "entityId": node["entity_id"],
        "newData": node
    })
    return resp.json()

def process_link_request(req_obj, user_id):
    logger.debug(f"[STAGING] process_link_request called")
    link = req_obj["newData"]

    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "entityType": "link",
        "entityId": None,
        "newData": {
            "node1": link["node1"],
            "node2": link["node2"],
            "type": link["type"],
            "context": link.get("context", "")
        }
    })
    return resp.json()

def process_event_request(req_obj, user_id):
    logger.debug(f"[STAGING] process_event_request called")
    event = req_obj["newData"]
    event["entity_id"] = generate_entity_id(event["title"])

    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "entityType": "event",
        "entityId": event["entity_id"],
        "newData": event
    })
    return resp.json()

def process_worldbuilding_request(req_obj, user_id, etype):
    logger.debug(f"[STAGING] process_worldbuilding_request called")

    if not etype or not etype.startswith("worldBuilding-"):
        return {"error": f"Invalid world-building entityType: {etype}"}
    
    category = etype.replace("worldBuilding-", "")
    
    valid_categories = ["magicSystems", "cultures", "locations", 
                       "technology", "history", "organizations"]
    if category not in valid_categories:
        return {"error": f"Invalid category: {category}"}
    
    try:
        staging_resp = requests.post(
            f"{PROFILE_MANAGER_URL}/stage-change",
            json={
                "userId": user_id,
                "entityType": etype,
                "entityId": req_obj.get("entityId"),
                "newData": req_obj["newData"]
            },
            timeout=10.0
        )
        staging_resp.raise_for_status()
        return staging_resp.json()
        
    except requests.HTTPError as e:
        error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
        logger.error(f"[STAGING] World-building staging failed: {error_msg}")
        return {"error": error_msg}
    except Exception as e:
        logger.exception(f"[STAGING] World-building staging exception: {e}")
        return {"error": str(e)}