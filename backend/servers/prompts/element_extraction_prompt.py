"""
Story element extraction prompt for DeepSeek API.
Analyzes creative writing conversations to extract structured story information.
"""

STORY_EXTRACTION_PROMPT = """You are analyzing a creative writing conversation between a student (aged 12-18) and an AI writing coach. Your task is to extract comprehensive structured information about the student's story idea for book recommendations.

Conversation History:
{conversation_text}

Extract the following information and return as JSON:

{{
  "genre": {{
    "primary": "main genre (fantasy, sci-fi, contemporary realistic, historical fiction, mystery, thriller, horror, romance, adventure, etc.)",
    "confidence": 0.0-1.0
  }},
  "subgenres": [
    {{
      "name": "specific subgenre (urban fantasy, space opera, coming-of-age, psychological thriller, etc.)",
      "confidence": 0.0-1.0
    }}
  ],
  "themes": [
    {{
      "name": "major theme (identity, power, love, betrayal, redemption, revenge, justice, freedom, etc.)",
      "description": "brief context of how this theme appears in the story",
      "prominence": "primary" | "secondary" | "minor",
      "confidence": 0.0-1.0
    }}
  ],
  "motifs": [
    {{
      "name": "recurring element (mirrors, masks, storms, blood, light/darkness, etc.)",
      "description": "how this motif is used symbolically",
      "confidence": 0.0-1.0
    }}
  ],
  "characterArchetypes": [
    {{
      "archetype": "character type (hero, mentor, shadow, trickster, herald, threshold guardian, shapeshifter, ally, etc.)",
      "role": "protagonist" | "antagonist" | "supporting",
      "description": "brief character context from conversation",
      "confidence": 0.0-1.0
    }}
  ],
  "plotStructure": {{
    "primaryStructure": "main narrative pattern (hero's journey, three-act, five-act, in medias res, circular, episodic, etc.)",
    "elements": [
      "specific plot elements mentioned (inciting incident, rising action, climax, resolution, etc.)"
    ],
    "pacing": "fast-paced" | "moderate" | "slow-burn" | "mixed" | "unknown",
    "confidence": 0.0-1.0
  }},
  "tone": {{
    "primary": "dominant mood (dark, light, whimsical, serious, humorous, melancholic, hopeful, cynical, optimistic, etc.)",
    "secondary": ["additional tones if mixed"],
    "atmosphere": "overall feel (suspenseful, cozy, oppressive, adventurous, intimate, epic, etc.)",
    "confidence": 0.0-1.0
  }},
  "settingType": {{
    "temporal": "time period (contemporary, historical 1920s, medieval, futuristic 2150, etc.)",
    "spatial": "primary location type (urban, rural, fantasy realm, space station, underwater, etc.)",
    "worldbuilding": "level of world complexity (low/realistic, moderate/historical, high/fantastical)",
    "confidence": 0.0-1.0
  }},
  "narrativePerspective": {{
    "pov": "first-person" | "second-person" | "third-person limited" | "third-person omniscient" | "multiple POV" | "unknown",
    "tense": "past" | "present" | "future" | "mixed" | "unknown",
    "confidence": 0.0-1.0
  }},
  "conflicts": [
    {{
      "type": "internal" | "external",
      "category": "character vs self" | "character vs character" | "character vs society" | "character vs nature" | "character vs technology" | "character vs fate",
      "description": "specific conflict from conversation",
      "centrality": "primary" | "secondary",
      "confidence": 0.0-1.0
    }}
  ],
  "ageAppropriate": {{
    "targetAge": "8-10" | "10-12" | "12-14" | "14-16" | "16-18" | "18+",
    "contentWarnings": ["potential sensitive topics (violence, death, substance use, etc.)"],
    "readingLevel": "early middle grade" | "middle grade" | "young adult" | "new adult" | "adult",
    "confidence": 0.0-1.0
  }},
  "emotionalCore": {{
    "centralEmotion": "primary emotional journey (grief, joy, fear, hope, anger, love, etc.)",
    "characterGrowth": "type of character arc (positive change, negative change, flat/steadfast, etc.)",
    "confidence": 0.0-1.0
  }},
  "overallConfidence": 0.0-1.0
}}

EXTRACTION GUIDELINES:

1. SOURCE PRIORITY:
   - Extract ONLY from student messages, not AI coach suggestions
   - Prioritize explicit statements over implications
   - If student mentions multiple story ideas, focus on the most developed one
   - Use recent messages (last 5-7) as primary source, earlier for context

2. CONFIDENCE SCORING:
   - 0.9-1.0: Explicitly stated multiple times with clear details
   - 0.7-0.9: Clearly described at least once with supporting context
   - 0.5-0.7: Mentioned or implied with some supporting evidence
   - 0.3-0.5: Weakly implied or inferred from limited context
   - 0.1-0.3: Speculative guess based on minimal information
   - Overall confidence: weighted average based on key elements (genre, themes, characters)

3. HANDLING UNCERTAINTY:
   - For vague/early-stage ideas: use broader categories with lower confidence
   - Return empty arrays [] for elements with no information
   - Mark "unknown" for structural elements not discussed
   - DO NOT invent details not present in conversation
   - If confidence < 0.3 for critical elements, note this in overall confidence

4. THEMATIC DEPTH:
   - Distinguish between themes (abstract concepts) and motifs (concrete recurring elements)
   - Mark theme prominence based on conversation emphasis
   - Include theme descriptions that reference student's specific context
   - Identify both explicit themes and subtextual patterns

5. CHARACTER ANALYSIS:
   - Use established archetypes (Hero's Journey, Jungian, etc.)
   - Distinguish protagonist/antagonist/supporting roles
   - Note character relationships when mentioned
   - Identify character motivations if discussed

6. PLOT STRUCTURE:
   - Identify narrative framework if student describes sequence of events
   - Note pacing based on student's description style (rushed vs. detailed)
   - Mark specific plot beats only if explicitly mentioned
   - Distinguish between planned structure and emerging structure

7. TONE & ATMOSPHERE:
   - Tone: emotional quality of the narrative voice
   - Atmosphere: sensory/emotional environment of the setting
   - Allow for mixed tones (e.g., "darkly humorous")
   - Reference specific language student uses to describe mood

8. AGE APPROPRIATENESS:
   - Infer target age from content, themes, and complexity
   - Flag potential content warnings based on themes/conflicts
   - Match reading level to narrative sophistication
   - Consider maturity of themes vs. prose complexity

9. SPECIAL CASES:
   - Genre blends: list up to 3 subgenres with confidence scores
   - Experimental structures: note in plotStructure.elements
   - Unreliable narrators: mark in narrativePerspective
   - Multiple POVs: list all mentioned in characterArchetypes
   - Anthology/episodic: note in plotStructure.primaryStructure

VALIDATION CHECKS:
- Genre confidence should be highest (most identifiable element)
- At least 1 theme with confidence > 0.5
- At least 1 character archetype if characters discussed
- Conflict types should align with genre conventions
- Overall confidence ≥ 0.5 for actionable recommendations
- If overall confidence < 0.5, note: "conversation too vague for reliable extraction"

OUTPUT FORMAT:
- Return ONLY valid JSON (no markdown, no preamble, no explanation)
- All confidence scores must be floats between 0.0 and 1.0
- Empty arrays [] for missing elements, not null
- Use "unknown" string for undetermined structural elements
- Ensure all required fields are present

EXAMPLE MINIMAL OUTPUT (for very early conversation):
{{
  "genre": {{"primary": "fantasy", "confidence": 0.6}},
  "subgenres": [{{"name": "coming-of-age", "confidence": 0.5}}],
  "themes": [{{"name": "identity", "description": "protagonist discovering magical heritage", "prominence": "primary", "confidence": 0.7}}],
  "motifs": [],
  "characterArchetypes": [{{"archetype": "hero", "role": "protagonist", "description": "young person with hidden powers", "confidence": 0.6}}],
  "plotStructure": {{"primaryStructure": "hero's journey", "elements": ["call to adventure"], "pacing": "unknown", "confidence": 0.4}},
  "tone": {{"primary": "serious", "secondary": [], "atmosphere": "mysterious", "confidence": 0.5}},
  "settingType": {{"temporal": "contemporary", "spatial": "urban", "worldbuilding": "moderate/hidden magical", "confidence": 0.5}},
  "narrativePerspective": {{"pov": "unknown", "tense": "unknown", "confidence": 0.0}},
  "conflicts": [{{"type": "internal", "category": "character vs self", "description": "accepting magical identity", "centrality": "primary", "confidence": 0.6}}],
  "ageAppropriate": {{"targetAge": "12-16", "contentWarnings": [], "readingLevel": "young adult", "confidence": 0.6}},
  "emotionalCore": {{"centralEmotion": "fear", "characterGrowth": "positive change", "confidence": 0.5}},
  "overallConfidence": 0.52
}}

Remember: Quality over quantity. Better to have fewer elements with high confidence than many with low confidence.
"""