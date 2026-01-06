def _build_context_summary(story_context):
    """
    Build a concise summary of story context for AI prompt.
    """
    summary_parts = []
    
    # Characters
    entities = story_context.get('entities', [])
    characters = [e for e in entities if e.get('type') == 'character']
    
    if characters:
        summary_parts.append("CHARACTERS:")
        for char in characters[:10]:  # Limit to 10 most important
            name = char.get('label', 'Unnamed')
            attributes = char.get('attributes', {})
            
            char_info = [f"- {name}"]
            
            if attributes.get('role'):
                char_info.append(f"role: {attributes['role']}")
            
            if attributes.get('traits'):
                traits = attributes['traits']
                if isinstance(traits, list):
                    char_info.append(f"traits: {', '.join(traits[:3])}")
                elif isinstance(traits, str):
                    char_info.append(f"traits: {traits}")
            
            if attributes.get('goal'):
                char_info.append(f"goal: {attributes['goal']}")
            
            summary_parts.append(' '.join(char_info))
    
    # Locations
    locations = [e for e in entities if e.get('type') == 'location']
    
    if locations:
        summary_parts.append("\nLOCATIONS:")
        for loc in locations[:10]:
            name = loc.get('label', 'Unnamed')
            desc = loc.get('attributes', {}).get('description', '')
            
            if desc:
                summary_parts.append(f"- {name}: {desc[:100]}")
            else:
                summary_parts.append(f"- {name}")
    
    # Events (Timeline)
    events = story_context.get('events', [])
    
    if events:
        summary_parts.append("\nKEY EVENTS (Timeline):")
        sorted_events = sorted(events, key=lambda e: e.get('order', 0))
        
        for event in sorted_events[:10]:
            title = event.get('title', 'Untitled')
            order = event.get('order', '?')
            summary_parts.append(f"- [{order}] {title}")
    
    # Relationships
    relationships = story_context.get('relationships', [])
    
    if relationships:
        summary_parts.append("\nRELATIONSHIPS:")
        for rel in relationships[:10]:
            source = rel.get('source', 'Unknown')
            target = rel.get('target', 'Unknown')
            rel_type = rel.get('label', 'connected to')
            
            summary_parts.append(f"- {source} {rel_type} {target}")
    
    # World-building
    worldbuilding = story_context.get('worldbuilding', {})
    
    for category, items in worldbuilding.items():
        if items:
            summary_parts.append(f"\n{category.upper()}:")
            for item in items[:5]:
                name = item.get('name', 'Unnamed')
                rules = item.get('fields', {}).get('rules', '')
                
                if rules:
                    summary_parts.append(f"- {name}: {rules[:100]}")
                else:
                    summary_parts.append(f"- {name}")
    
    # If no context available
    if not summary_parts:
        return "No story context available. Focus on general writing quality."
    
    return '\n'.join(summary_parts)


def _validate_feedback(feedback_data):
    """
    Validate feedback structure matches expected format.
    """
    required_fields = ['overallScore', 'topPriority', 'categories']
    
    for field in required_fields:
        if field not in feedback_data:
            return False
    
    # Validate categories
    categories = feedback_data.get('categories', [])
    
    if not isinstance(categories, list) or len(categories) != 5:
        return False
    
    required_category_fields = ['name', 'icon', 'score', 'strength', 'suggestion']
    
    for cat in categories:
        for field in required_category_fields:
            if field not in cat:
                return False
        
        # Validate score range
        if not isinstance(cat['score'], (int, float)) or cat['score'] < 1 or cat['score'] > 10:
            return False
    
    # Validate overall score
    if not isinstance(feedback_data['overallScore'], (int, float)) or \
       feedback_data['overallScore'] < 1 or feedback_data['overallScore'] > 10:
        return False
    
    return True