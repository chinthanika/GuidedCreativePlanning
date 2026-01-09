import React from 'react';
import { BookOpen, Lightbulb } from 'lucide-react';

const MentorTextCard = ({ analysis, onOpenDetail }) => {
    // Truncate excerpt for card display
    const truncatedExcerpt = analysis.excerpt?.length > 200 
        ? analysis.excerpt.substring(0, 200) + '...'
        : analysis.excerpt;

    return (
        <div 
            className="mentor-text-card"
            onClick={() => onOpenDetail(analysis)}
        >
            <div className="mentor-text-card-header">
                <div className="mentor-text-genre-badge">
                    📖 {analysis.genreIdentified || 'General Fiction'}
                </div>
                <div className="mentor-text-focus-badge">
                    {analysis.focus?.replace(/_/g, ' ') || 'general'}
                </div>
            </div>

            <div className="mentor-text-card-excerpt">
                <p>{truncatedExcerpt}</p>
            </div>

            <div className="mentor-text-card-footer">
                <div className="mentor-text-stats">
                    <div className="mentor-text-stat">
                        <Lightbulb className="w-4 h-4" />
                        <span>{analysis.teachingPointCount || 0} teaching points</span>
                    </div>
                    <div className="mentor-text-stat">
                        <BookOpen className="w-4 h-4" />
                        <span>{analysis.fullExcerptLength || 0} chars</span>
                    </div>
                </div>

                {analysis.overallLesson && (
                    <div className="mentor-text-lesson-preview">
                        <strong>Key Lesson:</strong> {analysis.overallLesson.substring(0, 80)}
                        {analysis.overallLesson.length > 80 && '...'}
                    </div>
                )}
            </div>

            <div className="mentor-text-card-hint">
                Click to view full analysis →
            </div>
        </div>
    );
};

export default MentorTextCard;