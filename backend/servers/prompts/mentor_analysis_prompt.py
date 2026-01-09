"""
Mentor text analysis prompt system.
Pedagogically-grounded analysis following educational frameworks.
"""

# System prompt for mentor text analysis
MENTOR_TEXT_ANALYSIS_SYSTEM_PROMPT = """You are a creative writing teacher analyzing published story excerpts using established educational frameworks.

Your analysis follows these pedagogical principles:
1. **Notice & Name (Ray, 1999)**: Identify specific, teachable techniques with clear labels
2. **Genre Pedagogy (Martin & Rose, 2008)**: Connect techniques to genre conventions
3. **Six Traits Framework (Spandel, 2012)**: Categorize by craft element (ideas, organization, voice, word choice, sentence fluency, conventions)
4. **Bloom's Taxonomy (Revised)**: Target Apply/Analyze/Evaluate cognitive levels in student prompts
5. **Cognitive Apprenticeship (Collins et al., 1989)**: Make expert thinking visible

For each teaching point, provide:

1. **Technique Name** (3-6 words): Clear, memorable label students can recall and apply

2. **Trait Category**: One of: ideas | organization | voice | word_choice | sentence_fluency | conventions

3. **What the Author Does** (2-3 sentences): Describe the specific craft choice with a brief quoted example (5-10 words maximum). Be precise, not generic. Reference exact passages.

4. **How It Works** (2-3 sentences): Explain the MECHANISM, not just the effect. Show the craft decision and its impact on reader experience. Make expert thinking visible.

5. **Why It Matters** (1-2 sentences): Connect to reader psychology, story goals, or genre function. What does this technique accomplish that matters to storytelling?

6. **Genre Convention** (1-2 sentences or null): Cite specific genre patterns or published examples if applicable (e.g., "Christie uses this in Poirot novels" or "Common fantasy convention since Tolkien"). Use null if technique is genre-agnostic.

7. **Student Application** (3-4 sentences): Provide concrete, scaffolded instruction contextualized to the student's genre/focus. Don't say "try this"—give a specific example with their story context. Should be doable in their next writing session.

8. **Bloom's Level**: apply | analyze | evaluate (the cognitive level required by your student application prompt)

Quality Standards:
- SPECIFIC over generic: "uses three-word sentences" not "creates tension"
- MECHANISM over effect: "short sentences speed pacing by mimicking rapid heartbeat" not "short sentences are exciting"
- QUOTE MINIMALLY: 5-10 words maximum per example, focus on analysis
- CONTEXTUALIZE applications: Reference student's genre/focus explicitly
- HIGHER-ORDER thinking: Target Apply/Analyze/Evaluate, not Remember/Understand
- AVOID jargon: Explain in accessible language (high school level)
- NO COPYRIGHT VIOLATIONS: Never reproduce full sentences, use brief phrases only

Output JSON format:
{
  "genreIdentified": "string",
  "teachingPoints": [
    {
      "techniqueName": "string",
      "traitCategory": "string",
      "whatAuthorDoes": "string",
      "howItWorks": "string",
      "whyItMatters": "string",
      "genreConvention": "string or null",
      "studentApplication": "string",
      "bloomsLevel": "string"
    }
  ],
  "overallLesson": "string (1-2 sentences)",
  "relatedTechniques": ["string"],
  "pedagogicalRationale": "string (2-3 sentences explaining why these techniques were prioritized)"
}

Identify 3-5 teaching points. Prioritize techniques that are:
- Transferable to student writing
- Specific to the excerpt (not generic advice)
- Appropriate for the focus area
- Demonstrating genre conventions when applicable"""


def build_mentor_analysis_user_prompt(excerpt: str, genre: str = "general fiction", focus: str = "general") -> str:
    """
    Build user prompt for mentor text analysis.
    
    Args:
        excerpt: The story excerpt to analyze (100-6000 chars)
        genre: Story genre for genre-specific analysis
        focus: What aspect to focus on (general, character_development, plot_structure, etc.)
        
    Returns:
        Formatted user prompt
    """
    # Focus area descriptions for context
    focus_descriptions = {
        'general': 'overall craft and technique',
        'character_development': 'how characters are revealed, developed, and arc',
        'plot_structure': 'narrative structure, pacing, and story beats',
        'worldbuilding': 'how setting, culture, and rules are established',
        'dialogue': 'how conversation reveals character and advances plot',
        'pacing': 'rhythm, tension building, and narrative momentum',
        'description': 'sensory detail, imagery, and scene-setting',
        'theme': 'how meaning and deeper ideas are woven in',
        'voice': 'narrative style, tone, and author\'s unique approach',
        'opening': 'how the story hooks readers in the first paragraph/page',
        'conflict': 'how tension and opposition drive the narrative'
    }
    
    focus_desc = focus_descriptions.get(focus, 'general writing craft')
    
    # Build analysis context
    prompt = f"""Excerpt to Analyze:
{excerpt}

Analysis Context:
- Genre: {genre}
- Focus Area: {focus_desc}
- Student Level: High school to early college (ages 15-22)

Analyze this excerpt and generate 3-5 teaching points focused on {focus_desc}. 
{f'Prioritize techniques specific to {genre} genre conventions.' if genre != 'general fiction' else 'Consider general fiction craft principles.'}

Output JSON only."""
    
    return prompt


def validate_analysis_output(analysis: dict, excerpt: str) -> dict:
    """
    Validate analysis output against pedagogical standards.
    Returns validation results with issues flagged.
    
    Args:
        analysis: The AI-generated analysis JSON
        excerpt: Original excerpt for reference
        
    Returns:
        Dict with validation results
    """
    issues = []
    warnings = []
    
    # Check structure
    required_fields = ['genreIdentified', 'teachingPoints', 'overallLesson', 'pedagogicalRationale']
    for field in required_fields:
        if field not in analysis:
            issues.append(f"Missing required field: {field}")
    
    # Check teaching points
    teaching_points = analysis.get('teachingPoints', [])
    
    if len(teaching_points) < 3:
        warnings.append(f"Only {len(teaching_points)} teaching points (recommend 3-5)")
    
    if len(teaching_points) > 5:
        warnings.append(f"{len(teaching_points)} teaching points (may be overwhelming, recommend 3-5)")
    
    for idx, point in enumerate(teaching_points, 1):
        point_id = f"Point {idx} ({point.get('techniqueName', 'unnamed')})"
        
        # Check required fields
        required_point_fields = [
            'techniqueName', 'traitCategory', 'whatAuthorDoes', 
            'howItWorks', 'whyItMatters', 'studentApplication', 'bloomsLevel'
        ]
        
        for field in required_point_fields:
            if field not in point or not point[field]:
                issues.append(f"{point_id}: Missing '{field}'")
        
        # Check trait category validity
        valid_traits = ['ideas', 'organization', 'voice', 'word_choice', 'sentence_fluency', 'conventions']
        if point.get('traitCategory') not in valid_traits:
            issues.append(f"{point_id}: Invalid traitCategory '{point.get('traitCategory')}' (must be one of {valid_traits})")
        
        # Check Bloom's level validity
        valid_blooms = ['apply', 'analyze', 'evaluate', 'create']
        if point.get('bloomsLevel') not in valid_blooms:
            warnings.append(f"{point_id}: Bloom's level '{point.get('bloomsLevel')}' should be {valid_blooms}")
        
        # Copyright check: Look for excessive quoting
        what_author_does = point.get('whatAuthorDoes', '')
        quote_count = what_author_does.count('"') + what_author_does.count("'")
        
        if quote_count > 4:  # More than 2 quoted phrases
            warnings.append(f"{point_id}: May be over-quoting (found {quote_count // 2} quoted phrases)")
        
        # Check for quoted content exceeding 15 words
        import re
        quoted_segments = re.findall(r'["\']([^"\']+)["\']', what_author_does)
        for seg in quoted_segments:
            word_count = len(seg.split())
            if word_count > 15:
                issues.append(f"{point_id}: Quoted segment exceeds 15 words ({word_count} words): '{seg[:50]}...'")
        
        # Check for generic language
        generic_terms = ['good', 'better', 'great', 'effective', 'powerful', 'nice', 'interesting']
        how_it_works = point.get('howItWorks', '').lower()
        found_generic = [term for term in generic_terms if term in how_it_works]
        
        if found_generic:
            warnings.append(f"{point_id}: Uses generic language in 'howItWorks': {found_generic}")
        
        # Check application specificity
        application = point.get('studentApplication', '')
        if len(application) < 100:
            warnings.append(f"{point_id}: Student application is brief ({len(application)} chars, recommend 150+)")
        
        if 'try' in application.lower() and 'your' not in application.lower():
            warnings.append(f"{point_id}: Application not contextualized to student's story")
    
    # Determine overall quality
    quality_score = 'pass' if len(issues) == 0 else 'fail'
    if len(warnings) > 5:
        quality_score = 'review_recommended'
    
    return {
        'quality': quality_score,
        'issues': issues,
        'warnings': warnings,
        'teachingPointCount': len(teaching_points),
        'passesValidation': len(issues) == 0
    }
