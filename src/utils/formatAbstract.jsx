import React from 'react';

/**
 * Formats a structured abstract (like PubMed) with bold section labels and proper spacing
 * Handles both structured abstracts (IMPORTANCE:, OBJECTIVE:, etc.) and non-structured abstracts
 * 
 * @param {string} abstract - The abstract text
 * @returns {JSX.Element} - Formatted abstract with bold labels and proper spacing
 */
export function formatAbstract(abstract) {
  if (!abstract) return null;

  // Pattern to match structured abstract sections (ALL CAPS word(s) followed by colon)
  // Examples: "IMPORTANCE:", "OBJECTIVE:", "DESIGN, SETTING, AND PARTICIPANTS:", etc.
  // Matches: one or more words in ALL CAPS (with spaces, commas, &, and optional colons) followed by a colon and space
  const sectionPattern = /([A-Z][A-Z0-9\s,&]+?):\s+/g;
  
  // Split the abstract into sections
  const sections = [];
  let match;
  
  // Find all section headers
  const sectionHeaders = [];
  while ((match = sectionPattern.exec(abstract)) !== null) {
    sectionHeaders.push({
      label: match[1].trim(),
      index: match.index,
      fullMatch: match[0]
    });
  }
  
  // If no structured sections found, return as plain text
  if (sectionHeaders.length === 0) {
    return (
      <div className="text-slate-700 leading-relaxed whitespace-pre-line">
        {abstract}
      </div>
    );
  }
  
  // Extract sections with their labels and content
  for (let i = 0; i < sectionHeaders.length; i++) {
    const header = sectionHeaders[i];
    const nextHeader = sectionHeaders[i + 1];
    
    // Get content between this header and the next (or end of abstract)
    const contentStart = header.index + header.fullMatch.length;
    const contentEnd = nextHeader ? nextHeader.index : abstract.length;
    const content = abstract.substring(contentStart, contentEnd).trim();
    
    sections.push({
      label: header.label,
      content: content
    });
  }
  
  // Render sections with formatting
  return (
    <div className="text-slate-700 leading-relaxed space-y-3">
      {sections.map((section, index) => (
        <div key={index} className="first:mt-0">
          <span className="font-bold text-slate-900">{section.label}:</span>{' '}
          <span>{section.content}</span>
        </div>
      ))}
    </div>
  );
}

