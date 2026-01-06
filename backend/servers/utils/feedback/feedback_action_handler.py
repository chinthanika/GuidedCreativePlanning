# utils/feedback/feedback_action_handler.py

import requests
import logging
import os

rec_logger = logging.getLogger("FEEDBACK")



# Default to localhost, allow environment override
# PROFILE_MANAGER_URL = os.environ.get(
#     "PROFILE_MANAGER_URL", 
#     "http://localhost:5001"
# )

PROFILE_MANAGER_URL = "https://guidedcreativeplanning-pfm.onrender.com"

def handle_feedback_action(action, user_id, story_id):
    """
    Handle feedback actions (get_info, query).
    """
    action_type = action.get('action')
    data = action.get('data', {})
    
    if action_type == 'get_info':
        return _handle_get_info(data, user_id, story_id)
    
    elif action_type == 'query':
        return _handle_query(data, user_id, story_id)
    
    else:
        return {'error': f'Unknown action type: {action_type}'}

def _normalize_to_items(json_data):
    """
    Helper: Converts response to an iterable of (id, data) tuples
    regardless of whether the API returned a List or a Dict.
    """
    if isinstance(json_data, list):
        # If it's a list, assume the ID is inside the object
        normalized = []
        for item in json_data:
            # Try to find common ID fields
            item_id = item.get('id') or item.get('firebaseKey') or 'unknown_id'
            normalized.append((item_id, item))
        return normalized
    elif isinstance(json_data, dict):
        # If it's a dict, use .items()
        return json_data.items()
    else:
        rec_logger.warning(f"Unexpected data format: {type(json_data)}")
        return []

def _handle_get_info(data, user_id, story_id):
    info_type = data.get('type')
    filters = data.get('filters', {})
    
    try:
        # ================= NODES =================
        if info_type == 'nodes':
            response = requests.get(
                f"{PROFILE_MANAGER_URL}/api/nodes",
                params={'userId': user_id},
                timeout=10
            )
            
            if response.status_code != 200:
                rec_logger.error(f"[GET_INFO] Nodes fetch failed: {response.status_code}")
                return {'error': 'Failed to fetch entities', 'nodes': []}
            
            raw_data = response.json()
            
            # Use the helper to handle List vs Dict
            items_iter = _normalize_to_items(raw_data)
            
            filtered = []
            for node_id, node_data in items_iter:
                if isinstance(node_data, dict):
                    # Filter by type if specified
                    if 'type' in filters and node_data.get('type') != filters['type']:
                        continue
                    
                    # Ensure ID is in the object
                    if 'id' not in node_data:
                        node_data['id'] = node_id
                        
                    filtered.append(node_data)
            
            rec_logger.info(f"[GET_INFO] Fetched {len(filtered)} nodes")
            return {'nodes': filtered, 'count': len(filtered)}
        
        # ================= LINKS =================
        elif info_type == 'links':
            response = requests.get(
                f"{PROFILE_MANAGER_URL}/api/links",
                params={'userId': user_id},
                timeout=10
            )
            
            if response.status_code != 200:
                return {'error': 'Failed to fetch relationships', 'links': []}
            
            raw_data = response.json()
            items_iter = _normalize_to_items(raw_data)
            
            filtered = []
            for link_id, link_data in items_iter:
                if isinstance(link_data, dict):
                    if 'id' not in link_data:
                        link_data['id'] = link_id
                    filtered.append(link_data)
            
            return {'links': filtered, 'count': len(filtered)}
        
        # ================= EVENTS =================
        elif info_type == 'events':
            response = requests.get(
                f"{PROFILE_MANAGER_URL}/api/events",
                params={'userId': user_id},
                timeout=10
            )
            
            if response.status_code != 200:
                return {'error': 'Failed to fetch events', 'events': []}
            
            raw_data = response.json()
            items_iter = _normalize_to_items(raw_data)
            
            filtered = []
            for event_id, event_data in items_iter:
                if isinstance(event_data, dict):
                    if 'id' not in event_data:
                        event_data['id'] = event_id
                    
                    # Optional: Check storyId
                    if not event_data.get('storyId') or event_data.get('storyId') == story_id:
                        filtered.append(event_data)
            
            # Sort by order
            filtered.sort(key=lambda e: e.get('order', 0))
            return {'events': filtered, 'count': len(filtered)}
        
        # ================= WORLDBUILDING =================
        elif info_type == 'worldbuilding':
            category = data.get('category', 'magicSystems')
            
            # Note: Using /api/world/items as the endpoint
            response = requests.get(
                f"{PROFILE_MANAGER_URL}/api/world/items",
                params={'userId': user_id},
                timeout=10
            )
            
            if response.status_code != 200:
                return {'error': f'Failed to fetch {category}', 'items': []}
            
            raw_data = response.json()
            items_iter = _normalize_to_items(raw_data)
            
            filtered = []
            for item_id, item_data in items_iter:
                if isinstance(item_data, dict):
                    # Basic check if it belongs to the category requested
                    # (Adjust this logic if your world items have specific 'type' fields matching category)
                    if 'id' not in item_data:
                        item_data['id'] = item_id
                    filtered.append(item_data)
            
            return {
                'category': category,
                'items': filtered,
                'count': len(filtered)
            }
        
        else:
            return {'error': f'Unknown info type: {info_type}'}
    
    except requests.exceptions.ConnectionError:
        rec_logger.error(f"[GET_INFO] Connection refused to {PROFILE_MANAGER_URL}")
        return {'error': 'Profile Manager Service is offline or unreachable'}
    except Exception as e:
        rec_logger.exception(f"[GET_INFO] Error: {e}")
        return {'error': str(e)}

def _handle_query(data, user_id, story_id):
    query_type = data.get('type', 'nodes')
    search_term = data.get('searchTerm', '').lower()
    
    if not search_term:
        return {'error': 'searchTerm required for query'}
    
    # Reuse the robust logic above
    result = _handle_get_info({'type': query_type}, user_id, story_id)
    
    if 'error' in result:
        return result
        
    items = result.get(query_type, result.get('items', []))
    matches = []
    
    for item in items:
        # Stringify the whole item to search in all fields
        s_item = str(item).lower()
        if search_term in s_item:
            matches.append(item)
            
    return {'matches': matches, 'count': len(matches), 'searchTerm': search_term}