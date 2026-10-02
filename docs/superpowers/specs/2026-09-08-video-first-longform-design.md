# Video-First Long-Form Quality Design

**Goal:** Make Normal mode use substantially more relevant motion footage in long YouTube videos while rejecting misleading clips and preserving restrained, story-aware transitions.

## Decisions

Normal and AI-assisted archive modes search both still and motion archives for video-eligible scenes. Portraits, documents, maps, charts and explicit photograph requests stay image-first. A video can displace the best still only when its metadata relevance is verified, its quality is usable, and its score is close enough to the best candidate. There is no quota that can force an unrelated video into the edit.

Downloaded videos are audited as one contact sheet containing early, middle and late frames. The vision result describes aggregate relevance and quality plus flow direction. A clip whose later frames leave the narrated subject receives a low consistency score and enters the existing replacement path. Stills keep the existing one-frame audit.

Transition planning consumes the verified flow direction. Directional slide transitions follow the incoming clip; conflicting strong motion falls back to a dissolve. Most cuts remain hard cuts, and section transitions retain the genre palette. This avoids effect repetition and preserves sync-neutral frame accounting.

Every render writes measurable visual coverage into `visual-quality.json`: video seconds/percentage, verified relevance, repeated sources, card/typography scenes and transition distribution. A long Normal-mode video below 45% motion coverage receives a review warning, never an automatic substitution with weaker media.

## Failure handling

If a motion archive is unavailable, the existing high-relevance still path remains valid. If multi-frame extraction fails, the auditor falls back to a middle frame and marks flow unknown. If the vision provider fails, the existing explicit audit warning remains. No provider failure can silently certify a clip.

## Verification

Tests cover video eligibility, relevance-gated promotion, multi-frame sampling and contact-sheet extraction, motion-aware transitions, a 12-minute/144-scene timeline, visual-quality reporting, and the existing complete quality suite. Provider calls use isolated fixtures; no paid generation or ElevenLabs request is part of verification.

